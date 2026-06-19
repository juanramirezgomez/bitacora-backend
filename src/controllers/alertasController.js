import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import mongoose from "mongoose";
import {
  adjuntarEvidenciaAlerta,
  agregarComentarioAlerta,
  cerrarAlertaCamioneta,
  evaluarEscalamientoAlertas,
  obtenerSeguimientoAlerta,
  tomarGestionAlertaCamioneta
} from "../services/alertaCamionetaService.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const uploadDir = path.join(process.cwd(), "src", "uploads", "alertas");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  }
});

export const uploadAlertaEvidencias = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato no permitido"), ok);
  }
});

const permisosGestion = (user = {}, alerta = {}) => {
  const rol = String(user.rol || "").toUpperCase();
  const estado = String(alerta.estado || "ABIERTA").toUpperCase();
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

export const mapAlerta = (alerta, seguimiento = [], user = {}) => ({
  id: String(alerta._id),
  patente: alerta.patente || "-",
  tipo: alerta.tipo || "ALERTA_OPERACIONAL",
  descripcion: alerta.descripcion || alerta.observaciones || "",
  prioridad: alerta.prioridad || "MEDIA",
  estado: alerta.estado || "ABIERTA",
  responsable: alerta.responsable || alerta.responsableNombre || "-",
  responsableId: alerta.responsableId || null,
  responsableNombre: alerta.responsableNombre || alerta.responsable || "",
  responsableRol: alerta.responsableRol || "",
  accionCorrectiva: alerta.accionCorrectiva || alerta.solucion || "",
  solucion: alerta.solucion || alerta.accionCorrectiva || "",
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
  checklistId: alerta.checklistId || null,
  fotos: alerta.fotos || [],
  origen: inferirOrigenAlerta(alerta),
  seguimiento,
  permisos: permisosGestion(user, alerta)
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

const requireAlerta = (alerta, res) => {
  if (alerta) return false;
  res.status(404).json({ message: "Alerta no encontrada" });
  return true;
};

const esOperadorSoloPropias = (user = {}) => ["OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"].includes(String(user.rol || "").toUpperCase());

const parsePagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limitRaw = Number.parseInt(query.limit, 10) || 50;
  const limit = Math.min(Math.max(1, limitRaw), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const puedeVerAlerta = (alerta, user = {}) => {
  if (!esOperadorSoloPropias(user)) return true;
  const userId = String(user.id || user._id || user.uid || "");
  return userId && String(alerta?.creadoPor || "") === userId;
};

export const listarAlertas = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { activo: { $ne: false } };
    const patente = String(req.query?.patente || "").trim();
    const estado = String(req.query?.estado || "").trim().toUpperCase();
    const prioridad = String(req.query?.prioridad || "").trim().toUpperCase();
    const tipo = String(req.query?.tipo || "").trim();

    if (patente) filter.patente = { $regex: patente, $options: "i" };
    if (estado) filter.estado = estado;
    if (prioridad) filter.prioridad = prioridad;
    if (tipo) filter.tipo = { $regex: tipo, $options: "i" };
    if (esOperadorSoloPropias(req.user)) {
      const id = req.user?.id || req.user?._id || req.user?.uid;
      if (id && mongoose.Types.ObjectId.isValid(String(id))) {
        filter.creadoPor = new mongoose.Types.ObjectId(String(id));
      }
    }

    const [alertasRaw, total] = await Promise.all([
      AlertaCamioneta.find(filter)
        .select("patente prioridad estado tipo descripcion operador responsable responsableNombre comentarioCierre observaciones hallazgos resumenHallazgos fechaCreacion fechaInicioGestion fechaCierre fechaUltimoMovimiento checklistId fotos creadoPor")
        .populate("checklistId", "conductorResponsable fechaInspeccion aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante patente")
        .sort({ fechaCreacion: -1 })
        .skip(skip)
        .limit(limit)
        .allowDiskUse(true)
        .lean(),
      AlertaCamioneta.countDocuments(filter)
    ]);
    const datos = alertasRaw.map((alerta) => mapAlerta(alerta, [], req.user));
    return res.json({
      alertas: datos,
      datos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error("ERROR LISTANDO ALERTAS", error);
    return res.status(500).json({ message: "Error listando alertas" });
  }
};

export const obtenerDetalleAlerta = async (req, res) => {
  try {
    const alerta = await AlertaCamioneta.findById(req.params.id)
      .populate("checklistId", "conductorResponsable fechaInspeccion turno turnoNumero aptaOperacion aptitudOperacion motivoNoApta alertaDetonante prioridadDetonante categoriaDetonante patente")
      .lean();
    if (requireAlerta(alerta, res)) return;
    if (!puedeVerAlerta(alerta, req.user)) return res.status(403).json({ message: "Sin permisos" });
    const seguimiento = await obtenerSeguimientoAlerta(alerta._id);
    return res.json({ alerta: mapAlerta(alerta, seguimiento, req.user) });
  } catch (error) {
    console.error("ERROR DETALLE ALERTA", error);
    return res.status(500).json({ message: "Error obteniendo detalle de alerta" });
  }
};

export const tomarGestionAlerta = async (req, res) => {
  try {
    const alerta = await tomarGestionAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      observaciones: req.body?.observaciones
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_EN_GESTION",
      observacion: `Gestion tomada por ${alerta.responsableNombre || alerta.responsable}`
    });

    return res.json({ message: "Gestion tomada", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id), req.user) });
  } catch (error) {
    console.error("ERROR TOMANDO GESTION ALERTA", error);
    return res.status(400).json({ message: error?.message || "Error tomando gestion de alerta" });
  }
};

