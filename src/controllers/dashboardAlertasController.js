import HistorialAlerta from "../models/HistorialAlerta.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];

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

const hasBadItems = (checklist) => {
  const sections = [
    checklist.aspectosInspeccionar,
    checklist.estadoCamioneta,
    checklist.frenosDireccion,
    checklist.luces
  ];

  return sections
    .flatMap((section) => Array.isArray(section) ? section : [])
    .some((item) => String(item?.estado || "").toUpperCase() === "MALO");
};

const estadoOperacionalCamioneta = (checklist) => {
  if (String(checklist.aptitudOperacion || "").toUpperCase() === "NO_APTA" || checklist.aptaOperacion === false) {
    return "FUERA_SERVICIO";
  }

  if (hasBadItems(checklist)) return "OBSERVACION";

  return "OPERATIVA";
};

const mapRecentAlert = (alerta) => ({
  id: String(alerta._id),
  prioridad: normalizePriority(alerta.prioridad),
  patente: alerta.patente || "-",
  tipo: alerta.tipo || "ALERTA_OPERACIONAL",
  operador: alerta.operador || "-",
  canal: alerta.canal || "-",
  estado: alerta.estado || "-",
  fecha: alerta.createdAt || alerta.fecha
});

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

    const [
      alertasPorPrioridadRaw,
      alertasTendenciaRaw,
      alertasRecientesRaw,
      criticas,
      activas,
      checklistsHoy,
      checklistsPorDiaRaw,
      latestChecklists
    ] = await Promise.all([
      HistorialAlerta.aggregate([
        { $match: { createdAt: { $gte: last30Start }, estado: { $ne: "omitido" } } },
        { $group: { _id: "$prioridad", total: { $sum: 1 } } }
      ]),
      HistorialAlerta.aggregate([
        { $match: { createdAt: { $gte: last7Start }, estado: { $ne: "omitido" } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      HistorialAlerta.find({ estado: { $ne: "omitido" } })
        .select("tipo prioridad patente operador canal estado fecha createdAt")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      HistorialAlerta.countDocuments({
        createdAt: { $gte: last30Start },
        prioridad: /CRIT/i,
        estado: { $ne: "omitido" }
      }),
      HistorialAlerta.countDocuments({
        createdAt: { $gte: last30Start },
        estado: { $in: ["enviado", "error"] }
      }),
      ChecklistCamioneta.countDocuments({
        eliminado: { $ne: true },
        $or: [
          { fechaInspeccion: { $gte: today, $lt: tomorrow } },
          { fechaCreacion: { $gte: today, $lt: tomorrow } },
          { createdAt: { $gte: today, $lt: tomorrow } }
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
        .select("patente estado aptaOperacion aptitudOperacion fechaInspeccion fechaCreacion createdAt conductorResponsable aspectosInspeccionar.estado estadoCamioneta.estado frenosDireccion.estado luces.estado")
        .sort({ fechaInspeccion: -1, createdAt: -1 })
        .limit(120)
        .lean()
    ]);

    console.log("⚡ Tiempo Mongo dashboard:", `${Date.now() - mongoInicio}ms`);

    const prioridadMap = new Map();
    for (const item of alertasPorPrioridadRaw) {
      const key = normalizePriority(item._id);
      prioridadMap.set(key, (prioridadMap.get(key) || 0) + item.total);
    }

    const alertasPorPrioridad = PRIORIDADES.map((prioridad) => ({
      prioridad,
      total: prioridadMap.get(prioridad) || 0
    }));

    const tendencias = buildLastDays(7);
    const tendenciaMap = new Map(alertasTendenciaRaw.map((item) => [item._id, item.total]));
    tendencias.forEach((item) => {
      item.total = tendenciaMap.get(item.fecha) || 0;
    });

    const checklistsPorDia = buildLastDays(7);
    const checklistMap = new Map(checklistsPorDiaRaw.map((item) => [item._id, item.total]));
    checklistsPorDia.forEach((item) => {
      item.total = checklistMap.get(item.fecha) || 0;
    });

    const latestByPatente = new Map();
    for (const checklist of latestChecklists) {
      const patente = String(checklist.patente || "").trim().toUpperCase();
      if (patente && !latestByPatente.has(patente)) {
        latestByPatente.set(patente, checklist);
      }
    }

    const estadosCamionetas = Array.from(latestByPatente.values())
      .slice(0, 12)
      .map((checklist) => ({
        patente: checklist.patente,
        estado: estadoOperacionalCamioneta(checklist),
        ultimaInspeccion: checklist.fechaInspeccion || checklist.fechaCreacion || checklist.createdAt,
        conductor: checklist.conductorResponsable || "-"
      }));

    const camionetasOperativas = estadosCamionetas.filter((item) => item.estado === "OPERATIVA").length;

    const response = {
      criticas,
      activas,
      checklistsHoy,
      camionetasOperativas,
      alertasPorPrioridad,
      checklistsPorDia,
      alertasRecientes: alertasRecientesRaw.map(mapRecentAlert),
      tendencias,
      estadosCamionetas,
      actualizadoEn: new Date()
    };

    console.log("⚡ Tiempo dashboard:", `${Date.now() - inicio}ms`);
    return res.json(response);
  } catch (error) {
    console.error("❌ ERROR DASHBOARD ALERTAS:", error);
    return res.status(500).json({ message: "Error obteniendo dashboard de alertas" });
  }
};
