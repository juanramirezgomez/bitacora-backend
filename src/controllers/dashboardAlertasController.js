import AlertaCamioneta from "../models/AlertaCamioneta.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import HistorialAlerta from "../models/HistorialAlerta.js";
import { generarAlertasChecklist } from "../services/alertService.js";
import {
  cerrarAlertaCamioneta,
  resolverAlertaCamioneta,
  sincronizarAlertasOperacionalesChecklist
} from "../services/alertaCamionetaService.js";

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];
const ACTIVAS = ["ABIERTA", "EN_PROCESO"];

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (date, days) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

const toDayKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildLastDays = (days) => {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - (days - 1));
    return {
      fecha: toDayKey(date),
      label: date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }),
      total: 0
    };
  });
};

const normalizePriority = (prioridad) => {
  const value = String(prioridad || "MEDIA").toUpperCase();
  if (value.includes("CRIT")) return "CRITICA";
  if (value.includes("ALT")) return "ALTA";
  if (value.includes("BAJ")) return "BAJA";
  return PRIORIDADES.includes(value) ? value : "MEDIA";
};

const normalizeEstado = (estado) => {
  const value = String(estado || "ABIERTA").trim().toUpperCase();
  if (value.includes("PROCESO")) return "EN_PROCESO";
  if (value.includes("RESUEL")) return "RESUELTA";
  if (value.includes("CERRA")) return "CERRADA";
  return "ABIERTA";
};

