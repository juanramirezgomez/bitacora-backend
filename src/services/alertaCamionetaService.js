import AlertaCamioneta from "../models/AlertaCamioneta.js";
import AlertaSeguimiento from "../models/AlertaSeguimiento.js";
import User from "../models/user.js";
import { registrarEvento } from "./operationalAuditService.js";

const PRIORIDAD_ORDEN = {
  CRITICA: 4,
  ALTA: 3,
  MEDIA: 2,
  BAJA: 1
};

export const ESTADOS_ALERTA_FLUJO = ["ABIERTA", "RESUELTA", "CERRADA"];
const RESPONSABLE_ROLES = ["SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "OPERADOR_LIDER"];

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

const normalizeEstado = (estado = "ABIERTA") => {
  const value = normalizeText(estado);
  if (value === "ASIGNADA" || value.includes("PROCESO")) return "ABIERTA";
  if (value.includes("RESUEL")) return "RESUELTA";
  if (value.includes("CERRA")) return "CERRADA";
  return "ABIERTA";
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

const buildDedupeKey = (checklist) => `${checklist?._id}:CHECKLIST_CAMIONETA_CONSOLIDADO`;

const prioridadConsolidada = (alertas = []) =>
  alertas.reduce((mayor, alerta) => {
    const prioridad = prioridadOperacional(alerta);
    return PRIORIDAD_ORDEN[prioridad] > PRIORIDAD_ORDEN[mayor] ? prioridad : mayor;
  }, "BAJA");

const resumenConsolidado = (alertas = []) => alertas
  .flatMap((alerta) => {
    const anomalias = Array.isArray(alerta.anomalias) ? alerta.anomalias.filter(Boolean) : [];
    return anomalias.length ? anomalias : [descripcionAlerta(alerta)];
  })
  .filter(Boolean)
  .map((item) => `- ${item}`)
  .join("\n");

const userId = (user = {}) => user?.uid || user?._id || user?.id || null;
const userName = (user = {}) => user?.nombre || user?.username || user?.email || "Usuario";
const userRol = (user = {}) => user?.rol || "";

const validarTransicion = (estadoActual, estadoNuevo) => {
  const actual = normalizeEstado(estadoActual);
  const nuevo = normalizeEstado(estadoNuevo);
  if (actual === nuevo) return;
  const actualIndex = ESTADOS_ALERTA_FLUJO.indexOf(actual);
  const nuevoIndex = ESTADOS_ALERTA_FLUJO.indexOf(nuevo);
  if (actualIndex < 0 || nuevoIndex < 0 || nuevoIndex !== actualIndex + 1) {
    throw new Error(`Transicion no permitida: ${actual} -> ${nuevo}`);
  }
};

const crearSeguimiento = async ({
  alerta,
  user,
  comentario = "",
  tipoEvento = "COMENTARIO",
  estadoAnterior = "",
  estadoNuevo = "",
  evidencias = []
}) => AlertaSeguimiento.create({
  alertaId: alerta._id,
  usuarioId: userId(user),
  nombreUsuario: userName(user),
  rol: userRol(user),
  comentario,
  tipoEvento,
  estadoAnterior,
  estadoNuevo,
  evidencias,
  fecha: new Date()
});

export const sincronizarAlertasOperacionalesChecklist = async (checklist, alertas = []) => {
  if (!checklist?._id || !Array.isArray(alertas)) return [];
  if (!alertas.length) {
    await AlertaCamioneta.updateMany(
      { checklistId: checklist._id, estado: "ABIERTA" },
      { $set: { activo: false, fechaUltimoMovimiento: new Date() } }
    );
    return [];
  }

  const fotos = Array.isArray(checklist.fotosObservaciones)
    ? checklist.fotosObservaciones.slice(0, 4).map((foto) => ({
      nombre: foto.nombre || "",
      ruta: foto.ruta || "",
      tipo: "GENERAL",
      fecha: foto.fecha || null
    }))
    : [];

  const dedupeKey = buildDedupeKey(checklist);
  const existente = await AlertaCamioneta.exists({ dedupeKey });
  const resumen = resumenConsolidado(alertas);
  const doc = await AlertaCamioneta.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        checklistId: checklist._id,
        tipo: "CHECKLIST_CAMIONETA_CONSOLIDADO",
        fechaCreacion: new Date(),
        fechaUltimoMovimiento: new Date(),
        creadoPor: checklist.creadoPor?._id || checklist.creadoPor || null,
        estado: "ABIERTA",
        dedupeKey
      },
      $set: {
        patente: checklist.patente || "",
        descripcion: `Checklist ${checklist.patente || ""}: ${alertas.length} hallazgo(s) consolidado(s)`,
        prioridad: prioridadConsolidada(alertas),
        operador: checklist.conductorResponsable || "",
        observaciones: resumen,
        fotos,
        activo: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  await AlertaCamioneta.updateMany(
    { checklistId: checklist._id, _id: { $ne: doc._id } },
    { $set: { activo: false } }
  );

  if (!existente) {
    await registrarEvento({
      usuario: checklist.creadoPor || {},
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: doc?._id,
      accion: "ALERTA_CREADA",
      observacion: `Alerta consolidada para patente ${doc?.patente || checklist.patente || ""}`.trim()
    });
    await crearSeguimiento({
      alerta: doc,
      user: checklist.creadoPor || {},
      tipoEvento: "CAMBIO_ESTADO",
      estadoNuevo: "ABIERTA",
      comentario: `Alerta consolidada creada automaticamente con ${alertas.length} hallazgo(s)`
    });
  }

  console.log("ALERTAS OPERACIONALES SINCRONIZADAS", {
    checklistId: checklist._id,
    patente: checklist.patente,
    total: 1,
    hallazgos: alertas.length
  });
  return [doc];
};

export const obtenerSeguimientoAlerta = async (alertaId) =>
  AlertaSeguimiento.find({ alertaId }).sort({ fecha: 1, createdAt: 1 }).lean();

export const agregarComentarioAlerta = async ({ id, user, comentario }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  const texto = String(comentario || "").trim();
  if (!texto) throw new Error("Comentario obligatorio");
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({ alerta, user, comentario: texto, tipoEvento: "COMENTARIO" });
  return alerta.toObject();
};

export const adjuntarEvidenciaAlerta = async ({ id, user, files = [], tipo = "GENERAL", comentario = "" }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  const evidencias = files.map((file) => ({
    nombre: file.originalname || file.filename || "",
    url: `/uploads/alertas/${file.filename}`,
    ruta: `/uploads/alertas/${file.filename}`,
    tipo,
    fecha: new Date(),
    usuarioId: userId(user),
    usuarioNombre: userName(user)
  }));
  alerta.fotos.push(...evidencias.map((item) => ({
    nombre: item.nombre,
    ruta: item.url,
    tipo: item.tipo,
    fecha: item.fecha,
    usuarioId: item.usuarioId,
    usuarioNombre: item.usuarioNombre
  })));
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    comentario: comentario || `Evidencia ${tipo.toLowerCase()} adjunta`,
    tipoEvento: "EVIDENCIA",
    evidencias
  });
  return alerta.toObject();
};

