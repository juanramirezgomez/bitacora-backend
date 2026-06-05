import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Bitacora from "../models/Bitacora.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import User from "../models/user.js";
import LoginAudit from "../models/LoginAudit.js";
import { registrarEvento } from "../services/operationalAuditService.js";
import { validarChecklistDiario } from "../services/checklistComplianceService.js";

const MS_DIA = 24 * 60 * 60 * 1000;
const ALERTAS_ACTIVAS = ["ABIERTA", "ASIGNADA", "EN_PROCESO"];

const inicioDia = (fecha = new Date()) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const finDia = (fecha = new Date()) => {
  const d = inicioDia(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (fecha, days) => {
  const d = new Date(fecha);
  d.setDate(d.getDate() + days);
  return d;
};

const rango = (fecha = new Date(), dias = 0) => {
  const end = finDia(fecha);
  const start = inicioDia(addDays(end, -dias));
  return { start, end };
};

const fmtFecha = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const fechaFiltro = (campo, start, end) => ({ [campo]: { $gte: start, $lte: end } });

const baseChecklist = { eliminado: { $ne: true } };
const baseBitacora = { eliminado: { $ne: true } };

const normalizarCriticidad = (prioridad = "") => {
  const value = String(prioridad || "").toUpperCase();
  if (value === "CRITICA") return "CRITICA";
  if (value === "ALTA" || value === "MEDIA") return "MEDIA";
  return "MENOR";
};

const obtenerConteoAlertasPorEstado = async () => {
  const rows = await AlertaCamioneta.aggregate([
    { $match: { activo: { $ne: false } } },
    { $group: { _id: "$estado", total: { $sum: 1 } } }
  ]);
  const map = Object.fromEntries(rows.map((item) => [item._id || "SIN_ESTADO", item.total]));
  return {
    ABIERTA: map.ABIERTA || 0,
    ASIGNADA: map.ASIGNADA || 0,
    EN_PROCESO: map.EN_PROCESO || 0,
    RESUELTA: map.RESUELTA || 0,
    CERRADA: map.CERRADA || 0
  };
};

const obtenerCriticidadAlertas = async () => {
  const rows = await AlertaCamioneta.find({ activo: { $ne: false }, estado: { $in: ALERTAS_ACTIVAS } })
    .select("prioridad")
    .lean();
  const result = { CRITICA: 0, MEDIA: 0, MENOR: 0 };
  for (const alerta of rows) result[normalizarCriticidad(alerta.prioridad)] += 1;
  return result;
};

const obtenerResponsables = async () => {
  const alertas = await AlertaCamioneta.find({
    activo: { $ne: false },
    responsableNombre: { $nin: [null, ""] }
  })
    .select("responsableNombre responsableRol estado fechaAsignacion fechaCierre fechaResolucion")
    .lean();

  const map = new Map();
  for (const alerta of alertas) {
    const nombre = alerta.responsableNombre || "Sin responsable";
    const actual = map.get(nombre) || {
      responsable: nombre,
      rol: alerta.responsableRol || "",
      asignadas: 0,
      resueltas: 0,
      abiertas: 0,
      cierresHoras: []
    };
    actual.asignadas += 1;
    if (["RESUELTA", "CERRADA"].includes(alerta.estado)) actual.resueltas += 1;
    if (ALERTAS_ACTIVAS.includes(alerta.estado)) actual.abiertas += 1;
    const fechaFin = alerta.fechaCierre || alerta.fechaResolucion;
    if (alerta.fechaAsignacion && fechaFin) {
      actual.cierresHoras.push(Math.max(0, (new Date(fechaFin) - new Date(alerta.fechaAsignacion)) / (60 * 60 * 1000)));
    }
    map.set(nombre, actual);
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      tiempoPromedioCierreHoras: item.cierresHoras.length
        ? Math.round(item.cierresHoras.reduce((sum, value) => sum + value, 0) / item.cierresHoras.length)
        : 0
    }))
    .sort((a, b) => b.asignadas - a.asignadas)
    .slice(0, 8);
};

