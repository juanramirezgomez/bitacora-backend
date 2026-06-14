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

export const ESTADOS_ALERTA_FLUJO = ["ABIERTA", "ASIGNADA", "EN_PROCESO", "RESUELTA", "CERRADA"];
const RESPONSABLE_ROLES = ["ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR", "OPERADOR_LIDER"];

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
  if (value === "ASIGNADA") return "ASIGNADA";
  if (value.includes("PROCESO")) return "EN_PROCESO";
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

const categoriaHallazgo = (alerta = {}) => {
  const categoria = normalizeText(alerta.categoria);
  const seccion = normalizeText(alerta.seccion);
  const tipo = normalizeText(alerta.tipo);
  if (categoria.includes("FATIGA")) return "FATIGA_SOMNOLENCIA";
  if (categoria.includes("CARROCERIA") || seccion.includes("CARROCERIA")) return "CARROCERIA";
  if (categoria.includes("MANTENCION")) return "MANTENCIONES";
  if (categoria.includes("DOCUMENTACION") || ["LICENCIA", "REVISION", "PERMISO", "SEGURO", "CERTIFICACION"].some((x) => tipo.includes(x))) return "DOCUMENTACION";
  if (normalizePriority(alerta.prioridad) === "CRITICA") return "CONDICIONES_CRITICAS";
  return "CONDICIONES_NO_CRITICAS";
};

const estructurarHallazgos = (alertas = []) => alertas.flatMap((alerta) => {
  const detalles = Array.isArray(alerta.anomalias) && alerta.anomalias.length
    ? alerta.anomalias
    : [descripcionAlerta(alerta)];
  return detalles.filter(Boolean).map((detalle) => ({
    categoria: categoriaHallazgo(alerta),
    tipo: alerta.tipo || "",
    prioridad: prioridadOperacional(alerta),
    titulo: alerta.documento || alerta.item || alerta.seccion || alerta.titulo || alerta.tipo || "",
    detalle,
    observacion: alerta.observacion || "",
    fechaVencimiento: alerta.fechaVencimiento || null,
    diasRestantes: Number.isFinite(alerta.diasRestantes) ? alerta.diasRestantes : null
  }));
});

const resumirHallazgos = (hallazgos = []) => {
  const resumen = { documentacion: 0, mantenciones: 0, seguridad: 0, fatiga: 0, carroceria: 0, total: hallazgos.length };
  for (const item of hallazgos) {
    if (item.categoria === "DOCUMENTACION") resumen.documentacion += 1;
    else if (item.categoria === "MANTENCIONES") resumen.mantenciones += 1;
    else if (item.categoria === "FATIGA_SOMNOLENCIA") resumen.fatiga += 1;
    else if (item.categoria === "CARROCERIA") resumen.carroceria += 1;
    else resumen.seguridad += 1;
  }
  return resumen;
};

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
    const existente = await AlertaCamioneta.findOne({
      checklistId: checklist._id,
      tipo: "CHECKLIST_CAMIONETA_CONSOLIDADO",
      estado: { $nin: ["RESUELTA", "CERRADA"] }
    });
    if (existente) {
      const estadoAnterior = normalizeEstado(existente.estado);
      existente.estado = "RESUELTA";
      existente.activo = true;
      existente.resolucionAutomatica = true;
      existente.solucion = "Condicion ya no detectada.";
      existente.accionCorrectiva = "Condicion ya no detectada.";
      existente.fechaResolucion = new Date();
      existente.fechaUltimoMovimiento = new Date();
      existente.hallazgos = [];
      existente.resumenHallazgos = resumirHallazgos([]);
      await existente.save();
      await crearSeguimiento({
        alerta: existente,
        user: { nombre: "Sistema", rol: "SISTEMA" },
        tipoEvento: "RESOLUCION_AUTOMATICA",
        estadoAnterior,
        estadoNuevo: "RESUELTA",
        comentario: "Condicion ya no detectada."
      });
    }
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
  const hallazgos = estructurarHallazgos(alertas);
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
        observacionesChecklist: String(checklist.observacionesGenerales || checklist.observacionesCarroceria || ""),
        documentacionChecklist: (checklist.documentacion || []).map((item) => ({
          nombre: item.nombre || "",
          estado: item.estado || "",
          fechaVencimiento: item.fechaVencimiento || null
        })),
        hallazgos,
        resumenHallazgos: resumirHallazgos(hallazgos),
        resolucionAutomatica: false,
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
  if (!["ABIERTA", "ASIGNADA"].includes(alerta.estado)) {
    throw new Error("Solo se puede asignar o reasignar una alerta abierta/asignada");
  }
  if (alerta.estado === "ASIGNADA" && !["ADMIN", "SUPERINTENDENTE"].includes(normalizeText(userRol(user)))) {
    throw new Error("Solo ADMIN o SUPERINTENDENTE puede reasignar una alerta");
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
  const estadoAnterior = alerta.estado;
  alerta.estado = "ASIGNADA";
  alerta.fechaAsignacion = new Date();
  alerta.fechaUltimoMovimiento = new Date();
  if (fechaCompromiso) alerta.fechaCompromiso = new Date(fechaCompromiso);
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "ASIGNACION",
    estadoAnterior,
    estadoNuevo: "ASIGNADA",
    comentario: `Alerta asignada a ${alerta.responsableNombre}`
  });
  return alerta.toObject();
};

export const marcarAlertaEnProceso = async ({ id, user, observaciones }) => {
  const alerta = await AlertaCamioneta.findById(id);
  if (!alerta) return null;
  alerta.estado = normalizeEstado(alerta.estado);
  validarTransicion(alerta.estado, "EN_PROCESO");
  const comentario = String(observaciones || "").trim();
  if (!comentario) throw new Error("Comentario de inicio de gestion obligatorio");
  if (alerta.estado !== "ASIGNADA") {
    throw new Error("Solo una alerta asignada puede iniciar gestion");
  }
  alerta.estado = "EN_PROCESO";
  alerta.fechaUltimoMovimiento = new Date();
  await alerta.save();
  await crearSeguimiento({
    alerta,
    user,
    tipoEvento: "CAMBIO_ESTADO",
    estadoAnterior: "ASIGNADA",
    estadoNuevo: "EN_PROCESO",
    comentario
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
    estadoAnterior: "EN_PROCESO",
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
  const cierre = String(solucion || "").trim();
  if (!cierre) throw new Error("Comentario de cierre obligatorio");
  alerta.estado = "CERRADA";
  alerta.comentarioCierre = cierre;
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
    estado: { $in: ["ABIERTA", "ASIGNADA", "EN_PROCESO"] }
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