export const asignarAlertaCamioneta = async ({ id, user, responsableId, responsable, fechaCompromiso }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  alerta.estado = normalizeEstado(alerta.estado);
  if (alerta.estado !== "ABIERTA") {
    throw new Error("Solo se puede asignar una alerta abierta");
  }

  let responsableUser = null;
  if (responsableId) {
    responsableUser = await User.findById(responsableId).select("nombre rol estado activo").lean();
  }
  if (responsableUser && (!RESPONSABLE_ROLES.includes(responsableUser.rol) || responsableUser.estado !== "ACTIVO" || responsableUser.activo === false)) {
    throw new Error("Responsable no habilitado para alertas");
  }

  alerta.responsableId = responsableUser?._id || null;
  alerta.responsableNombre = responsableUser?.nombre || String(responsable || userName(user)).trim();
  alerta.responsableRol = responsableUser?.rol || "";
  alerta.responsable = alerta.responsableNombre;
  alerta.fechaAsignacion = new Date();
  alerta.fechaUltimoMovimiento = new Date();
  if (fechaCompromiso) alerta.fechaCompromiso = new Date(fechaCompromiso);
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "ASIGNACION",
    estadoAnterior: "ABIERTA",
    estadoNuevo: "ABIERTA",
    comentario: `Alerta asignada a ${alerta.responsableNombre}`
  });
  return alerta.toObject();
};