const obtenerTurnos = async ({ start, end }) => {
  const turnos = ["39", "44"];
  const result = [];
  for (const turno of turnos) {
    const [bitacoras, checklist, alertas] = await Promise.all([
      Bitacora.countDocuments({ ...baseBitacora, turnoNumero: turno, ...fechaFiltro("fechaInicio", start, end) }),
      ChecklistCamioneta.countDocuments({ ...baseChecklist, turnoNumero: turno, ...fechaFiltro("fechaCreacion", start, end) }),
      AlertaCamioneta.aggregate([
        { $match: { activo: { $ne: false }, estado: { $in: ALERTAS_ACTIVAS }, ...fechaFiltro("fechaCreacion", start, end) } },
        {
          $lookup: {
            from: "checklistcamionetas",
            localField: "checklistId",
            foreignField: "_id",
            as: "checklist"
          }
        },
        { $unwind: "$checklist" },
        { $match: { "checklist.turnoNumero": turno } },
        { $count: "total" }
      ]).then((rows) => rows[0]?.total || 0)
    ]);
    result.push({ turnoNumero: turno, bitacoras, checklist, alertas });
  }
  return result;
};

const buildDashboardData = async () => {
  const inicio = Date.now();
  const hoy = rango(new Date(), 0);
  const semana = rango(new Date(), 6);
  const mes = rango(new Date(), 29);
  const ahora = new Date();
  const compliance = await validarChecklistDiario({ fecha: ahora });

  const [
    bitacorasHoy,
    checklistHoy,
    alertasAbiertas,
    alertasCriticas,
    alertasEscaladas,
    usuariosActivos,
    bitacorasAbiertas,
    bitacorasCerradas,
    ultimaBitacora,
    operadoresConectadosIds,
    bitacorasDia,
    bitacorasSemana,
    bitacorasMes,
    alertasEstados,
    alertasCriticidad,
    topAlertas,
    responsables,
    turnos
  ] = await Promise.all([
    Bitacora.countDocuments({ ...baseBitacora, ...fechaFiltro("fechaInicio", hoy.start, hoy.end) }),
    ChecklistCamioneta.countDocuments({ ...baseChecklist, ...fechaFiltro("fechaCreacion", hoy.start, hoy.end) }),
    AlertaCamioneta.countDocuments({ activo: { $ne: false }, estado: { $in: ALERTAS_ACTIVAS } }),
    AlertaCamioneta.countDocuments({ activo: { $ne: false }, prioridad: "CRITICA", estado: { $in: ALERTAS_ACTIVAS } }),
    AlertaCamioneta.countDocuments({ activo: { $ne: false }, escalada: true, estado: { $in: ALERTAS_ACTIVAS } }),
    User.countDocuments({ activo: true, estado: "ACTIVO" }),
    Bitacora.countDocuments({ ...baseBitacora, estado: "ABIERTA" }),
    Bitacora.countDocuments({ ...baseBitacora, estado: "CERRADA", ...fechaFiltro("fechaCierre", hoy.start, hoy.end) }),
    Bitacora.findOne(baseBitacora).select("operador turno turnoNumero estado fechaInicio fechaCierre").sort({ fechaInicio: -1 }).lean(),
    LoginAudit.distinct("usuarioId", {
      accion: "LOGIN_EXITOSO",
      resultado: "OK",
      rol: { $in: ["OPERADOR_CALDERA", "OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"] },
      fecha: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }
    }),
    Bitacora.countDocuments({ ...baseBitacora, ...fechaFiltro("fechaInicio", hoy.start, hoy.end) }),
    Bitacora.countDocuments({ ...baseBitacora, ...fechaFiltro("fechaInicio", semana.start, semana.end) }),
    Bitacora.countDocuments({ ...baseBitacora, ...fechaFiltro("fechaInicio", mes.start, mes.end) }),
    obtenerConteoAlertasPorEstado(),
    obtenerCriticidadAlertas(),
    AlertaCamioneta.find({ activo: { $ne: false }, estado: { $in: ALERTAS_ACTIVAS } })
      .select("patente tipo descripcion prioridad estado responsableNombre fechaCreacion escalada")
      .sort({ prioridad: 1, fechaCreacion: -1 })
      .limit(8)
      .lean(),
    obtenerResponsables(),
    obtenerTurnos({ start: hoy.start, end: hoy.end })
  ]);

  const mapaEstadoOperacional = compliance.vehiculos.map((vehiculo) => {
    let estado = "OPERATIVO";
    if (vehiculo.noApto) estado = "NO_APTO";
    else if (vehiculo.estadoCumplimiento === "PENDIENTE") estado = "CON_ALERTAS";
    else if (vehiculo.atrasado) estado = "CON_OBSERVACIONES";
    return {
      patente: vehiculo.patente,
      area: vehiculo.area || vehiculo.planta || "PC1",
      estado,
      ultimoChecklist: vehiculo.fechaRealizacion || null,
      checklistId: vehiculo.checklistId,
      motivo: vehiculo.motivoNoApto || ""
    };
  });

  const cumplimientoOperacional = compliance.resumen?.cumplimiento?.hoy ?? compliance.cumplimiento?.hoy ?? 0;

  const data = {
    actualizadoEn: new Date(),
    refrescoMs: 3600000,
    kpis: {
      bitacorasCalderaHoy: bitacorasHoy,
      checklistCamionetasHoy: checklistHoy,
      alertasAbiertas,
      alertasCriticas,
      vehiculosNoAptos: compliance.vehiculosNoAptos ?? compliance.resumen?.vehiculosNoAptos ?? 0,
      cumplimientoOperacional,
      alertasEscaladas,
      usuariosActivos
    },
    bitacoraCaldera: {
      abiertas: bitacorasAbiertas,
      cerradas: bitacorasCerradas,
      turnosActivos: bitacorasAbiertas,
      operadoresConectados: operadoresConectadosIds.filter(Boolean).length,
      ultimaBitacora,
      ultimaActualizacion: new Date(),
      indicadores: { dia: bitacorasDia, semana: bitacorasSemana, mes: bitacorasMes }
    },
    checklistCamionetas: {
      realizadosHoy: compliance.checklistRealizadosHoy,
      pendientes: compliance.checklistPendientesHoy,
      atrasados: compliance.checklistAtrasados,
      vehiculosNoAptos: compliance.vehiculosNoAptos,
      cumplimientoDiario: compliance.cumplimiento?.hoy || 0,
      cumplimientoSemanal: compliance.cumplimiento?.semana || 0,
      cumplimientoMensual: compliance.cumplimiento?.mes || 0,
      patentesPendientes: compliance.vehiculos
        .filter((item) => item.estadoCumplimiento === "PENDIENTE")
        .map((item) => item.patente)
    },
    alertas: {
      estados: alertasEstados,
      criticidad: alertasCriticidad,
      topActivas: topAlertas
    },
    responsables,
    turnos,
    mapaEstadoOperacional,
    performanceMs: Date.now() - inicio
  };

  return data;
};