const getChileDayRange = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const start = new Date(`${year}-${month}-${day}T00:00:00-04:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const normalizeAlertaDoc = (alerta) => ({
  ...alerta,
  prioridad: normalizePriority(alerta.prioridad),
  estado: normalizeEstado(alerta.estado),
  fechaCreacion: alerta.fechaCreacion || alerta.createdAt || alerta.fecha || new Date()
});

const esChecklistApto = (checklist) => {
  const aptitud = String(checklist.aptitudOperacion || "").trim().toUpperCase();
  const apta = String(checklist.aptaOperacion ?? "").trim().toUpperCase();
  if (aptitud === "NO_APTA" || apta === "FALSE" || checklist.aptaOperacion === false) return false;
  return aptitud === "APTA" || apta === "TRUE" || checklist.aptaOperacion === true;
};

const estadoOperacionalCamioneta = (checklist, alertasActivasPorPatente) => {
  const patente = String(checklist.patente || "").trim().toUpperCase();
  const tieneCriticaActiva = (alertasActivasPorPatente.get(patente) || [])
    .some((alerta) => alerta.prioridad === "CRITICA");

  if (
    tieneCriticaActiva ||
    String(checklist.aptitudOperacion || "").toUpperCase() === "NO_APTA" ||
    checklist.aptaOperacion === false
  ) {
    return "NO_OPERATIVA";
  }

  const tieneAlertaActiva = (alertasActivasPorPatente.get(patente) || []).length > 0;
  if (tieneAlertaActiva) return "OBSERVACION";
  return "OPERATIVA";
};

const mapAlerta = (alerta) => ({
  id: String(alerta._id),
  prioridad: normalizePriority(alerta.prioridad),
  patente: alerta.patente || "-",
  tipo: alerta.tipo || "ALERTA_OPERACIONAL",
  descripcion: alerta.descripcion || alerta.observaciones || "",
  operador: alerta.operador || "-",
  estado: alerta.estado || "ABIERTA",
  responsable: alerta.responsable || "-",
  solucion: alerta.solucion || "",
  observaciones: alerta.observaciones || "",
  fecha: alerta.fechaCreacion || alerta.createdAt,
  fechaResolucion: alerta.fechaResolucion || null,
  fechaCierre: alerta.fechaCierre || null,
  checklistId: alerta.checklistId?._id || alerta.checklistId || null,
  fotos: alerta.fotos || [],
  checklist: alerta.checklistId && typeof alerta.checklistId === "object" ? {
    _id: alerta.checklistId._id,
    conductorResponsable: alerta.checklistId.conductorResponsable,
    fechaInspeccion: alerta.checklistId.fechaInspeccion,
    turno: alerta.checklistId.turno,
    turnoNumero: alerta.checklistId.turnoNumero,
    aptaOperacion: alerta.checklistId.aptaOperacion,
    aptitudOperacion: alerta.checklistId.aptitudOperacion
  } : null
});

const buildTimeline = (alertas, checklists) => {
  const eventos = [];
  for (const checklist of checklists.slice(0, 30)) {
    eventos.push({
      fecha: checklist.fechaInspeccion || checklist.fechaCreacion || checklist.createdAt,
      patente: checklist.patente,
      tipo: checklist.aptaOperacion === false ? "NO_APTA" : "CHECKLIST",
      texto: checklist.aptaOperacion === false ? "Checklist con condicion no apta" : "Checklist registrado",
      estado: checklist.aptaOperacion === false ? "CRITICA" : "OK"
    });
  }

  for (const alerta of alertas.slice(0, 40)) {
    eventos.push({
      fecha: alerta.fechaCreacion || alerta.createdAt,
      patente: alerta.patente,
      tipo: alerta.tipo,
      texto: alerta.descripcion,
      estado: alerta.estado,
      prioridad: alerta.prioridad
    });
    if (alerta.fechaResolucion) {
      eventos.push({
        fecha: alerta.fechaResolucion,
        patente: alerta.patente,
        tipo: "RESOLUCION",
        texto: alerta.solucion || "Alerta resuelta",
        estado: "RESUELTA",
        prioridad: alerta.prioridad
      });
    }
  }

  return eventos
    .filter((item) => item.fecha)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 14);
};

const asegurarAlertasOperacionalesRecientes = async (desde) => {
  const faltantes = await ChecklistCamioneta.aggregate([
    { $match: { eliminado: { $ne: true }, estado: { $in: ["FINALIZADO", "REVISADO"] }, createdAt: { $gte: desde } } },
    {
      $lookup: {
        from: "alertacamionetas",
        localField: "_id",
        foreignField: "checklistId",
        as: "alertasOperacionales"
      }
    },
    { $match: { alertasOperacionales: { $size: 0 } } },
    { $project: { _id: 1 } },
    { $limit: 25 }
  ]);

  if (!faltantes.length) return;

  const ids = faltantes.map((item) => item._id);
  const checklists = await ChecklistCamioneta.find({ _id: { $in: ids } })
    .select("-revisionCarroceria.imagenMarcada -firmaConductor -firmaRevisor -firmaRealizadoPor -firmaRevisadoPor")
    .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas");

  for (const checklist of checklists) {
    const alertas = await generarAlertasChecklist(checklist);
    await sincronizarAlertasOperacionalesChecklist(checklist, alertas);
  }
};

const backfillAlertasDesdeHistorial = async (desde) => {
  const historial = await HistorialAlerta.find({
    checklistId: { $ne: null },
    estado: { $ne: "omitido" },
    createdAt: { $gte: desde }
  })
    .select("tipo prioridad mensaje checklistId patente operador createdAt fecha estadoOperacional error")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  if (!historial.length) return;

  const ops = [];
  for (const item of historial) {
    const dedupeKey = [
      item.checklistId,
      item.tipo,
      String(item.mensaje || item.error || "").slice(0, 90)
    ].join(":");

    ops.push({
      updateOne: {
        filter: { dedupeKey },
        update: {
          $setOnInsert: {
            checklistId: item.checklistId,
            tipo: item.tipo || "ALERTA_OPERACIONAL",
            fechaCreacion: item.createdAt || item.fecha || new Date(),
            estado: normalizeEstado(item.estadoOperacional),
            dedupeKey
          },
          $set: {
            patente: item.patente || "",
            descripcion: item.mensaje || item.error || "Alerta operacional",
            prioridad: normalizePriority(item.prioridad),
            operador: item.operador || "",
            observaciones: item.error || "",
            activo: true
          }
        },
        upsert: true
      }
    });
  }

  if (ops.length) {
    await AlertaCamioneta.bulkWrite(ops, { ordered: false });
    console.log("✅ ALERTAS HISTORICAS NORMALIZADAS", { total: ops.length });
  }
};

const normalizarAlertasExistentes = async () => {
  const existentes = await AlertaCamioneta.find({
    $or: [
      { estado: { $nin: ["ABIERTA", "EN_PROCESO", "RESUELTA", "CERRADA"] } },
      { prioridad: { $nin: PRIORIDADES } },
      { estado: { $exists: false } },
      { prioridad: { $exists: false } }
    ]
  })
    .select("estado prioridad")
    .limit(100)
    .lean();

  if (!existentes.length) return;

  await AlertaCamioneta.bulkWrite(
    existentes.map((alerta) => ({
      updateOne: {
        filter: { _id: alerta._id },
        update: {
          $set: {
            estado: normalizeEstado(alerta.estado),
            prioridad: normalizePriority(alerta.prioridad)
          }
        }
      }
    })),
    { ordered: false }
  );
  console.log("✅ ALERTAS NORMALIZADAS", { total: existentes.length });
};

export const obtenerDashboardAlertas = async (req, res) => {
  const inicio = Date.now();
  console.log("📊 DASHBOARD ALERTAS REQUEST", {
    user: req.user?.id || req.user?._id || null,
    rol: req.user?.rol || null
  });

  try {
    const mongoInicio = Date.now();
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const last7Start = addDays(today, -6);
    const last30Start = addDays(today, -29);
    const chileToday = getChileDayRange(now);

    await asegurarAlertasOperacionalesRecientes(last30Start);
    await backfillAlertasDesdeHistorial(last30Start);
    await normalizarAlertasExistentes();

    const [
      checklistsHoy,
      checklistsPorDiaRaw,
      latestChecklists,
      timelineChecklists,
      alertasRaw
    ] = await Promise.all([
      ChecklistCamioneta.countDocuments({
        eliminado: { $ne: true },
        $or: [
          { fechaInspeccion: { $gte: chileToday.start, $lt: chileToday.end } },
          { fechaCreacion: { $gte: chileToday.start, $lt: chileToday.end } },
          { createdAt: { $gte: chileToday.start, $lt: chileToday.end } }
        ]
      }),
      ChecklistCamioneta.aggregate([
        { $match: { eliminado: { $ne: true }, createdAt: { $gte: last7Start } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      ChecklistCamioneta.find({
        eliminado: { $ne: true },
        patente: { $nin: [null, ""] }
      })
        .select("patente estado aptaOperacion aptitudOperacion fechaInspeccion fechaCreacion createdAt conductorResponsable turno turnoNumero")
        .sort({ fechaInspeccion: -1, createdAt: -1 })
        .limit(160)
        .lean(),
      ChecklistCamioneta.find({
        eliminado: { $ne: true },
        patente: { $nin: [null, ""] },
        createdAt: { $gte: last30Start }
      })
        .select("patente aptaOperacion aptitudOperacion fechaInspeccion fechaCreacion createdAt")
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
      AlertaCamioneta.find({ activo: { $ne: false }, fechaCreacion: { $gte: last30Start } })
        .select("patente prioridad estado tipo descripcion operador responsable solucion observaciones fechaCreacion fechaResolucion fechaCierre checklistId fotos turno turnoNumero")
        .populate("checklistId", "conductorResponsable fechaInspeccion turno turnoNumero aptaOperacion aptitudOperacion")
        .sort({ fechaCreacion: -1 })
        .limit(500)
        .lean()
    ]);

    console.log("⚡ Tiempo Mongo dashboard:", `${Date.now() - mongoInicio}ms`);

    const alertasNormalizadas = alertasRaw.map(normalizeAlertaDoc);
    const alertasFiltradas = alertasNormalizadas.filter((alerta) => {
      const patente = String(req.query?.patente || "").trim().toUpperCase();
      const estado = String(req.query?.estado || "").trim().toUpperCase();
      const prioridad = String(req.query?.prioridad || "").trim().toUpperCase();
      const turno = String(req.query?.turno || "").trim().toUpperCase();
      const fecha = String(req.query?.fecha || "").trim();

      if (patente && !String(alerta.patente || "").toUpperCase().includes(patente)) return false;
      if (estado && alerta.estado !== estado) return false;
      if (prioridad && alerta.prioridad !== prioridad) return false;
      const alertaTurno = String(alerta.turno || alerta.checklistId?.turno || "").toUpperCase();
      if (turno && alertaTurno !== turno) return false;
      if (fecha && toDayKey(alerta.fechaCreacion) !== fecha) return false;
      return true;
    });

    const prioridadMap = new Map();
    for (const alerta of alertasFiltradas) {
      prioridadMap.set(alerta.prioridad, (prioridadMap.get(alerta.prioridad) || 0) + 1);
    }
    const alertasPorPrioridad = PRIORIDADES.map((prioridad) => ({
      prioridad,
      total: prioridadMap.get(prioridad) || 0
    }));

    const tendencias = buildLastDays(7);
    for (const alerta of alertasFiltradas) {
      const key = toDayKey(alerta.fechaCreacion);
      const item = tendencias.find((entry) => entry.fecha === key);
      if (item) item.total += 1;
    }

    const checklistsPorDia = buildLastDays(7);
    const checklistMap = new Map(checklistsPorDiaRaw.map((item) => [item._id, item.total]));
    checklistsPorDia.forEach((item) => {
      item.total = checklistMap.get(item.fecha) || 0;
    });

    const alertasActivasPorPatente = new Map();
    const alertasActivasRaw = alertasFiltradas.filter((alerta) => ACTIVAS.includes(alerta.estado));
    for (const alerta of alertasActivasRaw) {
      const patente = String(alerta.patente || "").trim().toUpperCase();
      if (!patente) continue;
      const list = alertasActivasPorPatente.get(patente) || [];
      list.push(alerta);
      alertasActivasPorPatente.set(patente, list);
    }

    const latestByPatente = new Map();
    for (const checklist of latestChecklists) {
      const patente = String(checklist.patente || "").trim().toUpperCase();
      if (patente && !latestByPatente.has(patente)) {
        latestByPatente.set(patente, checklist);
      }
    }

    const estadosCamionetas = Array.from(latestByPatente.values())
      .slice(0, 16)
      .map((checklist) => {
        const patente = String(checklist.patente || "").trim().toUpperCase();
        const alertas = alertasActivasPorPatente.get(patente) || [];
        return {
          patente: checklist.patente,
          estado: estadoOperacionalCamioneta(checklist, alertasActivasPorPatente),
          ultimaInspeccion: checklist.fechaInspeccion || checklist.fechaCreacion || checklist.createdAt,
          conductor: checklist.conductorResponsable || "-",
          turno: checklist.turno || "",
          turnoNumero: checklist.turnoNumero || "",
          alertasActivas: alertas.length,
          alertaCritica: alertas.some((alerta) => alerta.prioridad === "CRITICA")
        };
      });

    const criticas = alertasFiltradas.filter((alerta) => alerta.prioridad === "CRITICA" && alerta.estado === "ABIERTA").length;
    const activas = alertasActivasRaw.length;
    const camionetasOperativas = estadosCamionetas.filter((item) => item.estado === "OPERATIVA").length ||
      Array.from(latestByPatente.values()).filter(esChecklistApto).length;
    const alertasRecientesRaw = alertasFiltradas.slice(0, 16);
    const alertasRecientes = alertasRecientesRaw.map(mapAlerta);
    const alertasActivas = alertasActivasRaw.map(mapAlerta);

    const response = {
      criticas,
      activas,
      checklistsHoy,
      camionetasOperativas,
      alertasPorPrioridad,
      checklistsPorDia,
      alertasRecientes,
      alertasActivas,
      tendencias,
      estadosCamionetas,
      timeline: buildTimeline(alertasRecientesRaw, timelineChecklists),
      actualizadoEn: new Date()
    };

    console.log("✅ KPI ACTUALIZADOS", { criticas, activas, checklistsHoy, camionetasOperativas });
    console.log("✅ ALERTAS CARGADAS", { total: alertasFiltradas.length, activas: alertasActivas.length });
    console.log("⚡ Tiempo dashboard:", `${Date.now() - inicio}ms`);
    return res.json(response);
  } catch (error) {
    console.error("❌ ERROR KPI:", error);
    console.error("❌ ERROR DASHBOARD ALERTAS:", error);
    return res.status(500).json({ message: "Error obteniendo dashboard de alertas" });
  }
};

export const gestionarAlertaDashboard = async (req, res) => {
  try {
    const estado = String(req.body?.estado || "RESUELTA").toUpperCase();
    if (!["EN_PROCESO", "RESUELTA", "CERRADA"].includes(estado)) {
      return res.status(400).json({ message: "Estado de alerta invalido" });
    }

    const solucion = String(req.body?.solucion || req.body?.observacion || "").trim();
    const responsable = String(req.body?.responsable || "").trim();
    const observaciones = String(req.body?.observaciones || "").trim();

    if ((estado === "RESUELTA" || estado === "CERRADA") && !solucion) {
      return res.status(400).json({ message: "La solucion es obligatoria para resolver o cerrar" });
    }

    const alerta = await resolverAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      estado,
      solucion,
      responsable,
      observaciones
    });

    if (!alerta) return res.status(404).json({ message: "Alerta no encontrada" });

    console.log("✅ ALERTA RESUELTA", {
      alertaId: alerta._id,
      estado: alerta.estado,
      patente: alerta.patente
    });
    return res.json({
      message: estado === "CERRADA" ? "Alerta cerrada" : "Alerta gestionada",
      alerta: mapAlerta(alerta)
    });
  } catch (error) {
    console.error("❌ ERROR GESTIONANDO ALERTA:", error);
    return res.status(500).json({ message: "Error gestionando alerta" });
  }
};

export const resolverAlertaDashboard = async (req, res) => {
  req.body.estado = "RESUELTA";
  return gestionarAlertaDashboard(req, res);
};

export const cerrarAlertaDashboard = async (req, res) => {
  try {
    const solucion = String(req.body?.solucion || req.body?.observacion || "").trim();
    const observaciones = String(req.body?.observaciones || "").trim();
    if (!solucion) {
      return res.status(400).json({ message: "La solucion final es obligatoria" });
    }

    const alerta = await cerrarAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      solucion,
      observaciones
    });
    if (!alerta) return res.status(404).json({ message: "Alerta no encontrada" });

    console.log("✅ ALERTA RESUELTA", {
      alertaId: alerta._id,
      estado: alerta.estado,
      patente: alerta.patente
    });
    return res.json({ message: "Alerta cerrada", alerta: mapAlerta(alerta) });
  } catch (error) {
    console.error("❌ ERROR CERRANDO ALERTA:", error);
    return res.status(500).json({ message: "Error cerrando alerta" });
  }
};
