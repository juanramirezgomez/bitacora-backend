import PDFDocument from "pdfkit";
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
  return `Durante la ${periodo} se registraron ${kpis.bitacorasGeneradas} bitacoras, ${kpis.checklistGenerados} checklist, ${kpis.alertasAbiertas} alertas abiertas y ${kpis.usuariosActivos} usuarios activos. Se observa una ${tendenciaAlertas} de alertas respecto al periodo anterior.`;
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

  const kpis = {
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
  if (data.kpis.alertasCriticasPendientes > 0) {
    conclusiones.push(`Existen ${data.kpis.alertasCriticasPendientes} alertas criticas pendientes que requieren seguimiento operacional.`);
  } else {
    conclusiones.push("No se registran alertas criticas pendientes al cierre del periodo.");
  }
  if (data.kpis.loginFallidos > 0) {
    conclusiones.push(`Se detectaron ${data.kpis.loginFallidos} intentos fallidos de acceso; se recomienda mantener revision de auditoria de accesos.`);
  }
  if (data.documentosPorVencer.length > 0) {
    conclusiones.push(`Hay ${data.documentosPorVencer.length} documentos proximos a vencer en 30 dias.`);
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
    console.log("📊 REPORTE EJECUTIVO REQUEST", req.query);
    const data = await obtenerReporteData(req.query || {});
    await registrarEvento({
      req,
      modulo: "REPORTES_EJECUTIVOS",
      entidad: "ExecutiveReport",
      accion: "REPORTE_EJECUTIVO_GENERADO",
      observacion: `Reporte ejecutivo ${data.tipo} generado`
    });
    return res.json(data);
  } catch (error) {
    console.error("ERROR REPORTE EJECUTIVO:", error);
    return res.status(500).json({ message: "Error generando reporte ejecutivo" });
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

export const descargarReporteEjecutivoPdf = async (req, res) => {
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
