import AlertaCamioneta from "../models/AlertaCamioneta.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import HistorialAlerta from "../models/HistorialAlerta.js";
import mongoose from "mongoose";
import { generarAlertasChecklist } from "../services/alertService.js";
import {
  cerrarAlertaCamioneta,
  tomarGestionAlertaCamioneta,
  sincronizarAlertasOperacionalesChecklist
} from "../services/alertaCamionetaService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];
const ESTADOS_ALERTA = ["ABIERTA", "EN_GESTION", "CERRADA"];
const ACTIVAS = ["ABIERTA", "EN_GESTION"];

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
  if (value.includes("ASIGN") || value.includes("PROCESO") || value.includes("GESTION")) return "EN_GESTION";
  if (value.includes("RESUEL")) return "CERRADA";
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

const permisosGestion = (user = {}, alerta = {}) => {
  const rol = String(user.rol || "").toUpperCase();
  const estado = normalizeEstado(alerta.estado);
  const supervisor = ["SUPERVISION", "SUPERVISOR", "JEFE_PLANTA", "JEFE_TURNO", "ECM"].includes(rol);
  const admin = rol === "ADMIN";
  return {
    tomarGestion: estado === "ABIERTA" && (supervisor || admin),
    cerrar: estado === "EN_GESTION" && (supervisor || admin),
    comentar: estado !== "CERRADA" && rol !== "SUPERINTENDENTE",
    adjuntarEvidencia: estado === "EN_GESTION" && rol !== "SUPERINTENDENTE",
    verHistorial: true
  };
};

const mapAlerta = (alerta, user = {}) => ({
  id: String(alerta._id),
  prioridad: normalizePriority(alerta.prioridad),
  patente: alerta.patente || "-",
  tipo: alerta.tipo || "ALERTA_OPERACIONAL",
  descripcion: alerta.descripcion || alerta.observaciones || "",
  operador: alerta.operador || "-",
  estado: alerta.estado || "ABIERTA",
  responsable: alerta.responsable || alerta.responsableNombre || "-",
  responsableId: alerta.responsableId || null,
  responsableNombre: alerta.responsableNombre || alerta.responsable || "",
  responsableRol: alerta.responsableRol || "",
  accionCorrectiva: alerta.accionCorrectiva || alerta.solucion || "",
  solucion: alerta.solucion || "",
  comentarioCierre: alerta.comentarioCierre || "",
  observaciones: alerta.observaciones || "",
  observacionesChecklist: alerta.observacionesChecklist || "",
  documentacionChecklist: alerta.documentacionChecklist || [],
  hallazgos: alerta.hallazgos || [],
  resumenHallazgos: alerta.resumenHallazgos || {},
  resolucionAutomatica: alerta.resolucionAutomatica || false,
  motivoNoApta: alerta.checklistId?.motivoNoApta || "",
  alertaDetonante: alerta.checklistId?.alertaDetonante || "",
  prioridadDetonante: alerta.checklistId?.prioridadDetonante || "",
  categoriaDetonante: alerta.checklistId?.categoriaDetonante || "",
  fecha: alerta.fechaCreacion || alerta.createdAt,
  fechaAsignacion: alerta.fechaAsignacion || null,
  fechaInicioGestion: alerta.fechaInicioGestion || null,
  fechaResolucion: alerta.fechaResolucion || null,
  fechaCierre: alerta.fechaCierre || null,
  fechaCompromiso: alerta.fechaCompromiso || null,
  fechaUltimoMovimiento: alerta.fechaUltimoMovimiento || null,
  escalada: alerta.escalada || false,
  nivelEscalamiento: alerta.nivelEscalamiento || 0,
  checklistId: alerta.checklistId?._id || alerta.checklistId || null,
  fotos: alerta.fotos || [],
  origen: inferirOrigenAlerta(alerta),
  permisos: permisosGestion(user, alerta),
  checklist: alerta.checklistId && typeof alerta.checklistId === "object" ? {
    _id: alerta.checklistId._id,
    conductorResponsable: alerta.checklistId.conductorResponsable,
    fechaInspeccion: alerta.checklistId.fechaInspeccion,
    turno: alerta.checklistId.turno,
    turnoNumero: alerta.checklistId.turnoNumero,
    aptaOperacion: alerta.checklistId.aptaOperacion,
    aptitudOperacion: alerta.checklistId.aptitudOperacion,
    motivoNoApta: alerta.checklistId.motivoNoApta,
    alertaDetonante: alerta.checklistId.alertaDetonante,
    prioridadDetonante: alerta.checklistId.prioridadDetonante,
    categoriaDetonante: alerta.checklistId.categoriaDetonante
  } : null
});

