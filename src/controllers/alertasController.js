import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import {
  adjuntarEvidenciaAlerta,
  agregarComentarioAlerta,
  asignarAlertaCamioneta,
  cerrarAlertaCamioneta,
  evaluarEscalamientoAlertas,
  marcarAlertaEnProceso,
  obtenerSeguimientoAlerta,
  resolverAlertaCamioneta
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

export const mapAlerta = (alerta, seguimiento = []) => ({
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
  observaciones: alerta.observaciones || "",
  fecha: alerta.fechaCreacion || alerta.createdAt,
  fechaAsignacion: alerta.fechaAsignacion || null,
  fechaResolucion: alerta.fechaResolucion || null,
  fechaCierre: alerta.fechaCierre || null,
  fechaCompromiso: alerta.fechaCompromiso || null,
  fechaUltimoMovimiento: alerta.fechaUltimoMovimiento || null,
  escalada: alerta.escalada || false,
  nivelEscalamiento: alerta.nivelEscalamiento || 0,
  checklistId: alerta.checklistId || null,
  fotos: alerta.fotos || [],
  origen: inferirOrigenAlerta(alerta),
  seguimiento
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

const esOperadorSoloPropias = (user = {}) => ["OPERADOR_PLANTA", "OPERADOR"].includes(String(user.rol || "").toUpperCase());

const puedeVerAlerta = (alerta, user = {}) => {
  if (!esOperadorSoloPropias(user)) return true;
  const userId = String(user.id || user._id || user.uid || "");
  return userId && String(alerta?.creadoPor || "") === userId;
};

export const obtenerDetalleAlerta = async (req, res) => {
  try {
    const alerta = await AlertaCamioneta.findById(req.params.id)
      .populate("checklistId", "conductorResponsable fechaInspeccion turno turnoNumero aptaOperacion aptitudOperacion patente")
      .lean();
    if (requireAlerta(alerta, res)) return;
    if (!puedeVerAlerta(alerta, req.user)) return res.status(403).json({ message: "Sin permisos" });
    const seguimiento = await obtenerSeguimientoAlerta(alerta._id);
    return res.json({ alerta: mapAlerta(alerta, seguimiento) });
  } catch (error) {
    console.error("ERROR DETALLE ALERTA", error);
    return res.status(500).json({ message: "Error obteniendo detalle de alerta" });
  }
};

export const asignarAlerta = async (req, res) => {
  try {
    const responsable = String(req.body?.responsable || "").trim();
    const responsableId = String(req.body?.responsableId || "").trim();
    if (!responsable && !responsableId) return res.status(400).json({ message: "responsable es obligatorio" });

    const alerta = await asignarAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      responsable,
      responsableId,
      fechaCompromiso: req.body?.fechaCompromiso
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_ASIGNADA",
      observacion: `Alerta asignada a ${alerta.responsableNombre || alerta.responsable}`
    });

    return res.json({ message: "Alerta asignada", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
  } catch (error) {
    console.error("ERROR ASIGNANDO ALERTA", error);
    return res.status(400).json({ message: error?.message || "Error asignando alerta" });
  }
};

export const ponerAlertaEnProceso = async (req, res) => {
  try {
    const alerta = await marcarAlertaEnProceso({
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
      accion: "ALERTA_CAMBIO_ESTADO",
      observacion: "Alerta en proceso"
    });

    return res.json({ message: "Alerta en proceso", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
  } catch (error) {
    console.error("ERROR CAMBIANDO ALERTA", error);
    return res.status(400).json({ message: error?.message || "Error cambiando alerta a en proceso" });
  }
};

export const comentarAlerta = async (req, res) => {
  try {
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
    return res.json({ message: "Comentario registrado", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error agregando comentario" });
  }
};

export const adjuntarEvidencia = async (req, res) => {
  try {
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
    return res.json({ message: "Evidencia adjunta", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error adjuntando evidencia" });
  }
};

export const resolverAlerta = async (req, res) => {
  try {
    const accionCorrectiva = String(req.body?.accionCorrectiva || req.body?.solucion || "").trim();
    if (!accionCorrectiva) return res.status(400).json({ message: "accionCorrectiva es obligatoria" });

    const alerta = await resolverAlertaCamioneta({
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
      accion: "ALERTA_RESUELTA",
      observacion: accionCorrectiva
    });

    return res.json({ message: "Alerta resuelta", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Error resolviendo alerta" });
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

    return res.json({ message: "Alerta cerrada", alerta: mapAlerta(alerta, await obtenerSeguimientoAlerta(alerta._id)) });
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
