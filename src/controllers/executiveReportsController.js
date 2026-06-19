import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import Bitacora from "../models/Bitacora.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import User from "../models/user.js";
import LoginAudit from "../models/LoginAudit.js";
import OperationalAudit from "../models/OperationalAudit.js";
import RegistroDatos from "../models/RegistroDatos.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const MS_DIA = 24 * 60 * 60 * 1000;

const inicioDia = (fecha) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const finDia = (fecha) => {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
};

const rangoReporte = (tipo = "semanal", fechaBase = new Date()) => {
  const base = inicioDia(fechaBase);
  const tipoNormalizado = String(tipo || "semanal").toLowerCase();

  if (tipoNormalizado === "mensual") {
    const inicio = new Date(base.getFullYear(), base.getMonth(), 1);
    const fin = finDia(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    const inicioAnterior = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const finAnterior = finDia(new Date(base.getFullYear(), base.getMonth(), 0));
    return { tipo: "mensual", inicio, fin, inicioAnterior, finAnterior };
  }

  const day = base.getDay();
  const diffLunes = day === 0 ? -6 : 1 - day;
  const inicio = new Date(base.getTime() + diffLunes * MS_DIA);
  const fin = finDia(new Date(inicio.getTime() + 6 * MS_DIA));
  const inicioAnterior = new Date(inicio.getTime() - 7 * MS_DIA);
  const finAnterior = finDia(new Date(inicio.getTime() - MS_DIA));
  return { tipo: "semanal", inicio, fin, inicioAnterior, finAnterior };
};

const fechaFiltro = (campo, inicio, fin) => ({ [campo]: { $gte: inicio, $lte: fin } });

const pct = (actual, anterior) => {
  if (!anterior && !actual) return 0;
  if (!anterior) return 100;
  return Math.round(((actual - anterior) / anterior) * 100);
};

const pctCumplimiento = (realizados, esperados) => esperados ? Math.min(100, Math.round((realizados / esperados) * 100)) : 100;

const diasEntre = (inicio, fin = new Date()) => {
  if (!inicio) return 0;
  const start = new Date(inicio);
  const end = new Date(fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / MS_DIA));
};

const fechaChecklist = (item = {}) => item.fechaInspeccion || item.fechaRealizacion || item.fechaCreacion || item.createdAt;

const checklistEsperadosPeriodo = (inicio, fin) => {
  const dias = Math.max(1, Math.floor((inicioDia(fin).getTime() - inicioDia(inicio).getTime()) / MS_DIA) + 1);
  return dias * 2;
};

const buildWeekRanges = (base = new Date(), count = 12) => {
  const end = finDia(base);
  return Array.from({ length: count }, (_, index) => {
    const weekEnd = finDia(new Date(end.getTime() - (count - 1 - index) * 7 * MS_DIA));
    const weekStart = inicioDia(new Date(weekEnd.getTime() - 6 * MS_DIA));
    return {
      inicio: weekStart,
      fin: weekEnd,
      label: `${fmtFecha(weekStart).slice(0, 5)}`
    };
  });
};

const contarPorSemanas = (items = [], campoFecha = "fechaCreacion", weeks = []) =>
  weeks.map((week) => ({
    label: week.label,
    total: items.filter((item) => {
      const date = new Date(item[campoFecha] || item.fecha || item.createdAt || 0);
      return !Number.isNaN(date.getTime()) && date >= week.inicio && date <= week.fin;
    }).length
  }));

const dedupeAlertasPeriodo = (alertas = []) => {
  const map = new Map();
  for (const alerta of alertas) {
    const key = [
      String(alerta.patente || "").toUpperCase(),
      String(alerta.tipo || "").toUpperCase(),
      String(alerta.prioridad || "").toUpperCase(),
      String(alerta.descripcion || "").slice(0, 80).toUpperCase()
    ].join("|");
    const current = map.get(key);
    if (!current || new Date(alerta.fechaCreacion || alerta.createdAt) < new Date(current.fechaCreacion || current.createdAt)) {
      map.set(key, alerta);
    }
  }
  return Array.from(map.values()).map((alerta) => ({
    fecha: alerta.fechaCreacion || alerta.createdAt,
    patente: alerta.patente || "-",
    tipo: alerta.tipo || "Alerta operacional",
    criticidad: alerta.prioridad || "MEDIA",
    estado: alerta.estado || "ABIERTA",
    diasAcumulados: diasEntre(alerta.fechaCreacion || alerta.createdAt, alerta.fechaCierre || new Date()),
    descripcion: alerta.descripcion || ""
  }));
};

const estadoGeneralFlota = (checklist = {}, alertasActivas = []) => {
  const noApto = checklist.aptaOperacion === false || String(checklist.aptitudOperacion || "").toUpperCase() === "NO_APTA";
  const alertaCritica = alertasActivas.some((alerta) => String(alerta.prioridad || "").toUpperCase() === "CRITICA");
  if (noApto || alertaCritica) return "No apto";
  if (alertasActivas.length) return "Requiere seguimiento";
  return "Operativo";
};

const buildHallazgos = ({ alertasPendientes = [], vehiculosNoAptos = [], documentosPorVencer90 = [], cumplimiento = {} }) => {
  const hallazgos = [];
  const criticas = alertasPendientes.filter((alerta) => alerta.prioridad === "CRITICA").length;
  if (criticas) hallazgos.push(`${criticas} alertas criticas activas requieren seguimiento prioritario.`);
  if (vehiculosNoAptos.length) hallazgos.push(`${vehiculosNoAptos.length} vehiculos se encuentran NO aptos para operacion.`);
  const docs30 = documentosPorVencer90.filter((doc) => doc.diasRestantes <= 30).length;
  if (docs30) hallazgos.push(`${docs30} documentos vencen dentro de los proximos 30 dias.`);
  if ((cumplimiento.mes?.porcentaje || 0) < 90) hallazgos.push(`Cumplimiento mensual bajo meta operacional: ${cumplimiento.mes?.porcentaje || 0}%.`);
  if (!hallazgos.length) hallazgos.push("No se detectan eventos relevantes fuera de control durante el periodo.");
  return hallazgos;
};