const inferirOrigenAlerta = (alerta = {}) => {
  const texto = `${alerta.tipo || ""} ${alerta.descripcion || ""}`.toUpperCase();
  if (texto.includes("CLASE B")) return "Licencia Clase B";
  if (texto.includes("LICENCIA INTERNA")) return "Licencia Interna";
  if (texto.includes("MANTENCION")) return "Mantencion";
  if (texto.includes("DOCUMENTACION")) return "Documentacion";
  if (alerta.checklistId) return "Checklist";
  return alerta.origen || "Alerta Operacional";
};

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
    if (alerta.fechaCierre) {
      eventos.push({
        fecha: alerta.fechaCierre,
        patente: alerta.patente,
        tipo: "CIERRE",
        texto: alerta.comentarioCierre || alerta.solucion || "Alerta cerrada",
        estado: "CERRADA",
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
        let: { checklistId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$checklistId", "$$checklistId"] },
              tipo: "CHECKLIST_CAMIONETA_CONSOLIDADO",
              activo: { $ne: false }
            }
          }
        ],
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

const asegurarDetalleConsolidadosRecientes = async (desde) => {
  const incompletas = await AlertaCamioneta.find({
    tipo: "CHECKLIST_CAMIONETA_CONSOLIDADO",
    fechaCreacion: { $gte: desde },
    $or: [
      { hallazgos: { $exists: false } },
      { resumenHallazgos: { $exists: false } }
    ]
  }).select("checklistId").limit(25).lean();
  if (!incompletas.length) return;

  const ids = incompletas.map((item) => item.checklistId).filter(Boolean);
  const checklists = await ChecklistCamioneta.find({ _id: { $in: ids } })
    .select("-revisionCarroceria.imagenMarcada -firmaConductor -firmaRevisor -firmaRealizadoPor -firmaRevisadoPor")
    .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas");
  for (const checklist of checklists) {
    await sincronizarAlertasOperacionalesChecklist(checklist, await generarAlertasChecklist(checklist));
  }
};

const backfillAlertasDesdeHistorial = async (desde) => {
  const historial = await HistorialAlerta.find({
    checklistId: { $ne: null },
    tipo: "CHECKLIST_CAMIONETA_CONSOLIDADO",
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
    const dedupeKey = `${item.checklistId}:CHECKLIST_CAMIONETA_CONSOLIDADO`;

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
    console.log("âœ… ALERTAS HISTORICAS NORMALIZADAS", { total: ops.length });
  }
};

const normalizarAlertasExistentes = async () => {
  const existentes = await AlertaCamioneta.find({
    $or: [
      { estado: { $nin: ESTADOS_ALERTA } },
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
  console.log("âœ… ALERTAS NORMALIZADAS", { total: existentes.length });
};

export const obtenerDashboardAlertas = async (req, res) => {
  const inicio = Date.now();
  console.log("ðŸ“Š DASHBOARD ALERTAS REQUEST", {
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
    const rolActual = String(req.user?.rol || "").toUpperCase();
    const userActualId = req.user?.id || req.user?._id || req.user?.uid || null;
    const filtroAlertasAcceso = {
      activo: { $ne: false },
      fechaCreacion: { $gte: last30Start }
    };
    if (["OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"].includes(rolActual) && userActualId && mongoose.Types.ObjectId.isValid(userActualId)) {
      filtroAlertasAcceso.creadoPor = new mongoose.Types.ObjectId(userActualId);
    }

    await asegurarAlertasOperacionalesRecientes(last30Start);
    await asegurarDetalleConsolidadosRecientes(last30Start);
    await backfillAlertasDesdeHistorial(last30Start);
    await normalizarAlertasExistentes();

    let [
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
        .select("patente estado aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante fechaInspeccion fechaCreacion createdAt conductorResponsable turno turnoNumero")
        .sort({ createdAt: -1 })
        .allowDiskUse(true)
        .limit(160)
        .lean(),
      ChecklistCamioneta.find({
        eliminado: { $ne: true },
        patente: { $nin: [null, ""] },
        createdAt: { $gte: last30Start }
      })
        .select("patente aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante fechaInspeccion fechaCreacion createdAt")
        .sort({ createdAt: -1 })
        .allowDiskUse(true)
        .limit(80)
        .lean(),
      AlertaCamioneta.find(filtroAlertasAcceso)
        .select("patente prioridad estado tipo descripcion operador responsable responsableId responsableNombre responsableRol accionCorrectiva solucion comentarioCierre observaciones observacionesChecklist documentacionChecklist hallazgos resumenHallazgos resolucionAutomatica fechaCreacion fechaAsignacion fechaInicioGestion fechaResolucion fechaCierre fechaCompromiso fechaUltimoMovimiento escalada nivelEscalamiento checklistId fotos turno turnoNumero creadoPor")
        .populate("checklistId", "conductorResponsable fechaInspeccion turno turnoNumero aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante")
        .sort({ fechaCreacion: -1 })
        .allowDiskUse(true)
        .limit(500)
        .lean()
    ]);

    const alertaSeleccionadaId = String(req.query?.alerta || "").trim();
    if (
      alertaSeleccionadaId &&
      mongoose.Types.ObjectId.isValid(alertaSeleccionadaId) &&
      !alertasRaw.some((alerta) => String(alerta._id) === alertaSeleccionadaId)
    ) {
      const filtroSeleccionada = { _id: alertaSeleccionadaId, activo: { $ne: false } };
      if (["OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"].includes(rolActual) && mongoose.Types.ObjectId.isValid(userActualId)) {
        filtroSeleccionada.creadoPor = new mongoose.Types.ObjectId(userActualId);
      }
      const alertaSeleccionada = await AlertaCamioneta.findOne(filtroSeleccionada)
        .select("patente prioridad estado tipo descripcion operador responsable responsableId responsableNombre responsableRol accionCorrectiva solucion comentarioCierre observaciones observacionesChecklist documentacionChecklist hallazgos resumenHallazgos resolucionAutomatica fechaCreacion fechaAsignacion fechaInicioGestion fechaResolucion fechaCierre fechaCompromiso fechaUltimoMovimiento escalada nivelEscalamiento checklistId fotos turno turnoNumero creadoPor")
        .populate("checklistId", "conductorResponsable fechaInspeccion turno turnoNumero aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante")
        .lean();
      if (alertaSeleccionada) {
        alertasRaw = [alertaSeleccionada, ...alertasRaw];
      }
    }

    console.log("âš¡ Tiempo Mongo dashboard:", `${Date.now() - mongoInicio}ms`);

    const alertasNormalizadas = alertasRaw.map(normalizeAlertaDoc);
    const alertasFiltradas = alertasNormalizadas.filter((alerta) => {
      const patente = String(req.query?.patente || "").trim().toUpperCase();
      const estado = String(req.query?.estado || "").trim().toUpperCase();
      const prioridad = String(req.query?.prioridad || "").trim().toUpperCase();
      const turno = String(req.query?.turno || "").trim().toUpperCase();
      const responsable = String(req.query?.responsable || "").trim().toUpperCase();
      const fecha = String(req.query?.fecha || "").trim();

      if (patente && !String(alerta.patente || "").toUpperCase().includes(patente)) return false;
      if (estado && alerta.estado !== estado) return false;
      if (prioridad && alerta.prioridad !== prioridad) return false;
      const alertaTurno = String(alerta.turno || alerta.checklistId?.turno || "").toUpperCase();
      if (turno && alertaTurno !== turno) return false;
      if (responsable && !String(alerta.responsable || "").toUpperCase().includes(responsable)) return false;
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

    const criticas = alertasFiltradas.filter((alerta) => alerta.prioridad === "CRITICA" && ACTIVAS.includes(alerta.estado)).length;
    const abiertas = alertasFiltradas.filter((alerta) => alerta.estado === "ABIERTA").length;
    const enGestion = alertasFiltradas.filter((alerta) => alerta.estado === "EN_GESTION").length;
    const cerradas = alertasFiltradas.filter((alerta) => alerta.estado === "CERRADA").length;
    const escaladas = alertasFiltradas.filter((alerta) => alerta.escalada).length;
    const activas = alertasActivasRaw.length;
    const camionetasOperativas = estadosCamionetas.filter((item) => item.estado === "OPERATIVA").length ||
      Array.from(latestByPatente.values()).filter(esChecklistApto).length;
    const alertasRecientesRaw = alertasFiltradas.slice(0, 16);
    const alertasRecientes = alertasRecientesRaw.map((alerta) => mapAlerta(alerta, req.user));
    const alertasActivas = alertasActivasRaw.map((alerta) => mapAlerta(alerta, req.user));

    const response = {
      criticas,
      activas,
      abiertas,
      enGestion,
      cerradas,
      escaladas,
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

    console.log("âœ… KPI ACTUALIZADOS", { criticas, activas, checklistsHoy, camionetasOperativas });
    console.log("âœ… ALERTAS CARGADAS", { total: alertasFiltradas.length, activas: alertasActivas.length });
    console.log("âš¡ Tiempo dashboard:", `${Date.now() - inicio}ms`);
    return res.json(response);
  } catch (error) {
    console.error("âŒ ERROR KPI:", error);
    console.error("âŒ ERROR DASHBOARD ALERTAS:", error);
    return res.status(500).json({ message: "Error obteniendo dashboard de alertas" });
  }
};

export const tomarGestionAlertaDashboard = async (req, res) => {
  try {
    const observaciones = String(req.body?.observaciones || "").trim();
    const alerta = await tomarGestionAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      observaciones
    });

    if (!alerta) return res.status(404).json({ message: "Alerta no encontrada" });
    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_EN_GESTION",
      observacion: observaciones || "Gestion tomada"
    });

    console.log("ALERTA EN GESTION", {
      alertaId: alerta._id,
      estado: alerta.estado,
      patente: alerta.patente
    });
    return res.json({ message: "Gestion tomada", alerta: mapAlerta(alerta, req.user) });
  } catch (error) {
    console.error("❌ ERROR GESTIONANDO ALERTA:", error);
    return res.status(400).json({ message: error?.message || "Error tomando gestion" });
  }
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
    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_CERRADA",
      observacion: solucion || observaciones || "Alerta cerrada"
    });

    console.log("ALERTA CERRADA", {
      alertaId: alerta._id,
      estado: alerta.estado,
      patente: alerta.patente
    });
    return res.json({ message: "Alerta cerrada", alerta: mapAlerta(alerta, req.user) });
  } catch (error) {
    console.error("âŒ ERROR CERRANDO ALERTA:", error);
    return res.status(500).json({ message: "Error cerrando alerta" });
  }
};