export const comentarAlerta = async (req, res) => {
  try {
    const acceso = await AlertaCamioneta.findById(req.params.id).select("creadoPor").lean();
    if (requireAlerta(acceso, res)) return;
    if (!puedeVerAlerta(acceso, req.user)) return res.status(403).json({ message: "Sin permisos" });
    const alerta = await agregarComentarioAlerta({
      id: req.params.id,
      user: req.user,
      comentario: req.body?.comentario
    });
    if (requireAlerta(alerta, res)) return;
    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_COMENTARIO",
      observacion: String(req.body?.comentario || "").trim()
    });
    return res.json({ message: "Comentario registrado", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id), req.user) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error agregando comentario" });
  }
};

export const adjuntarEvidencia = async (req, res) => {
  try {
    const acceso = await AlertaCamioneta.findById(req.params.id).select("creadoPor").lean();
    if (requireAlerta(acceso, res)) return;
    if (!puedeVerAlerta(acceso, req.user)) return res.status(403).json({ message: "Sin permisos" });
    const alerta = await adjuntarEvidenciaAlerta({
      id: req.params.id,
      user: req.user,
      files: req.files || [],
      tipo: String(req.body?.tipo || "GENERAL").toUpperCase(),
      comentario: req.body?.comentario
    });
    if (requireAlerta(alerta, res)) return;
    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_EVIDENCIA",
      observacion: `Evidencias adjuntas: ${(req.files || []).length}`
    });
    return res.json({ message: "Evidencia adjunta", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id), req.user) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error adjuntando evidencia" });
  }
};

export const cerrarAlerta = async (req, res) => {
  try {
    const accionCorrectiva = String(req.body?.accionCorrectiva || req.body?.solucion || "").trim();
    if (!accionCorrectiva) return res.status(400).json({ message: "accionCorrectiva es obligatoria para cerrar" });

    const alerta = await cerrarAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      solucion: accionCorrectiva,
      observaciones: req.body?.observaciones
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_CERRADA",
      observacion: accionCorrectiva
    });

    return res.json({ message: "Alerta cerrada", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id), req.user) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error cerrando alerta" });
  }
};

export const evaluarEscalamiento = async (req, res) => {
  try {
    const resultados = await evaluarEscalamientoAlertas({ notificar: false });
    for (const item of resultados) {
      await registrarEvento({
        req,
        modulo: "ALERTAS",
        entidad: "AlertaCamioneta",
        entidadId: item.alertaId,
        accion: "ALERTA_ESCALADA",
        observacion: item.comentario
      });
    }
    return res.json({ message: "Escalamiento evaluado", resultados });
  } catch (error) {
    return res.status(500).json({ message: "Error evaluando escalamiento" });
  }
};