export const marcarAlertaEnProceso = async ({ id, user, observaciones }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  alerta.estado = normalizeEstado(alerta.estado);
  if (alerta.estado !== "ABIERTA") {
    throw new Error("Solo se puede gestionar una alerta abierta");
  }
  alerta.observaciones = String(observaciones || alerta.observaciones || "").trim();
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "CAMBIO_ESTADO",
    estadoAnterior: "ABIERTA",
    estadoNuevo: "ABIERTA",
    comentario: alerta.observaciones || "Alerta gestionada sin cambio de estado"
  });
  return alerta.toObject();
};

export const resolverAlertaCamioneta = async ({ id, user, solucion, observaciones }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  alerta.estado = normalizeEstado(alerta.estado);
  validarTransicion(alerta.estado, "RESUELTA");
  const accionCorrectiva = String(solucion || "").trim();
  if (!accionCorrectiva) throw new Error("Accion correctiva obligatoria");
  alerta.estado = "RESUELTA";
  alerta.accionCorrectiva = accionCorrectiva;
  alerta.solucion = accionCorrectiva;
  alerta.observaciones = String(observaciones || alerta.observaciones || "").trim();
  alerta.resueltoPor = userId(user);
  alerta.fechaResolucion = new Date();
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "CAMBIO_ESTADO",
    estadoAnterior: "ABIERTA",
    estadoNuevo: "RESUELTA",
    comentario: accionCorrectiva
  });
  return alerta.toObject();
};

export const cerrarAlertaCamioneta = async ({ id, user, solucion, observaciones }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  alerta.estado = normalizeEstado(alerta.estado);
  validarTransicion(alerta.estado, "CERRADA");
  const cierre = String(solucion || alerta.solucion || "").trim();
  if (!cierre) throw new Error("Solucion final obligatoria");
  alerta.estado = "CERRADA";
  alerta.solucion = cierre;
  alerta.accionCorrectiva = alerta.accionCorrectiva || cierre;
  alerta.observaciones = String(observaciones || alerta.observaciones || "").trim();
  alerta.cerradoPor = userId(user);
  alerta.fechaCierre = new Date();
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "CAMBIO_ESTADO",
    estadoAnterior: "RESUELTA",
    estadoNuevo: "CERRADA",
    comentario: cierre
  });
  return alerta.toObject();
};

export const evaluarEscalamientoAlertas = async ({ notificar = false } = {}) => {
  const ahora = new Date();
  const hace48 = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const hace72 = new Date(ahora.getTime() - 72 * 60 * 60 * 1000);
  const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const alertas = await AlertaCamioneta.find({
    activo: { $ne: false },
    prioridad: "CRITICA",
    estado: "ABIERTA"
  }).limit(200);

  const resultados = [];
  for (const alerta of alertas) {
    const movimiento = alerta.fechaUltimoMovimiento || alerta.fechaCreacion || alerta.createdAt;
    let nivel = alerta.nivelEscalamiento || 0;
    let comentario = "";
    if (movimiento <= hace7d && nivel < 3) {
      nivel = 3;
      alerta.escalada = true;
      alerta.prioridad = "CRITICA";
      comentario = "Alerta critica escalada por 7 dias abierta";
    } else if (movimiento <= hace72 && nivel < 2) {
      nivel = 2;
      comentario = "Alerta critica escalada a Superintendente por 72 horas sin movimiento";
    } else if (movimiento <= hace48 && nivel < 1) {
      nivel = 1;
      comentario = "Recordatorio por alerta critica 48 horas sin movimiento";
    }
    if (!comentario) continue;
    alerta.nivelEscalamiento = nivel;
    alerta.fechaEscalamiento = ahora;
    alerta.fechaUltimoMovimiento = ahora;
    await alerta.save();
    await crearSeguimiento({
      alerta,
      user: {},
      tipoEvento: "ESCALAMIENTO",
      comentario
    });
    resultados.push({ alertaId: alerta._id, nivel, comentario, notificar });
  }
  return resultados;
};