const topPorCampo = async (Model, match, campo, limit = 10) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${campo}`, total: { $sum: 1 } } },
    { $match: { _id: { $nin: [null, ""] } } },
    { $sort: { total: -1 } },
    { $limit: limit }
  ]);
  return rows.map((item) => ({ nombre: String(item._id), total: item.total }));
};

const buildResumenEjecutivo = ({ tipo, kpis, comparacion }) => {
  const periodo = tipo === "mensual" ? "mes" : "semana";
  const tendenciaAlertas = comparacion.alertas.delta <= 0 ? "disminucion" : "aumento";
  return `Durante la ${periodo} se registraron ${kpis.checklistGenerados} checklist de camioneta, ${kpis.vehiculosNoAptos} vehiculos NO aptos y ${kpis.alertasGeneradas} alertas operacionales. Se observa una ${tendenciaAlertas} de alertas respecto al periodo anterior y un cumplimiento operacional controlado en base a 2 checklist esperados por dia.`;
};

const obtenerReporteData = async ({ tipo = "semanal", fecha = null }) => {
  const base = fecha ? new Date(`${fecha}T12:00:00`) : new Date();
  const rango = rangoReporte(tipo, base);
  const { inicio, fin, inicioAnterior, finAnterior } = rango;
  const ahora = new Date();
  const proximos30 = new Date(ahora.getTime() + 30 * MS_DIA);

  const checklistBase = { eliminado: { $ne: true } };
  const bitacoraBase = { eliminado: { $ne: true } };

  const [
    bitacorasGeneradas,
    bitacorasCerradas,
    checklistGenerados,
    checklistFinalizados,
    checklistRevisados,
    alertasAbiertas,
    alertasResueltas,
    alertasCerradas,
    alertasCriticasPendientes,
    usuariosActivos,
    loginExitosos,
    loginFallidos,
    bitacorasGeneradasPrev,
    checklistGeneradosPrev,
    alertasAbiertasPrev,
    usuariosActivosPrev,
    loginFallidosPrev,
    documentosPorVencer,
    topAlertas,
    topPatentes,
    topOperadoresBitacora,
    topOperadoresChecklist,
    topOperadoresRegistro,
    tendenciasBitacoras,
    tendenciasChecklist,
    tendenciasAlertas,
    tendenciasUsuarios
  ] = await Promise.all([
    Bitacora.countDocuments({ ...bitacoraBase, ...fechaFiltro("fechaInicio", inicio, fin) }),
    Bitacora.countDocuments({ ...bitacoraBase, estado: "CERRADA", ...fechaFiltro("fechaCierre", inicio, fin) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, ...fechaFiltro("fechaCreacion", inicio, fin) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, estado: "FINALIZADO", ...fechaFiltro("fechaActualizacion", inicio, fin) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, estado: "REVISADO", ...fechaFiltro("fechaRevision", inicio, fin) }),
    AlertaCamioneta.countDocuments({ estado: { $in: ["ABIERTA", "EN_GESTION"] }, ...fechaFiltro("fechaCreacion", inicio, fin) }),
    AlertaCamioneta.countDocuments({ estado: "CERRADA", ...fechaFiltro("fechaCierre", inicio, fin) }),
    AlertaCamioneta.countDocuments({ estado: "CERRADA", ...fechaFiltro("fechaCierre", inicio, fin) }),
    AlertaCamioneta.countDocuments({ prioridad: "CRITICA", estado: { $in: ["ABIERTA", "EN_GESTION"] } }),
    User.countDocuments({ activo: true, estado: "ACTIVO" }),
    LoginAudit.countDocuments({ accion: "LOGIN_EXITOSO", resultado: "OK", ...fechaFiltro("fecha", inicio, fin) }),
    LoginAudit.countDocuments({ accion: { $in: ["LOGIN_FALLIDO", "LOGIN_BLOQUEADO"] }, resultado: "ERROR", ...fechaFiltro("fecha", inicio, fin) }),
    Bitacora.countDocuments({ ...bitacoraBase, ...fechaFiltro("fechaInicio", inicioAnterior, finAnterior) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, ...fechaFiltro("fechaCreacion", inicioAnterior, finAnterior) }),
    AlertaCamioneta.countDocuments({ estado: { $in: ["ABIERTA", "EN_GESTION"] }, ...fechaFiltro("fechaCreacion", inicioAnterior, finAnterior) }),
    User.countDocuments({ activo: true, estado: "ACTIVO", ...fechaFiltro("createdAt", inicioAnterior, finAnterior) }),
    LoginAudit.countDocuments({ accion: { $in: ["LOGIN_FALLIDO", "LOGIN_BLOQUEADO"] }, resultado: "ERROR", ...fechaFiltro("fecha", inicioAnterior, finAnterior) }),
    ChecklistCamioneta.aggregate([
      { $match: checklistBase },
      { $unwind: "$documentacion" },
      {
        $match: {
          "documentacion.fechaVencimiento": { $gte: ahora, $lte: proximos30 },
          "documentacion.nombre": {
            $in: [
              "Licencia Municipal",
              "Licencia Interna",
              "Permiso de Circulación",
              "Permiso de Circulacion",
              "Revisión Técnica",
              "Revision Tecnica",
              "Certificación Interna",
              "Certificacion Interna",
              "Seguro Obligatorio",
              "SOAP"
            ]
          }
        }
      },
      {
        $project: {
          _id: 0,
          patente: 1,
          documento: "$documentacion.nombre",
          fechaVencimiento: "$documentacion.fechaVencimiento",
          diasRestantes: {
            $ceil: {
              $divide: [{ $subtract: ["$documentacion.fechaVencimiento", ahora] }, MS_DIA]
            }
          }
        }
      },
      { $sort: { fechaVencimiento: 1 } },
      { $limit: 40 }
    ]),
    topPorCampo(AlertaCamioneta, { ...fechaFiltro("fechaCreacion", inicio, fin) }, "tipo"),
    topPorCampo(AlertaCamioneta, { ...fechaFiltro("fechaCreacion", inicio, fin) }, "patente"),
    topPorCampo(Bitacora, { ...bitacoraBase, ...fechaFiltro("fechaInicio", inicio, fin) }, "operador", 8),
    topPorCampo(ChecklistCamioneta, { ...checklistBase, ...fechaFiltro("fechaCreacion", inicio, fin) }, "nombreRealizadoPor", 8),
    topPorCampo(RegistroDatos, { eliminado: { $ne: true }, ...fechaFiltro("fechaHora", inicio, fin) }, "operador", 8),
    seriePorDia(Bitacora, { ...bitacoraBase }, "fechaInicio", inicio, fin),
    seriePorDia(ChecklistCamioneta, { ...checklistBase }, "fechaCreacion", inicio, fin),
    seriePorDia(AlertaCamioneta, {}, "fechaCreacion", inicio, fin),
    seriePorDia(User, { activo: true }, "createdAt", inicio, fin)
  ]);

  const inicio12Semanas = inicioDia(new Date(fin.getTime() - (12 * 7 - 1) * MS_DIA));
  const [
    checklistsPeriodo,
    alertasPeriodoRaw,
    alertasCerradasDetalleRaw,
    alertasPendientesDetalleRaw,
    ultimosChecklistRaw,
    alertasActivasRaw,
    documentosPorVencer90,
    tendenciasAlertas12Raw,
    tendenciasChecklists12Raw
  ] = await Promise.all([
    ChecklistCamioneta.find({ ...checklistBase, ...fechaFiltro("fechaCreacion", inicio, fin) })
      .select("patente estado aptaOperacion aptitudOperacion motivoNoApta alertaDetonante fechaInspeccion fechaRealizacion fechaCreacion fechaProximaMantencion observacionesGenerales fotosObservaciones documentacion")
      .lean(),
    AlertaCamioneta.find({ activo: { $ne: false }, ...fechaFiltro("fechaCreacion", inicio, fin) })
      .select("patente tipo descripcion prioridad estado fechaCreacion fechaCierre responsable responsableNombre fotos")
      .sort({ fechaCreacion: 1 })
      .lean(),
    AlertaCamioneta.find({ activo: { $ne: false }, estado: "CERRADA", ...fechaFiltro("fechaCierre", inicio, fin) })
      .select("patente tipo descripcion prioridad estado fechaCreacion fechaCierre responsable responsableNombre cerradoPor")
      .sort({ fechaCierre: -1 })
      .limit(80)
      .lean(),
    AlertaCamioneta.find({ activo: { $ne: false }, estado: { $in: ["ABIERTA", "EN_GESTION"] } })
      .select("patente tipo descripcion prioridad estado fechaCreacion responsable responsableNombre")
      .sort({ fechaCreacion: 1 })
      .limit(80)
      .lean(),
    ChecklistCamioneta.find(checklistBase)
      .select("patente estado aptaOperacion aptitudOperacion motivoNoApta alertaDetonante fechaInspeccion fechaRealizacion fechaCreacion fechaProximaMantencion observacionesGenerales")
      .sort({ fechaInspeccion: -1 })
      .limit(500)
      .lean()
      .then((rows) => {
        const latestByPatente = new Map();
        for (const row of rows) {
          const key = String(row.patente || "").toUpperCase();
          if (!key || latestByPatente.has(key)) continue;
          latestByPatente.set(key, row);
          if (latestByPatente.size >= 120) break;
        }
        return Array.from(latestByPatente.values());
      }),
    AlertaCamioneta.find({ activo: { $ne: false }, estado: { $in: ["ABIERTA", "EN_GESTION"] } })
      .select("patente prioridad tipo estado fechaCreacion")
      .lean(),
    ChecklistCamioneta.aggregate([
      { $match: checklistBase },
      { $unwind: "$documentacion" },
      {
        $match: {
          "documentacion.fechaVencimiento": { $gte: ahora, $lte: new Date(ahora.getTime() + 90 * MS_DIA) }
        }
      },
      {
        $project: {
          _id: 0,
          patente: 1,
          responsable: "$conductorResponsable",
          documento: "$documentacion.nombre",
          fechaVencimiento: "$documentacion.fechaVencimiento",
          diasRestantes: {
            $ceil: {
              $divide: [{ $subtract: ["$documentacion.fechaVencimiento", ahora] }, MS_DIA]
            }
          }
        }
      },
      { $sort: { fechaVencimiento: 1 } },
      { $limit: 120 }
    ]),
    AlertaCamioneta.find({ activo: { $ne: false }, fechaCreacion: { $gte: inicio12Semanas, $lte: fin } })
      .select("fechaCreacion fechaCierre estado")
      .lean(),
    ChecklistCamioneta.find({ ...checklistBase, fechaCreacion: { $gte: inicio12Semanas, $lte: fin } })
      .select("fechaCreacion aptaOperacion aptitudOperacion")
      .lean()
  ]);

  const checklistsRealizadosPeriodo = checklistsPeriodo.filter((item) => ["FINALIZADO", "REVISADO"].includes(String(item.estado || "").toUpperCase())).length;
  const checklistPendientesPeriodo = Math.max(checklistEsperadosPeriodo(inicio, fin) - checklistsRealizadosPeriodo, 0);
  const vehiculosNoAptos = checklistsPeriodo
    .filter((item) => item.aptaOperacion === false || String(item.aptitudOperacion || "").toUpperCase() === "NO_APTA")
    .map((item) => ({
      patente: item.patente || "-",
      motivo: item.motivoNoApta || item.alertaDetonante || "Condicion critica detectada",
      fechaDeteccion: fechaChecklist(item),
      estadoActual: "NO_APTO",
      foto: item.fotosObservaciones?.[0]?.ruta || ""
    }));

  const alertasPendientes = alertasPendientesDetalleRaw.map((alerta) => ({
    patente: alerta.patente || "-",
    tipo: alerta.tipo || "Alerta operacional",
    diasAbierta: diasEntre(alerta.fechaCreacion),
    prioridad: alerta.prioridad || "MEDIA",
    estado: alerta.estado || "ABIERTA"
  }));

  const alertasCerradasDetalle = alertasCerradasDetalleRaw.map((alerta) => ({
    fechaCierre: alerta.fechaCierre,
    patente: alerta.patente || "-",
    tipo: alerta.tipo || "Alerta operacional",
    responsable: alerta.responsableNombre || alerta.responsable || "-",
    tiempoResolucion: `${diasEntre(alerta.fechaCreacion, alerta.fechaCierre)} dias`
  }));

  const alertasGeneradasDetalle = dedupeAlertasPeriodo(alertasPeriodoRaw);
  const tiempoPromedioResolucion = alertasCerradasDetalleRaw.length
    ? Math.round(alertasCerradasDetalleRaw.reduce((sum, alerta) => sum + diasEntre(alerta.fechaCreacion, alerta.fechaCierre), 0) / alertasCerradasDetalleRaw.length)
    : 0;

  const alertasActivasPorPatente = new Map();
  for (const alerta of alertasActivasRaw) {
    const key = String(alerta.patente || "").toUpperCase();
    const list = alertasActivasPorPatente.get(key) || [];
    list.push(alerta);
    alertasActivasPorPatente.set(key, list);
  }

  const estadoGeneralFlotaTabla = ultimosChecklistRaw.map((checklist) => {
    const alertas = alertasActivasPorPatente.get(String(checklist.patente || "").toUpperCase()) || [];
    return {
      patente: checklist.patente || "-",
      estado: estadoGeneralFlota(checklist, alertas),
      ultimoChecklist: fechaChecklist(checklist),
      proximaMantencion: checklist.fechaProximaMantencion || null,
      observacion: checklist.motivoNoApta || checklist.observacionesGenerales || (alertas[0]?.tipo || "Sin observaciones activas")
    };
  });

  const documentosAgrupados = {
    "0-30": documentosPorVencer90.filter((doc) => doc.diasRestantes <= 30),
    "31-60": documentosPorVencer90.filter((doc) => doc.diasRestantes > 30 && doc.diasRestantes <= 60),
    "61-90": documentosPorVencer90.filter((doc) => doc.diasRestantes > 60 && doc.diasRestantes <= 90)
  };

  const weekRanges = buildWeekRanges(fin, 12);
  const tendencias12 = {
    alertasGeneradas: contarPorSemanas(tendenciasAlertas12Raw, "fechaCreacion", weekRanges),
    alertasCerradas: contarPorSemanas(tendenciasAlertas12Raw.filter((item) => item.estado === "CERRADA"), "fechaCierre", weekRanges),
    checklistRealizados: contarPorSemanas(tendenciasChecklists12Raw, "fechaCreacion", weekRanges),
    aptosVsNoAptos: [
      { nombre: "Aptos", total: tendenciasChecklists12Raw.filter((item) => item.aptaOperacion !== false && String(item.aptitudOperacion || "APTA").toUpperCase() !== "NO_APTA").length },
      { nombre: "No aptos", total: tendenciasChecklists12Raw.filter((item) => item.aptaOperacion === false || String(item.aptitudOperacion || "").toUpperCase() === "NO_APTA").length }
    ],
    documentacionPorVencer: [
      { nombre: "0-30 dias", total: documentosAgrupados["0-30"].length },
      { nombre: "31-60 dias", total: documentosAgrupados["31-60"].length },
      { nombre: "61-90 dias", total: documentosAgrupados["61-90"].length }
    ]
  };

  const hoyRango = { inicio: inicioDia(ahora), fin: finDia(ahora) };
  const semanaActual = rangoReporte("semanal", ahora);
  const mesActual = rangoReporte("mensual", ahora);
  const [realizadosHoyOp, realizadosSemanaOp, realizadosMesOp] = await Promise.all([
    ChecklistCamioneta.countDocuments({ ...checklistBase, estado: { $in: ["FINALIZADO", "REVISADO"] }, ...fechaFiltro("fechaCreacion", hoyRango.inicio, hoyRango.fin) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, estado: { $in: ["FINALIZADO", "REVISADO"] }, ...fechaFiltro("fechaCreacion", semanaActual.inicio, semanaActual.fin) }),
    ChecklistCamioneta.countDocuments({ ...checklistBase, estado: { $in: ["FINALIZADO", "REVISADO"] }, ...fechaFiltro("fechaCreacion", mesActual.inicio, mesActual.fin) })
  ]);
  const esperadosSemanaOp = checklistEsperadosPeriodo(semanaActual.inicio, semanaActual.fin);
  const esperadosMesOp = checklistEsperadosPeriodo(mesActual.inicio, mesActual.fin);
  const cumplimientoOperacional = {
    hoy: {
      realizados: Math.min(realizadosHoyOp, 2),
      esperados: 2,
      porcentaje: pctCumplimiento(realizadosHoyOp, 2)
    },
    semana: {
      realizados: Math.min(realizadosSemanaOp, esperadosSemanaOp),
      esperados: esperadosSemanaOp,
      porcentaje: pctCumplimiento(realizadosSemanaOp, esperadosSemanaOp)
    },
    mes: {
      realizados: Math.min(realizadosMesOp, esperadosMesOp),
      esperados: esperadosMesOp,
      porcentaje: pctCumplimiento(realizadosMesOp, esperadosMesOp)
    }
  };

  const kpis = {
    bitacorasGeneradas,
    bitacorasCerradas,
    checklistGenerados,
    checklistFinalizados,
    checklistRevisados,
    checklistPendientes: checklistPendientesPeriodo,
    vehiculosAptos: Math.max(estadoGeneralFlotaTabla.filter((item) => item.estado !== "No apto").length, 0),
    vehiculosNoAptos: vehiculosNoAptos.length,
    alertasAbiertas,
    alertasResueltas,
    alertasCerradas,
    alertasGeneradas: alertasGeneradasDetalle.length,
    alertasPendientes: alertasPendientes.length,
    alertasCriticasPendientes,
    tiempoPromedioResolucion,
    usuariosActivos,
    loginExitosos,
    loginFallidos
  };

  const comparacion = {
    bitacoras: { actual: bitacorasGeneradas, anterior: bitacorasGeneradasPrev, delta: bitacorasGeneradas - bitacorasGeneradasPrev, porcentaje: pct(bitacorasGeneradas, bitacorasGeneradasPrev) },
    checklist: { actual: checklistGenerados, anterior: checklistGeneradosPrev, delta: checklistGenerados - checklistGeneradosPrev, porcentaje: pct(checklistGenerados, checklistGeneradosPrev) },
    alertas: { actual: alertasAbiertas, anterior: alertasAbiertasPrev, delta: alertasAbiertas - alertasAbiertasPrev, porcentaje: pct(alertasAbiertas, alertasAbiertasPrev) },
    usuarios: { actual: usuariosActivos, anterior: usuariosActivosPrev, delta: usuariosActivos - usuariosActivosPrev, porcentaje: pct(usuariosActivos, usuariosActivosPrev) },
    loginFallidos: { actual: loginFallidos, anterior: loginFallidosPrev, delta: loginFallidos - loginFallidosPrev, porcentaje: pct(loginFallidos, loginFallidosPrev) }
  };

  const topOperadoresMap = new Map();
  for (const grupo of [topOperadoresBitacora, topOperadoresChecklist, topOperadoresRegistro]) {
    for (const item of grupo) topOperadoresMap.set(item.nombre, (topOperadoresMap.get(item.nombre) || 0) + item.total);
  }

  const data = {
    tipo: rango.tipo,
    periodo: {
      inicio,
      fin,
      inicioAnterior,
      finAnterior
    },
    generadoEn: new Date(),
    kpis,
    indicadores: {
      operacion: { estado: "OPERACION", cantidadRegistros: bitacorasGeneradas + checklistGenerados },
      seguridad: { estado: "SEGURIDAD", intentosFallidos: loginFallidos },
      alertasCriticas: { estado: "ALERTAS_CRITICAS", pendientes: alertasCriticasPendientes },
      usuarios: { estado: "USUARIOS", activos: usuariosActivos }
    },
    documentosPorVencer: documentosPorVencer.map((doc) => ({
      ...doc,
      nivel: doc.diasRestantes <= 7 ? "7_DIAS" : doc.diasRestantes <= 15 ? "15_DIAS" : "30_DIAS"
    })),
    reporteCamioneta: {
      resumenEjecutivo: {
        checklistRealizados: checklistsRealizadosPeriodo,
        checklistPendientes: checklistPendientesPeriodo,
        vehiculosAptos: estadoGeneralFlotaTabla.filter((item) => item.estado !== "No apto").length,
        vehiculosNoAptos: vehiculosNoAptos.length,
        alertasGeneradas: alertasGeneradasDetalle.length,
        alertasCerradas: alertasCerradasDetalle.length,
        alertasPendientes: alertasPendientes.length,
        tiempoPromedioResolucion
      },
      estadoGeneralFlota: estadoGeneralFlotaTabla,
      gestionAlertas: {
        generadas: alertasGeneradasDetalle,
        cerradas: alertasCerradasDetalle,
        pendientes: alertasPendientes
      },
      vehiculosNoAptos,
      documentacionPorVencer: documentosAgrupados,
      cumplimientoOperacional,
      tendenciasOperacionales: tendencias12
    },
    comparacion,
    tendencias: {
      bitacoras: tendenciasBitacoras,
      checklist: tendenciasChecklist,
      alertas: tendenciasAlertas,
      usuarios: tendenciasUsuarios
    },
    topAlertas,
    topPatentes,
    topOperadores: Array.from(topOperadoresMap.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  };

  data.resumenEjecutivo = buildResumenEjecutivo(data);
  data.hallazgosRelevantes = buildHallazgos({
    alertasPendientes,
    vehiculosNoAptos,
    documentosPorVencer90,
    cumplimiento: cumplimientoOperacional
  });
  data.conclusiones = generarConclusiones(data);
  return data;
};

const keyDiaChile = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(date));

async function seriePorDia(Model, match, campoFecha, inicio, fin) {
  const rows = await Model.aggregate([
    { $match: { ...match, [campoFecha]: { $gte: inicio, $lte: fin } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: `$${campoFecha}`,
            timezone: "America/Santiago"
          }
        },
        total: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const map = new Map(rows.map((r) => [r._id, r.total]));
  const serie = [];
  for (let d = inicioDia(inicio); d <= fin; d = new Date(d.getTime() + MS_DIA)) {
    const key = keyDiaChile(d);
    serie.push({ fecha: key, total: map.get(key) || 0 });
  }
  return serie;
}

const generarConclusiones = (data) => {
  const conclusiones = [];
  const resumen = data.reporteCamioneta?.resumenEjecutivo || {};
  const cumplimiento = data.reporteCamioneta?.cumplimientoOperacional || {};
  const documentos = data.reporteCamioneta?.documentacionPorVencer || {};

  conclusiones.push(
    resumen.vehiculosNoAptos > 0
      ? `La flota presenta ${resumen.vehiculosNoAptos} vehiculos NO aptos que requieren control operacional antes de volver a operar.`
      : "La flota se mantiene sin vehiculos NO aptos detectados en el periodo analizado."
  );

  conclusiones.push(
    (cumplimiento.mes?.porcentaje || 0) >= 90
      ? `El cumplimiento mensual se mantiene en ${cumplimiento.mes?.porcentaje || 0}%, dentro de un rango operacional favorable.`
      : `El cumplimiento mensual alcanza ${cumplimiento.mes?.porcentaje || 0}%, por debajo de la referencia esperada para control diario.`
  );

  const docsCriticos = (documentos["0-30"] || []).length;
  conclusiones.push(
    docsCriticos
      ? `Existen ${docsCriticos} documentos con vencimiento dentro de 30 dias; se recomienda seguimiento preventivo.`
      : "No se observan vencimientos documentales dentro de los proximos 30 dias."
  );

  if (data.kpis.alertasCriticasPendientes > 0) {
    conclusiones.push(`Existen ${data.kpis.alertasCriticasPendientes} alertas criticas pendientes que requieren seguimiento operacional.`);
  } else {
    conclusiones.push("No se registran alertas criticas pendientes al cierre del periodo.");
  }

  if ((data.comparacion.alertas?.delta || 0) > 0) {
    conclusiones.push("La evolucion de alertas muestra aumento frente al periodo anterior; mantener revision semanal de causas recurrentes.");
  } else {
    conclusiones.push("La evolucion de alertas no muestra aumento respecto del periodo anterior.");
  }

  return conclusiones;
};

const fmtFecha = (value) => new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
}).format(new Date(value));

const obtenerLogoPath = () => {
  const candidates = [
    process.env.REPORT_LOGO_PATH,
    path.resolve(process.cwd(), "assets", "logo-novandino.png"),
    path.resolve(process.cwd(), "..", "bitacora-frontend", "src", "assets", "logo-novandino.png")
  ].filter(Boolean);

  return candidates.find((item) => fs.existsSync(item)) || "";
};

export const obtenerReporteEjecutivo = async (req, res) => {
  try {
    console.log("📊 REPORTE CAMIONETA REQUEST", req.query);
    const data = await obtenerReporteData(req.query || {});
    await registrarEvento({
      req,
      modulo: "REPORTES_EJECUTIVOS",
      entidad: "ExecutiveReport",
      accion: "REPORTE_CAMIONETA_GENERADO",
      observacion: `Reporte camioneta ${data.tipo} generado`
    });
    return res.json(data);
  } catch (error) {
    console.error("ERROR REPORTE CAMIONETA:", error);
    return res.status(500).json({ message: "Error generando reporte camioneta" });
  }
};

const drawKpi = (doc, x, y, w, title, value, subtitle) => {
  doc.roundedRect(x, y, w, 58, 6).fillAndStroke("#f6f7fb", "#d7dbe8");
  doc.fillColor("#4c1d95").fontSize(8).font("Helvetica-Bold").text(title, x + 10, y + 9, { width: w - 20 });
  doc.fillColor("#111827").fontSize(18).font("Helvetica-Bold").text(String(value), x + 10, y + 23, { width: w - 20 });
  doc.fillColor("#64748b").fontSize(7).font("Helvetica").text(subtitle || "", x + 10, y + 45, { width: w - 20 });
};

const drawList = (doc, title, items, x, y, w) => {
  doc.fillColor("#4c1d95").fontSize(10).font("Helvetica-Bold").text(title, x, y, { width: w });
  let currentY = y + 16;
  const rows = items.length ? items : [{ nombre: "Sin datos", total: "-" }];
  for (const item of rows.slice(0, 10)) {
    doc.fillColor("#111827").fontSize(8).font("Helvetica").text(`${item.nombre}: ${item.total}`, x, currentY, { width: w });
    currentY += 12;
  }
  return currentY;
};

const ensureSpace = (doc, y, needed = 80) => {
  if (y + needed <= doc.page.height - 46) return y;
  doc.addPage();
  return 42;
};

const drawSimpleTable = (doc, title, headers, rows, x, y, widths, limit = 8) => {
  y = ensureSpace(doc, y, 44);
  doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(11).text(title, x, y);
  y += 16;
  const tableW = widths.reduce((sum, width) => sum + width, 0);
  doc.rect(x, y, tableW, 18).fillAndStroke("#ede9fe", "#d7dbe8");
  let cx = x;
  headers.forEach((header, index) => {
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(7).text(header, cx + 4, y + 5, { width: widths[index] - 8 });
    cx += widths[index];
  });
  y += 18;
  const safeRows = rows.length ? rows.slice(0, limit) : [headers.map((_, index) => index === 0 ? "Sin datos" : "-")];
  for (const row of safeRows) {
    y = ensureSpace(doc, y, 22);
    cx = x;
    const values = Array.isArray(row) ? row : headers.map((header) => row[header] || "-");
    doc.rect(x, y, tableW, 20).fillAndStroke("#ffffff", "#e5e7eb");
    values.forEach((value, index) => {
      doc.fillColor("#111827").font("Helvetica").fontSize(7).text(String(value ?? "-"), cx + 4, y + 5, { width: widths[index] - 8, height: 11 });
      cx += widths[index];
    });
    y += 20;
  }
  return y + 12;
};

const descargarReporteEjecutivoPdfLegacy = async (req, res) => {
  try {
    const data = await obtenerReporteData(req.query || {});

    await registrarEvento({
      req,
      modulo: "REPORTES_EJECUTIVOS",
      entidad: "ExecutiveReport",
      accion: "REPORTE_EJECUTIVO_DESCARGADO",
      observacion: `Reporte ejecutivo ${data.tipo} descargado en PDF`
    });

    const doc = new PDFDocument({ size: "A4", margin: 34 });
    const filename = `reporte-ejecutivo-${data.tipo}-${fmtFecha(data.periodo.inicio).replace(/\//g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 92).fill("#111827");
    const logoPath = obtenerLogoPath();
    if (logoPath) {
      doc.image(logoPath, 34, 18, { width: 82, height: 32, fit: [82, 32] });
    }
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("NOVANDINO | REPORTE EJECUTIVO", logoPath ? 132 : 34, 25);
    doc.fillColor("#c7d2fe").font("Helvetica").fontSize(10)
      .text(`${data.tipo.toUpperCase()} · ${fmtFecha(data.periodo.inicio)} al ${fmtFecha(data.periodo.fin)}`, logoPath ? 132 : 34, 52);
    doc.text(`Generado: ${fmtFecha(data.generadoEn)}`, logoPath ? 132 : 34, 68);

    let y = 112;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(13).text("Resumen Ejecutivo", 34, y);
    y += 18;
    doc.fillColor("#111827").font("Helvetica").fontSize(10).text(data.resumenEjecutivo, 34, y, { width: 528, lineGap: 3 });
    y += 48;

    const kpiW = 124;
    drawKpi(doc, 34, y, kpiW, "BITACORAS", data.kpis.bitacorasGeneradas, `${data.kpis.bitacorasCerradas} cerradas`);
    drawKpi(doc, 168, y, kpiW, "CHECKLIST", data.kpis.checklistGenerados, `${data.kpis.checklistRevisados} revisados`);
    drawKpi(doc, 302, y, kpiW, "ALERTAS", data.kpis.alertasAbiertas, `${data.kpis.alertasCriticasPendientes} criticas`);
    drawKpi(doc, 436, y, kpiW, "USUARIOS", data.kpis.usuariosActivos, `${data.kpis.loginFallidos} login fallidos`);
    y += 82;

    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Indicadores y Tendencias", 34, y);
    y += 18;
    doc.fillColor("#111827").fontSize(9).font("Helvetica")
      .text(`Bitacoras: ${data.comparacion.bitacoras.delta >= 0 ? "+" : ""}${data.comparacion.bitacoras.delta} vs periodo anterior (${data.comparacion.bitacoras.porcentaje}%).`, 34, y);
    y += 13;
    doc.text(`Checklist: ${data.comparacion.checklist.delta >= 0 ? "+" : ""}${data.comparacion.checklist.delta} vs periodo anterior (${data.comparacion.checklist.porcentaje}%).`, 34, y);
    y += 13;
    doc.text(`Alertas activas: ${data.comparacion.alertas.delta >= 0 ? "+" : ""}${data.comparacion.alertas.delta} vs periodo anterior (${data.comparacion.alertas.porcentaje}%).`, 34, y);
    y += 28;

    const leftY = drawList(doc, "Top alertas", data.topAlertas, 34, y, 160);
    drawList(doc, "Top patentes", data.topPatentes, 216, y, 160);
    drawList(doc, "Top operadores", data.topOperadores, 398, y, 160);
    y = Math.max(leftY, y + 150);

    if (y > 650) {
      doc.addPage();
      y = 42;
    }

    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Documentos proximos a vencer", 34, y);
    y += 18;
    const docs = data.documentosPorVencer.slice(0, 12);
    if (!docs.length) {
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text("Sin documentos proximos a vencer en 30 dias.", 34, y);
      y += 14;
    } else {
      for (const item of docs) {
        doc.fillColor("#111827").font("Helvetica").fontSize(8)
          .text(`${item.patente || "-"} · ${item.documento} · ${fmtFecha(item.fechaVencimiento)} · ${item.diasRestantes} dias`, 34, y, { width: 528 });
        y += 12;
      }
    }

    y += 18;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Conclusiones", 34, y);
    y += 16;
    for (const conclusion of data.conclusiones) {
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(`- ${conclusion}`, 42, y, { width: 510 });
      y += 14;
    }

    doc.end();
  } catch (error) {
    console.error("ERROR PDF REPORTE EJECUTIVO:", error);
    return res.status(500).json({ message: "Error descargando PDF ejecutivo" });
  }
};