export const obtenerDashboardEjecutivo = async (req, res) => {
  try {
    console.log("DASHBOARD EJECUTIVO REQUEST");
    const data = await buildDashboardData();
    await registrarEvento({
      req,
      modulo: "DASHBOARD_EJECUTIVO",
      entidad: "DashboardEjecutivo",
      accion: "DASHBOARD_EJECUTIVO_CONSULTADO",
      observacion: `Dashboard ejecutivo consultado en ${data.performanceMs}ms`
    });
    return res.json(data);
  } catch (error) {
    console.error("ERROR DASHBOARD EJECUTIVO:", error);
    return res.status(500).json({ message: "Error cargando dashboard ejecutivo operacional" });
  }
};

export const descargarDashboardEjecutivoPdf = async (req, res) => {
  try {
    const data = await buildDashboardData();
    await registrarEvento({
      req,
      modulo: "DASHBOARD_EJECUTIVO",
      entidad: "DashboardEjecutivo",
      accion: "DASHBOARD_EJECUTIVO_DESCARGADO",
      observacion: "Dashboard ejecutivo descargado en PDF"
    });

    const doc = new PDFDocument({ size: "A4", margin: 34 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=dashboard-ejecutivo-operacional.pdf");
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 90).fill("#111827");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text("NOVANDINO | DASHBOARD EJECUTIVO OPERACIONAL", 34, 28);
    doc.fillColor("#c7d2fe").font("Helvetica").fontSize(9).text(`Generado: ${fmtFecha(data.actualizadoEn)}`, 34, 54);

    let y = 112;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("KPIs principales", 34, y);
    y += 18;
    const kpis = [
      ["Bitacoras hoy", data.kpis.bitacorasCalderaHoy],
      ["Checklist hoy", data.kpis.checklistCamionetasHoy],
      ["Alertas abiertas", data.kpis.alertasAbiertas],
      ["Alertas criticas", data.kpis.alertasCriticas],
      ["Vehiculos no aptos", data.kpis.vehiculosNoAptos],
      ["Cumplimiento %", `${data.kpis.cumplimientoOperacional}%`],
      ["Alertas escaladas", data.kpis.alertasEscaladas],
      ["Usuarios activos", data.kpis.usuariosActivos]
    ];
    for (const [label, value] of kpis) {
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(`${label}: ${value}`, 42, y);
      y += 14;
    }

    y += 16;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Top alertas activas", 34, y);
    y += 16;
    const alertas = data.alertas.topActivas.length ? data.alertas.topActivas : [{ patente: "-", tipo: "Sin alertas", estado: "-" }];
    for (const alerta of alertas) {
      doc.fillColor("#111827").font("Helvetica").fontSize(8)
        .text(`${alerta.patente || "-"} | ${alerta.tipo || "-"} | ${alerta.prioridad || "-"} | ${alerta.estado || "-"}`, 42, y, { width: 520 });
      y += 13;
    }

    y += 16;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Estado operacional vehiculos", 34, y);
    y += 16;
    for (const vehiculo of data.mapaEstadoOperacional.slice(0, 18)) {
      doc.fillColor("#111827").font("Helvetica").fontSize(8)
        .text(`${vehiculo.patente} | ${vehiculo.area} | ${vehiculo.estado} | ${fmtFecha(vehiculo.ultimoChecklist)}`, 42, y);
      y += 12;
    }

    doc.end();
  } catch (error) {
    console.error("ERROR PDF DASHBOARD EJECUTIVO:", error);
    return res.status(500).json({ message: "Error descargando PDF ejecutivo operacional" });
  }
};

export const descargarDashboardEjecutivoExcel = async (req, res) => {
  try {
    const data = await buildDashboardData();
    await registrarEvento({
      req,
      modulo: "DASHBOARD_EJECUTIVO",
      entidad: "DashboardEjecutivo",
      accion: "DASHBOARD_EJECUTIVO_DESCARGADO",
      observacion: "Dashboard ejecutivo descargado en Excel"
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Operaciones Litio";
    const ws = workbook.addWorksheet("Dashboard Ejecutivo");
    ws.columns = [
      { header: "Indicador", key: "indicador", width: 34 },
      { header: "Valor", key: "valor", width: 20 }
    ];
    Object.entries(data.kpis).forEach(([indicador, valor]) => ws.addRow({ indicador, valor }));

    const alertasWs = workbook.addWorksheet("Alertas activas");
    alertasWs.columns = [
      { header: "Patente", key: "patente", width: 16 },
      { header: "Tipo", key: "tipo", width: 28 },
      { header: "Prioridad", key: "prioridad", width: 14 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Responsable", key: "responsableNombre", width: 28 }
    ];
    data.alertas.topActivas.forEach((alerta) => alertasWs.addRow(alerta));

    const flotaWs = workbook.addWorksheet("Mapa operacional");
    flotaWs.columns = [
      { header: "Patente", key: "patente", width: 16 },
      { header: "Area", key: "area", width: 24 },
      { header: "Estado", key: "estado", width: 18 },
      { header: "Ultimo checklist", key: "ultimoChecklist", width: 24 },
      { header: "Motivo", key: "motivo", width: 36 }
    ];
    data.mapaEstadoOperacional.forEach((item) => flotaWs.addRow({
      ...item,
      ultimoChecklist: item.ultimoChecklist ? fmtFecha(item.ultimoChecklist) : "-"
    }));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=dashboard-ejecutivo-operacional.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("ERROR EXCEL DASHBOARD EJECUTIVO:", error);
    return res.status(500).json({ message: "Error descargando Excel ejecutivo operacional" });
  }
};
