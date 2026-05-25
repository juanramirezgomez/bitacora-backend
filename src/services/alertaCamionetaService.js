import AlertaCamioneta from "../models/AlertaCamioneta.js";
import { emitDashboardAlertasUpdate } from "./realtimeService.js";

const PRIORIDAD_ORDEN = {
  CRITICA: 4,
  ALTA: 3,
  MEDIA: 2,
  BAJA: 1
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const normalizePriority = (prioridad) => {
  const value = normalizeText(prioridad);
  if (value.includes("CRIT")) return "CRITICA";
  if (value.includes("ALT")) return "ALTA";
  if (value.includes("BAJ")) return "BAJA";
  return "MEDIA";
};

const prioridadItemMalo = (alerta) => {
  const text = normalizeText(`${alerta.tipo} ${alerta.item} ${alerta.descripcion} ${alerta.mensaje}`);
  if ([
    "FRENOS",
    "FRENO DE MANO",
    "NEUMATICO",
    "LUCES DE FRENO",
    "EXTINTOR",
    "ALARMA DE RETROCESO",
    "BOCINA",
    "CINTURONES"
  ].some((word) => text.includes(word))) {
    return "CRITICA";
  }
  if (text.includes("BALIZA") || text.includes("REVISION TECNICA") || text.includes("LICENCIA")) {
    return "ALTA";
  }
  return normalizePriority(alerta.prioridad);
};

const prioridadOperacional = (alerta) => {
  const base = normalizePriority(alerta.prioridad);
  const porItem = prioridadItemMalo(alerta);
  return PRIORIDAD_ORDEN[porItem] > PRIORIDAD_ORDEN[base] ? porItem : base;
};

const descripcionAlerta = (alerta) => {
  const anomalias = Array.isArray(alerta.anomalias) ? alerta.anomalias.filter(Boolean) : [];
  return anomalias[0] || alerta.mensaje || alerta.titulo || alerta.tipo;
};

const buildDedupeKey = (checklist, alerta) => [
  checklist?._id,
  alerta.tipo,
  normalizeText(alerta.item || alerta.documento || descripcionAlerta(alerta)).slice(0, 90)
].join(":");

export const sincronizarAlertasOperacionalesChecklist = async (checklist, alertas = []) => {
  if (!checklist?._id || !Array.isArray(alertas) || !alertas.length) return [];

  const fotos = Array.isArray(checklist.fotosObservaciones)
    ? checklist.fotosObservaciones.slice(0, 4).map((foto) => ({
      nombre: foto.nombre || "",
      ruta: foto.ruta || "",
      fecha: foto.fecha || null
    }))
    : [];

  const resultados = [];
  for (const alerta of alertas) {
    const descripcion = descripcionAlerta(alerta);
    const dedupeKey = buildDedupeKey(checklist, alerta);
    const update = {
      $setOnInsert: {
        checklistId: checklist._id,
        tipo: alerta.tipo,
        fechaCreacion: new Date(),
        creadoPor: checklist.creadoPor?._id || checklist.creadoPor || null,
        estado: "ABIERTA",
        dedupeKey
      },
      $set: {
        patente: checklist.patente || alerta.patente || "",
        descripcion,
        prioridad: prioridadOperacional(alerta),
        operador: alerta.operador || checklist.conductorResponsable || "",
        observaciones: alerta.observacion || alerta.mensaje || "",
        fotos,
        activo: true
      }
    };

    const doc = await AlertaCamioneta.findOneAndUpdate(
      { dedupeKey },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    resultados.push(doc);
  }

  console.log("🚨 ALERTAS OPERACIONALES SINCRONIZADAS", {
    checklistId: checklist._id,
    patente: checklist.patente,
    total: resultados.length
  });
  if (resultados.length) {
    emitDashboardAlertasUpdate({
      type: "alertas:creadas",
      checklistId: checklist._id,
      patente: checklist.patente,
      total: resultados.length
    });
  }
  return resultados;
};

export const resolverAlertaCamioneta = async ({ id, user, estado = "RESUELTA", solucion, responsable, observaciones }) => {
  const estadoFinal = String(estado || "RESUELTA").toUpperCase();
  const update = {
    estado: estadoFinal,
    solucion: String(solucion || "").trim(),
    responsable: String(responsable || user?.nombre || user?.username || "").trim(),
    observaciones: String(observaciones || "").trim(),
    resueltoPor: user?.uid || user?._id || null,
    fechaResolucion: new Date()
  };

  if (estadoFinal === "CERRADA") {
    update.cerradoPor = user?.uid || user?._id || null;
    update.fechaCierre = new Date();
  }

  const alerta = await AlertaCamioneta.findByIdAndUpdate(id, update, { new: true }).lean();
  if (alerta) {
    emitDashboardAlertasUpdate({
      type: "alerta:gestionada",
      alertaId: alerta._id,
      patente: alerta.patente,
      estado: alerta.estado
    });
  }
  return alerta;
};

export const cerrarAlertaCamioneta = async ({ id, user, solucion, observaciones }) => {
  return resolverAlertaCamioneta({
    id,
    user,
    estado: "CERRADA",
    solucion,
    observaciones,
    responsable: user?.nombre || user?.username || ""
  });
};