export const descargarReporteEjecutivoPdf = async (req, res) => {
  try {
    const data = await obtenerReporteData(req.query || {});
    const reporte = data.reporteCamioneta || {};
    const resumen = reporte.resumenEjecutivo || {};

    await registrarEvento({
      req,
      modulo: "REPORTES_EJECUTIVOS",
      entidad: "ExecutiveReport",
      accion: "REPORTE_CAMIONETA_PDF_DESCARGADO",
      observacion: `Reporte camioneta ${data.tipo} descargado en PDF`
    });

    const doc = new PDFDocument({ size: "A4", margin: 34 });
    const filename = `reporte-camioneta-${data.tipo}-${fmtFecha(data.periodo.inicio).replace(/\//g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 92).fill("#111827");
    const logoPath = obtenerLogoPath();
    if (logoPath) doc.image(logoPath, 34, 18, { width: 82, height: 32, fit: [82, 32] });
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("NOVANDINO | REPORTE CAMIONETA", logoPath ? 132 : 34, 25);
    doc.fillColor("#c7d2fe").font("Helvetica").fontSize(10)
      .text(`${data.tipo.toUpperCase()} - ${fmtFecha(data.periodo.inicio)} al ${fmtFecha(data.periodo.fin)}`, logoPath ? 132 : 34, 52);
    doc.text(`Generado: ${fmtFecha(data.generadoEn)}`, logoPath ? 132 : 34, 68);

    let y = 112;
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(13).text("Resumen Ejecutivo", 34, y);
    y += 18;
    doc.fillColor("#111827").font("Helvetica").fontSize(10).text(data.resumenEjecutivo, 34, y, { width: 528, lineGap: 3 });
    y += 48;

    const kpiW = 124;
    drawKpi(doc, 34, y, kpiW, "CHECKLIST", resumen.checklistRealizados || 0, `${resumen.checklistPendientes || 0} pendientes`);
    drawKpi(doc, 168, y, kpiW, "VEHICULOS APTOS", resumen.vehiculosAptos || 0, `${resumen.vehiculosNoAptos || 0} no aptos`);
    drawKpi(doc, 302, y, kpiW, "ALERTAS", resumen.alertasGeneradas || 0, `${resumen.alertasPendientes || 0} pendientes`);
    drawKpi(doc, 436, y, kpiW, "RESOLUCION", `${resumen.tiempoPromedioResolucion || 0} d`, "promedio cierre");
    y += 82;

    const cumplimiento = reporte.cumplimientoOperacional || {};
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Cumplimiento operacional", 34, y);
    y += 18;
    doc.fillColor("#111827").fontSize(9).font("Helvetica")
      .text(`Hoy: ${cumplimiento.hoy?.realizados || 0}/${cumplimiento.hoy?.esperados || 0} (${cumplimiento.hoy?.porcentaje || 0}%).`, 34, y);
    y += 13;
    doc.text(`Semana: ${cumplimiento.semana?.realizados || 0}/${cumplimiento.semana?.esperados || 0} (${cumplimiento.semana?.porcentaje || 0}%).`, 34, y);
    y += 13;
    doc.text(`Mes: ${cumplimiento.mes?.realizados || 0}/${cumplimiento.mes?.esperados || 0} (${cumplimiento.mes?.porcentaje || 0}%).`, 34, y);
    y += 26;

    y = drawSimpleTable(doc, "Estado general de flota",
      ["Patente", "Estado", "Ultimo checklist", "Prox. mantencion", "Observacion"],
      (reporte.estadoGeneralFlota || []).map((item) => [
        item.patente,
        item.estado,
        item.ultimoChecklist ? fmtFecha(item.ultimoChecklist) : "-",
        item.proximaMantencion ? fmtFecha(item.proximaMantencion) : "-",
        item.observacion || "-"
      ]),
      34, y, [64, 86, 88, 86, 204], 8);

    y = drawSimpleTable(doc, "Alertas generadas",
      ["Fecha", "Patente", "Tipo", "Criticidad", "Estado"],
      (reporte.gestionAlertas?.generadas || []).map((item) => [
        item.fecha ? fmtFecha(item.fecha) : "-",
        item.patente,
        item.tipo,
        item.criticidad,
        `${item.estado} (${item.diasAcumulados}d)`
      ]),
      34, y, [62, 58, 210, 72, 126], 8);

    y = drawSimpleTable(doc, "Alertas cerradas",
      ["Fecha cierre", "Patente", "Tipo", "Responsable", "Resolucion"],
      (reporte.gestionAlertas?.cerradas || []).map((item) => [
        item.fechaCierre ? fmtFecha(item.fechaCierre) : "-",
        item.patente,
        item.tipo,
        item.responsable,
        item.tiempoResolucion
      ]),
      34, y, [70, 58, 190, 130, 80], 6);

    y = drawSimpleTable(doc, "Vehiculos NO aptos",
      ["Patente", "Motivo", "Fecha", "Estado"],
      (reporte.vehiculosNoAptos || []).map((item) => [
        item.patente,
        item.motivo,
        item.fechaDeteccion ? fmtFecha(item.fechaDeteccion) : "-",
        item.estadoActual
      ]),
      34, y, [62, 292, 86, 88], 6);

    const docsVencer = [
      ...(reporte.documentacionPorVencer?.["0-30"] || []).map((docItem) => ({ ...docItem, grupo: "0-30" })),
      ...(reporte.documentacionPorVencer?.["31-60"] || []).map((docItem) => ({ ...docItem, grupo: "31-60" })),
      ...(reporte.documentacionPorVencer?.["61-90"] || []).map((docItem) => ({ ...docItem, grupo: "61-90" }))
    ];
    y = drawSimpleTable(doc, "Documentacion por vencer",
      ["Grupo", "Patente", "Documento", "Vencimiento", "Responsable"],
      docsVencer.map((item) => [
        item.grupo,
        item.patente,
        item.documento,
        item.fechaVencimiento ? fmtFecha(item.fechaVencimiento) : "-",
        item.responsable || "-"
      ]),
      34, y, [48, 58, 180, 82, 160], 9);

    y = ensureSpace(doc, y, 90);
    doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text("Hallazgos y conclusiones", 34, y);
    y += 16;
    for (const conclusion of [...(data.hallazgosRelevantes || []), ...(data.conclusiones || [])]) {
      y = ensureSpace(doc, y, 18);
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(`- ${conclusion}`, 42, y, { width: 510 });
      y += 14;
    }

    doc.end();
  } catch (error) {
    console.error("ERROR PDF REPORTE CAMIONETA:", error);
    return res.status(500).json({ message: "Error descargando PDF reporte camioneta" });
  }
};

const addWorksheetRows = (sheet, rows = []) => {
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(14, ...column.values.map((value) => String(value || "").length + 2)), 42);
  });
};

export const descargarReporteEjecutivoExcel = async (req, res) => {
  try {
    const data = await obtenerReporteData(req.query || {});
    const reporte = data.reporteCamioneta || {};
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "NOVANDINO Operaciones Litio";
    workbook.created = new Date();

    const resumen = workbook.addWorksheet("Resumen Ejecutivo");
    resumen.addRow(["Reporte Camioneta", `${data.tipo.toUpperCase()} ${fmtFecha(data.periodo.inicio)} al ${fmtFecha(data.periodo.fin)}`]);
    resumen.addRow([]);
    addWorksheetRows(resumen, [
      ["Checklist realizados", reporte.resumenEjecutivo?.checklistRealizados || 0],
      ["Checklist pendientes", reporte.resumenEjecutivo?.checklistPendientes || 0],
      ["Vehiculos aptos", reporte.resumenEjecutivo?.vehiculosAptos || 0],
      ["Vehiculos NO aptos", reporte.resumenEjecutivo?.vehiculosNoAptos || 0],
      ["Alertas generadas", reporte.resumenEjecutivo?.alertasGeneradas || 0],
      ["Alertas cerradas", reporte.resumenEjecutivo?.alertasCerradas || 0],
      ["Alertas pendientes", reporte.resumenEjecutivo?.alertasPendientes || 0],
      ["Tiempo promedio resolucion", `${reporte.resumenEjecutivo?.tiempoPromedioResolucion || 0} dias`]
    ]);

    const flota = workbook.addWorksheet("Estado Flota");
    flota.addRow(["Patente", "Estado", "Ultimo checklist", "Proxima mantencion", "Observacion"]);
    addWorksheetRows(flota, (reporte.estadoGeneralFlota || []).map((item) => [
      item.patente,
      item.estado,
      item.ultimoChecklist ? fmtFecha(item.ultimoChecklist) : "-",
      item.proximaMantencion ? fmtFecha(item.proximaMantencion) : "-",
      item.observacion || "-"
    ]));

    const alertas = workbook.addWorksheet("Gestion Alertas");
    alertas.addRow(["Grupo", "Fecha", "Patente", "Tipo", "Prioridad", "Estado", "Dias/Resolucion", "Responsable"]);
    addWorksheetRows(alertas, [
      ...(reporte.gestionAlertas?.generadas || []).map((item) => ["Generada", item.fecha ? fmtFecha(item.fecha) : "-", item.patente, item.tipo, item.criticidad, item.estado, item.diasAcumulados, ""]),
      ...(reporte.gestionAlertas?.cerradas || []).map((item) => ["Cerrada", item.fechaCierre ? fmtFecha(item.fechaCierre) : "-", item.patente, item.tipo, "", "CERRADA", item.tiempoResolucion, item.responsable]),
      ...(reporte.gestionAlertas?.pendientes || []).map((item) => ["Pendiente", "", item.patente, item.tipo, item.prioridad, item.estado, item.diasAbierta, ""])
    ]);

    const docs = workbook.addWorksheet("Documentacion");
    docs.addRow(["Grupo", "Patente", "Documento", "Vencimiento", "Dias restantes", "Responsable"]);
    addWorksheetRows(docs, Object.entries(reporte.documentacionPorVencer || {}).flatMap(([grupo, items]) =>
      (items || []).map((item) => [grupo, item.patente, item.documento, item.fechaVencimiento ? fmtFecha(item.fechaVencimiento) : "-", item.diasRestantes, item.responsable || "-"])
    ));

    const noAptos = workbook.addWorksheet("No Aptos");
    noAptos.addRow(["Patente", "Motivo", "Fecha deteccion", "Estado", "Foto"]);
    addWorksheetRows(noAptos, (reporte.vehiculosNoAptos || []).map((item) => [
      item.patente,
      item.motivo,
      item.fechaDeteccion ? fmtFecha(item.fechaDeteccion) : "-",
      item.estadoActual,
      item.foto || ""
    ]));

    workbook.eachSheet((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FF4C1D95" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    });

    await registrarEvento({
      req,
      modulo: "REPORTES_EJECUTIVOS",
      entidad: "ExecutiveReport",
      accion: "REPORTE_CAMIONETA_EXCEL_DESCARGADO",
      observacion: `Reporte camioneta ${data.tipo} descargado en Excel`
    });

    const filename = `reporte-camioneta-${data.tipo}-${fmtFecha(data.periodo.inicio).replace(/\//g, "-")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("ERROR EXCEL REPORTE CAMIONETA:", error);
    return res.status(500).json({ message: "Error descargando Excel reporte camioneta" });
  }
};
