import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import User from "../models/user.js";
import {
  canalesPreparados,
  obtenerAlertasChecklistCamioneta,
  obtenerAlertasVencimientosChecklistCamioneta,
  procesarAlertasChecklist,
  variablesNotificacionChecklistCamioneta
} from "../services/alertService.js";
import { emailConfigStatus, sendTestEmail, verifyEmailProviders } from "../services/emailService.js";
import { enviarWhatsApp, whatsappConfigStatus } from "../services/whatsappService.js";
import {
  registrarChecklistCreado,
  registrarChecklistFinalizado,
  registrarChecklistRevisado,
  registrarExcelDescargado,
  registrarEvento,
  registrarPdfDescargado
} from "../services/operationalAuditService.js";
import {
  normalizarCumplimientoChecklist,
  validarChecklistDiario
} from "../services/checklistComplianceService.js";

const ESTADOS_CHECKLIST = ["BORRADOR", "FINALIZADO", "REVISADO"];
const ESTADOS_DOCUMENTO = ["VIGENTE", "VENCIDO", "NO_APLICA"];
const ESTADOS_INSPECCION = ["BUENO", "MALO", "NA"];
const ESTADOS_RESPUESTA = ["SI", "NO", "NA"];

const ejecutarAlertasChecklistEnSegundoPlano = (checklistId) => {
  console.log("🚀 ALERTAS EN BACKGROUND", { checklistId });
  setImmediate(async () => {
    try {
      console.log("🔥 EJECUTANDO ALERTAS CHECKLIST", { checklistId, modo: "segundo_plano" });
      console.log("📨 EMAIL BACKGROUND / 📲 WHATSAPP BACKGROUND", { checklistId });
      const resultadoAlertas = await procesarAlertasChecklist(String(checklistId));
      console.log("✅ ALERTAS FINALIZADAS", {
        checklistId,
        alertas: resultadoAlertas.alertasGeneradas?.length || 0,
        notificaciones: resultadoAlertas.notificaciones?.length || 0
      });
    } catch (alertError) {
      console.error("❌ ERROR ALERTAS:", alertError);
    }
  });
};

const DOCUMENTOS = [
  "Licencia Municipal",
  "Licencia Interna",
  "Permiso de Circulacion",
  "Revision Tecnica",
  "Certificacion Interna",
  "Seguro Obligatorio"
];

const ASPECTOS = [
  "Baliza",
  "Pertiga",
  "Aire acondicionado",
  "Radio Panel",
  "Antena Radio",
  "Encendedor",
  "Pisos de gomas",
  "Cinturones de seguridad",
  "Limpiaparabrisas",
  "Aseo",
  "Extintor",
  "Gata",
  "Triangulo",
  "Llave de ruedas",
  "Barras de proteccion",
  "Malla proteccion luneta",
  "Cunas",
  "Cinta reflectante",
  "Alarma de retroceso",
  "Logotipo empresa",
  "Chaleco reflectante"
];

const ESTADO_CAMIONETA = [
  "Parabrisas",
  "Vidrios de las puertas",
  "Vidrios laterales",
  "Espejos laterales",
  "Espejo retrovisor",
  "Estado de puertas",
  "Estado de asientos",
  "Estado de bocina"
];

const FRENOS_DIRECCION = [
  "Frenos",
  "Freno de mano",
  "Sin fugas de aceite",
  "Estado de neumaticos",
  "Neumatico de repuesto",
  "Seguro traba tuercas"
];

const LUCES = [
  "Luces altas",
  "Luces bajas",
  "Luces de viraje",
  "Luces de freno",
  "Luz marcha atras",
  "Luces interiores"
];

const SISTEMA_ASISTENCIA_CONDUCTOR = [
  "Se enciende correctamente al arrancar el vehiculo",
  "Soporte y base de equipo en buen estado y limpio",
  "Alarma visual operativa",
  "Alarma audible operativa",
  "Dispositivo correctamente alineado"
];

const ENCUESTA_FATIGA_SOMNOLENCIA = [
  "Ha tenido dificultades de lograr un sueno reparador?",
  "Presenta algun evento que dificulte su buen dormir?",
  "Sufre de insomnio ultimamente?",
  "Durmio menos tiempo del necesario durante su ultimo periodo de sueno?",
  "Esta consumiendo algun medicamento que provoque somnolencia o perdida de atencion?",
  "Padece de alguna enfermedad que pudiese causar somnolencia?",
  "Existen factores externos que afecten la calidad de su sueno?",
  "Ha presentado eventos importantes de somnolencia?",
  "Se siente en condiciones de conducir?",
  "Tiene algun problema que afecte su normal desempeno?",
  "Considera usted que descanso lo suficiente?"
];

const CRITICOS = [
  "Frenos",
  "Freno de mano",
  "Estado de neumaticos",
  "Luces de freno",
  "Cinturones de seguridad",
  "Extintor",
  "Alarma de retroceso",
  "Estado de bocina"
];

const UPLOAD_DIR = path.join(process.cwd(), "src", "uploads", "checklist-camionetas");
const CHECKLIST_LIST_FIELDS = [
  "_id",
  "planta",
  "estado",
  "aptaOperacion",
  "aptitudOperacion",
  "patente",
  "marca",
  "modelo",
  "tipoVehiculo",
  "kilometrajeHorometro",
  "fechaUltimaMantencion",
  "fechaProximaMantencion",
  "conductorResponsable",
  "areaTrabajo",
  "fechaInspeccion",
  "fechaProgramada",
  "fechaRealizacion",
  "checklistAtrasado",
  "cumplimientoEstado",
  "horaInspeccion",
  "turno",
  "turnoNumero",
  "documentacion",
  "aspectosInspeccionar.estado",
  "estadoCamioneta.estado",
  "frenosDireccion.estado",
  "luces.estado",
  "sistemaAsistenciaConductor.estado",
  "encuestaFatigaSomnolencia.estado",
  "fotosObservaciones.nombre",
  "fotosObservaciones.ruta",
  "fotosObservaciones.fecha",
  "creadoPor",
  "revisadoPor",
  "fechaCreacion",
  "fechaActualizacion",
  "createdAt",
  "updatedAt"
].join(" ");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `foto-observacion-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

export const uploadChecklistCamioneta = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Solo se permiten imagenes"));
      return;
    }
    cb(null, true);
  }
});

const rolActual = (req) => String(req.user?.rol || "").toUpperCase();
const esAdmin = (req) => rolActual(req) === "ADMIN";
const esSupervision = (req) =>
  ["SUPERVISION", "SUPERVISOR", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"].includes(rolActual(req));
const esOperadorPlanta = (req) => ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"].includes(rolActual(req));
const userId = (req) => String(req.user?.uid || req.user?.id || req.user?._id || req.user?.sub || "");

const resolverUserId = async (req) => {
  const directId = userId(req);
  if (/^[a-f\d]{24}$/i.test(directId)) return directId;

  const email = String(req.user?.email || req.user?.username || "").trim().toLowerCase();
  if (!email) return "";

  const user = await User.findOne({
    $or: [
      { email },
      { username: email }
    ]
  }).select("_id");

  return user?._id?.toString() || "";
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizarEstado = (estado, permitidos, fallback) => {
  const value = String(estado || fallback).trim().toUpperCase();
  return permitidos.includes(value) ? value : fallback;
};

const normalizarEstadoChecklist = (estado) => normalizarEstado(estado, ESTADOS_CHECKLIST, "BORRADOR");

const normalizarEstadosChecklistAntiguos = async () => {
  const vacios = await ChecklistCamioneta.updateMany(
    {
      eliminado: { $ne: true },
      $or: [
        { estado: { $exists: false } },
        { estado: null },
        { estado: "" }
      ]
    },
    { $set: { estado: "BORRADOR" } }
  );

  const variantes = await ChecklistCamioneta.find({
    eliminado: { $ne: true },
    estado: { $exists: true, $ne: null }
  })
    .select("estado")
    .lean();

  const operaciones = variantes
    .map((item) => ({
      id: item._id,
      estadoActual: item.estado,
      estadoNormalizado: normalizarEstadoChecklist(item.estado)
    }))
    .filter((item) => String(item.estadoActual || "") !== item.estadoNormalizado)
    .map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { estado: item.estadoNormalizado } }
      }
    }));

  if (operaciones.length) {
    await ChecklistCamioneta.bulkWrite(operaciones, { ordered: false });
  }

  const totalNormalizados = (vacios.modifiedCount || 0) + operaciones.length;
  if (totalNormalizados) {
    console.log("✅ ESTADOS CHECKLIST NORMALIZADOS", { total: totalNormalizados });
  }
};

const calcularKpisChecklist = async (filtroKpi) => {
  const [borradores, finalizados, revisados, total] = await Promise.all([
    ChecklistCamioneta.countDocuments({ ...filtroKpi, estado: "BORRADOR" }),
    ChecklistCamioneta.countDocuments({ ...filtroKpi, estado: "FINALIZADO" }),
    ChecklistCamioneta.countDocuments({ ...filtroKpi, estado: "REVISADO" }),
    ChecklistCamioneta.countDocuments(filtroKpi)
  ]);

  const kpis = {
    borradores,
    finalizados,
    revisados,
    total
  };

  console.log("✅ KPI CALCULADOS", kpis);
  console.log("✅ BORRADORES", borradores);
  console.log("✅ FINALIZADOS", finalizados);
  console.log("✅ REVISADOS", revisados);
  return kpis;
};

const normalizarChecklistListItem = (item) => ({
  ...item,
  estado: normalizarEstadoChecklist(item.estado),
  aptitudOperacion: String(item.aptitudOperacion || (item.aptaOperacion === false ? "NO_APTA" : "APTA")).toUpperCase(),
  aptaOperacion: item.aptaOperacion !== false && String(item.aptitudOperacion || "APTA").toUpperCase() !== "NO_APTA"
});

const crearItems = (nombres, input = []) => {
  const map = new Map((Array.isArray(input) ? input : []).map(item => [String(item.nombre || ""), item]));
  return nombres.map(nombre => {
    const item = map.get(nombre) || {};
    return {
      nombre,
      estado: normalizarEstado(item.estado, ESTADOS_INSPECCION, "NA"),
      observacion: String(item.observacion || "").trim()
    };
  });
};

const crearRespuestas = (nombres, input = []) => {
  const map = new Map((Array.isArray(input) ? input : []).map(item => [String(item.nombre || ""), item]));
  return nombres.map(nombre => {
    const item = map.get(nombre) || {};
    return {
      nombre,
      estado: normalizarEstado(item.estado, ESTADOS_RESPUESTA, "NA"),
      observacion: String(item.observacion || "").trim()
    };
  });
};

const crearDocumentos = (input = []) => {
  const map = new Map((Array.isArray(input) ? input : []).map(item => [String(item.nombre || ""), item]));
  return DOCUMENTOS.map(nombre => {
    const item = map.get(nombre) || {};
    return {
      nombre,
      fechaVencimiento: parseDate(item.fechaVencimiento),
      estado: normalizarEstado(item.estado, ESTADOS_DOCUMENTO, "NO_APLICA")
    };
  });
};

const calcularAptitud = (payload) => {
  const grupos = [
    ...(payload.aspectosInspeccionar || []),
    ...(payload.estadoCamioneta || []),
    ...(payload.frenosDireccion || []),
    ...(payload.luces || [])
  ];

  const documentosCriticosVencidos = (payload.documentacion || []).some((item) => {
    const nombre = String(item.nombre || "").toUpperCase();
    const esDocumentoBloqueante = [
      "LICENCIA MUNICIPAL",
      "LICENCIA INTERNA",
      "REVISION TECNICA",
      "REVISIÓN TÉCNICA",
      "SEGURO OBLIGATORIO",
      "SOAP",
      "PERMISO DE CIRCULACION",
      "PERMISO DE CIRCULACIÓN"
    ].some((doc) => nombre.includes(doc));
    return esDocumentoBloqueante && String(item.estado || "").toUpperCase() === "VENCIDO";
  });

  const noApta = documentosCriticosVencidos || grupos.some(item =>
    CRITICOS.includes(item.nombre) && item.estado === "MALO"
  );

  return noApta ? "NO_APTA" : "APTA";
};

const buildPayload = (body = {}) => {
  const revisionCarroceria = body.revisionCarroceria || {};
  const abolladura = Boolean(body.abolladura || revisionCarroceria.abolladura);
  const raya = Boolean(body.raya || revisionCarroceria.raya);
  const picadura = Boolean(body.picadura || revisionCarroceria.picadura);
  const observacionesCarroceria = String(
    body.observacionesCarroceria || revisionCarroceria.observacionesCarroceria || ""
  ).trim();
  const imagenMarcada = String(revisionCarroceria.imagenMarcada || body.imagenMarcada || "");

  const payload = {
    planta: String(body.planta || "PC1").trim() || "PC1",
    tipoVehiculo: String(body.tipoVehiculo || "Camioneta").trim() || "Camioneta",
    modelo: String(body.modelo || "Hilux").trim() || "Hilux",
    kilometrajeHorometro: String(body.kilometrajeHorometro || "").trim(),
    fechaUltimaMantencion: parseDate(body.fechaUltimaMantencion),
    marca: String(body.marca || "Toyota").trim() || "Toyota",
    patente: String(body.patente || "").trim().toUpperCase(),
    color: String(body.color || "").trim(),
    fechaProximaMantencion: parseDate(body.fechaProximaMantencion),
    conductorResponsable: String(body.conductorResponsable || "").trim(),
    areaTrabajo: String(body.areaTrabajo || "").trim(),
    licenciaClaseB: body.licenciaClaseB === true,
    fechaVencimientoLicenciaB: parseDate(body.fechaVencimientoLicenciaB),
    licenciaInterna: body.licenciaInterna === true,
    fechaVencimientoLicenciaInterna: parseDate(body.fechaVencimientoLicenciaInterna),
    fechaInspeccion: parseDate(body.fechaInspeccion),
    fechaProgramada: parseDate(body.fechaProgramada || body.fechaInspeccion),
    fechaRealizacion: parseDate(body.fechaRealizacion || body.fechaInspeccion || new Date()),
    horaInspeccion: String(body.horaInspeccion || "").trim(),
    turno: ["DIA", "NOCHE"].includes(String(body.turno || "").toUpperCase()) ? String(body.turno).toUpperCase() : "",
    turnoNumero: String(body.turnoNumero || "").trim(),
    documentacion: crearDocumentos(body.documentacion),
    aspectosInspeccionar: crearItems(ASPECTOS, body.aspectosInspeccionar),
    estadoCamioneta: crearItems(ESTADO_CAMIONETA, body.estadoCamioneta),
    frenosDireccion: crearItems(FRENOS_DIRECCION, body.frenosDireccion),
    luces: crearItems(LUCES, body.luces),
    sistemaAsistenciaConductor: crearRespuestas(SISTEMA_ASISTENCIA_CONDUCTOR, body.sistemaAsistenciaConductor),
    encuestaFatigaSomnolencia: crearRespuestas(ENCUESTA_FATIGA_SOMNOLENCIA, body.encuestaFatigaSomnolencia),
    abolladura,
    raya,
    picadura,
    observacionesCarroceria,
    imagenReferencialVehiculo: String(body.imagenReferencialVehiculo || ""),
    marcasDanio: Array.isArray(body.marcasDanio) ? body.marcasDanio : [],
    revisionCarroceria: {
      abolladura,
      raya,
      picadura,
      observacionesCarroceria,
      imagenMarcada
    },
    observacionesDetectadas: "",
    observacionesGenerales: String(body.observacionesGenerales || "").trim(),
    fotosObservaciones: Array.isArray(body.fotosObservaciones) ? body.fotosObservaciones : [],
    firmaConductor: String(body.firmaConductor || ""),
    nombreConductor: String(body.nombreConductor || body.conductorResponsable || "").trim(),
    firmaRevisor: String(body.firmaRevisor || ""),
    nombreRevisor: String(body.nombreRevisor || "").trim(),
    nombreRealizadoPor: String(body.nombreRealizadoPor || body.nombreConductor || body.conductorResponsable || "").trim(),
    cargoRealizadoPor: String(body.cargoRealizadoPor || "").trim(),
    fechaRealizadoPor: parseDate(body.fechaRealizadoPor),
    firmaRealizadoPor: String(body.firmaRealizadoPor || body.firmaConductor || ""),
    nombreRevisadoPor: String(body.nombreRevisadoPor || body.nombreRevisor || "").trim(),
    cargoRevisadoPor: String(body.cargoRevisadoPor || "").trim(),
    fechaRevisadoPor: parseDate(body.fechaRevisadoPor),
    firmaRevisadoPor: String(body.firmaRevisadoPor || body.firmaRevisor || "")
  };

  payload.aptitudOperacion = calcularAptitud(payload);
  payload.aptaOperacion = payload.aptitudOperacion === "APTA";
  Object.assign(payload, normalizarCumplimientoChecklist(payload));
  return payload;
};

const validarRealizado = (checklist) => {
  const faltantes = [];
  if (!String(checklist.nombreRealizadoPor || "").trim()) faltantes.push("nombreRealizadoPor");
  if (!String(checklist.cargoRealizadoPor || "").trim()) faltantes.push("cargoRealizadoPor");
  if (!checklist.fechaRealizadoPor) faltantes.push("fechaRealizadoPor");
  if (!String(checklist.firmaRealizadoPor || "").trim()) faltantes.push("firmaRealizadoPor");
  return faltantes;
};

const validarRevisado = (body = {}) => {
  const faltantes = [];
  if (!String(body.nombreRevisadoPor || "").trim()) faltantes.push("nombreRevisadoPor");
  if (!String(body.cargoRevisadoPor || "").trim()) faltantes.push("cargoRevisadoPor");
  if (!parseDate(body.fechaRevisadoPor)) faltantes.push("fechaRevisadoPor");
  if (!String(body.firmaRevisadoPor || "").trim()) faltantes.push("firmaRevisadoPor");
  return faltantes;
};

const canRead = (req, checklist) => {
  if (esAdmin(req) || esSupervision(req)) return true;
  if (esOperadorPlanta(req)) return String(checklist.creadoPor?._id || checklist.creadoPor) === userId(req);
  return false;
};

const licenciaInternaActiva = (value) => {
  if (value === true) return true;
  if (typeof value === "string") {
    return ["SI", "TRUE", "VIGENTE", "POR_VENCER"].includes(value.trim().toUpperCase());
  }
  if (value && typeof value === "object") {
    const estado = String(value.estado || value.status || "").trim().toUpperCase();
    if (["VIGENTE", "POR_VENCER", "ACTIVA", "ACTIVO"].includes(estado)) return true;
    return Boolean(value.fechaVencimiento || value.fechaVencimientoLicenciaInterna || value.numero);
  }
  return false;
};

const fechaLicenciaInternaUsuario = (user = {}) =>
  user.fechaVencimientoLicenciaInterna ||
  user.licenciaInterna?.fechaVencimiento ||
  user.licenciaInterna?.fechaVencimientoLicenciaInterna ||
  null;

const aplicarDatosUsuarioChecklist = (body = {}, user = null, admin = false) => {
  if (admin || !user) return body;
  const fechaInterna = fechaLicenciaInternaUsuario(user);
  return {
    ...body,
    planta: user.area || user.planta || body.planta || "PC1",
    areaTrabajo: user.area ? `PLANTA ${user.area}` : (body.areaTrabajo || user.planta || "PC1"),
    turnoNumero: user.turno || body.turnoNumero || "",
    conductorResponsable: user.nombre || body.conductorResponsable || "",
    nombreConductor: user.nombre || body.nombreConductor || "",
    nombreRealizadoPor: user.nombre || body.nombreRealizadoPor || "",
    cargoRealizadoPor: user.cargo || user.rol || body.cargoRealizadoPor || "",
    licenciaClaseB: user.licenciaClaseB === true,
    fechaVencimientoLicenciaB: user.fechaVencimientoLicenciaB || body.fechaVencimientoLicenciaB || null,
    licenciaInterna: licenciaInternaActiva(user.licenciaInterna),
    fechaVencimientoLicenciaInterna: fechaInterna || body.fechaVencimientoLicenciaInterna || null
  };
};

const validarHabilitacionChecklistUsuario = (user = {}) => {
  if (!user) return "Usuario no encontrado";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const licenciaBVence = user.fechaVencimientoLicenciaB ? new Date(user.fechaVencimientoLicenciaB) : null;
  const fechaInterna = fechaLicenciaInternaUsuario(user);
  const licenciaInternaVence = fechaInterna ? new Date(fechaInterna) : null;
  if (user.licenciaClaseB !== true) return "No puedes crear checklist: no registras Licencia Clase B";
  if (!licenciaBVence || Number.isNaN(licenciaBVence.getTime())) return "No puedes crear checklist: falta fecha de vencimiento de Licencia Clase B";
  licenciaBVence.setHours(0, 0, 0, 0);
  if (licenciaBVence < hoy) return "No puedes crear checklist: Licencia Clase B vencida";
  if (!licenciaInternaActiva(user.licenciaInterna)) return "No puedes crear checklist: no registras Licencia Interna";
  if (!licenciaInternaVence || Number.isNaN(licenciaInternaVence.getTime())) return "No puedes crear checklist: falta fecha de vencimiento de Licencia Interna";
  licenciaInternaVence.setHours(0, 0, 0, 0);
  if (licenciaInternaVence < hoy) return "No puedes crear checklist: Licencia Interna vencida";
  return "";
};

const tieneBloqueoOperacionPatente = async (patente = "") => {
  const patenteClean = String(patente || "").trim().toUpperCase();
  if (!patenteClean) return false;
  const alertas = await AlertaCamioneta.find({
    activo: { $ne: false },
    patente: patenteClean,
    estado: "ABIERTA"
  }).select("tipo descripcion prioridad estado").lean();

  return alertas.some((alerta) => {
    const texto = `${alerta.tipo || ""} ${alerta.descripcion || ""}`.toUpperCase();
    if (String(alerta.prioridad || "").toUpperCase() === "CRITICA") return true;
    return [
      "LICENCIA MUNICIPAL",
      "LICENCIA INTERNA",
      "REVISION TECNICA",
      "REVISIÓN TÉCNICA",
      "SOAP",
      "SEGURO OBLIGATORIO",
      "PERMISO DE CIRCULACION",
      "PERMISO DE CIRCULACIÓN"
    ].some((doc) => texto.includes(doc)) && texto.includes("VENC");
  });
};

const getChecklistOr404 = async (req, res) => {
  const checklist = await ChecklistCamioneta.findById(req.params.id)
    .populate("creadoPor", "nombre email rol")
    .populate("revisadoPor", "nombre email rol");

  if (!checklist) {
    res.status(404).json({ message: "Checklist no encontrado" });
    return null;
  }

  if (checklist.eliminado) {
    res.status(404).json({ message: "Checklist no encontrado" });
    return null;
  }

  if (!canRead(req, checklist)) {
    res.status(403).json({ message: "No autorizado para este checklist" });
    return null;
  }

  return checklist;
};

export const crearChecklistCamioneta = async (req, res) => {
  const inicio = Date.now();
  try {
    console.time("⚡ Tiempo crear checklist");
    if (!(esAdmin(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const mongoInicio = Date.now();
    const autor = await resolverUserId(req);
    if (!autor) {
      return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
    }

    const autorUser = await User.findById(autor)
      .select("nombre rol planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna")
      .lean();

    if (!esAdmin(req)) {
      const bloqueo = validarHabilitacionChecklistUsuario(autorUser);
      if (bloqueo) return res.status(403).json({ message: bloqueo });
    }

    const payload = buildPayload(aplicarDatosUsuarioChecklist(req.body, autorUser, esAdmin(req)));
    const checklist = await ChecklistCamioneta.create({
      ...payload,
      estado: "BORRADOR",
      creadoPor: autor,
      fechaCreacion: new Date()
    });
    await registrarChecklistCreado(req, checklist);
    console.log("⚡ Tiempo Mongo crear checklist:", `${Date.now() - mongoInicio}ms`);

    return res.status(201).json({
      ok: true,
      message: "Checklist camioneta creado",
      checklist: {
        _id: checklist._id,
        estado: checklist.estado,
        patente: checklist.patente,
        fechaCreacion: checklist.fechaCreacion
      }
    });
  } catch (error) {
    console.error("Error creando checklist camioneta:", error);
    return res.status(500).json({
      message: "Error creando checklist camioneta",
      detail: error?.message
    });
  } finally {
    console.timeEnd("⚡ Tiempo crear checklist");
    console.log("⚡ Tiempo crear checklist total:", `${Date.now() - inicio}ms`);
  }
};

export const listarChecklistCamionetas = async (req, res) => {
  const inicio = Date.now();
  try {
    console.time("⚡ Tiempo listar checklist");
    if (!(esAdmin(req) || esSupervision(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const { patente = "", estado = "", desde = "", hasta = "" } = req.query;
    const { turno = "", turnoNumero = "" } = req.query;
    const { conductor = "", usuario = "", planta = "" } = req.query;
    const filter = { eliminado: { $ne: true } };
    const filtroKpi = { eliminado: { $ne: true } };

    if (esOperadorPlanta(req) && !esAdmin(req)) {
      const autor = await resolverUserId(req);
      if (!autor) {
        return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
      }
      const autorId = new mongoose.Types.ObjectId(autor);
      filter.creadoPor = autorId;
      filtroKpi.creadoPor = autorId;
    }

    if (patente) filter.patente = { $regex: String(patente), $options: "i" };
    if (turno) filter.turno = String(turno).toUpperCase();
    if (turnoNumero) filter.turnoNumero = String(turnoNumero).trim();
    if (conductor) filter.conductorResponsable = { $regex: String(conductor), $options: "i" };
    if (usuario) filter.creadoPor = usuario;
    if (planta) filter.planta = String(planta).trim();
    if (estado) {
      const estadoUp = String(estado).toUpperCase();
      if (!ESTADOS_CHECKLIST.includes(estadoUp)) {
        return res.status(400).json({ message: "Estado invalido" });
      }
      filter.estado = estadoUp;
    }

    if (desde || hasta) {
      filter.fechaInspeccion = {};
      if (desde) filter.fechaInspeccion.$gte = parseDate(desde);
      if (hasta) {
        const fin = parseDate(hasta);
        if (fin) fin.setHours(23, 59, 59, 999);
        filter.fechaInspeccion.$lte = fin;
      }
    }

    const mongoInicio = Date.now();
    await normalizarEstadosChecklistAntiguos();
    const [checklistsRaw, kpis] = await Promise.all([
      ChecklistCamioneta.find(filter)
        .select(CHECKLIST_LIST_FIELDS)
        .sort({ fechaInspeccion: -1, createdAt: -1 })
        .limit(250)
        .populate("creadoPor", "nombre email rol")
        .populate("revisadoPor", "nombre email rol")
        .lean(),
      calcularKpisChecklist(filtroKpi)
    ]);
    const checklists = checklistsRaw.map(normalizarChecklistListItem);
    console.log("⚡ Tiempo Mongo listar checklist:", `${Date.now() - mongoInicio}ms`, {
      total: checklists.length,
      filtros: Object.keys(filter),
      filtrosKpi: Object.keys(filtroKpi),
      kpis
    });
    console.log("✅ KPI CHECKLIST ACTUALIZADOS", kpis);

    return res.json({
      checklists,
      kpis,
      total: kpis.total
    });
  } catch (error) {
    console.error("❌ ERROR KPI CHECKLIST:", error);
    console.error("❌ ERROR CONSULTA CHECKLIST:", error);
    return res.status(500).json({ message: "Error listando checklist camioneta" });
  } finally {
    console.timeEnd("⚡ Tiempo listar checklist");
    console.log("⚡ Tiempo listar checklist total:", `${Date.now() - inicio}ms`);
  }
};

export const obtenerChecklistCamioneta = async (req, res) => {
  try {
    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;
    return res.json(checklist);
  } catch (error) {
    return res.status(500).json({ message: "Error obteniendo checklist camioneta" });
  }
};

export const obtenerAlertasVencimientosChecklistCamionetaController = async (req, res) => {
  try {
    if (!(esAdmin(req) || esSupervision(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const filter = {};
    if (esOperadorPlanta(req) && !esAdmin(req)) {
      const autor = await resolverUserId(req);
      if (!autor) {
        return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
      }
      filter.creadoPor = autor;
    }

    const alertas = await obtenerAlertasVencimientosChecklistCamioneta(filter);

    return res.json({
      alertas,
      total: alertas.length,
      variablesEnvPreparadas: variablesNotificacionChecklistCamioneta,
      notificacionesActivas: canalesPreparados()
    });
  } catch (error) {
    return res.status(500).json({ message: "Error obteniendo alertas de vencimiento" });
  }
};

export const obtenerCumplimientoChecklistCamionetaController = async (req, res) => {
  try {
    if (!(esAdmin(req) || esSupervision(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const fecha = req.query?.fecha ? parseDate(req.query.fecha) : new Date();
    const cumplimiento = await validarChecklistDiario({ fecha: fecha || new Date(), user: req.user });
    return res.json(cumplimiento);
  } catch (error) {
    console.error("❌ ERROR CUMPLIMIENTO CHECKLIST:", error);
    return res.status(500).json({ message: "Error obteniendo cumplimiento checklist camioneta" });
  }
};

export const obtenerAlertasChecklistCamionetaController = async (req, res) => {
  try {
    if (!(esAdmin(req) || esSupervision(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const filter = {};
    if (esOperadorPlanta(req) && !esAdmin(req)) {
      const autor = await resolverUserId(req);
      if (!autor) return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
      filter.creadoPor = autor;
    }

    const alertas = await obtenerAlertasChecklistCamioneta(filter);
    return res.json({
      alertas,
      total: alertas.length,
      variablesEnvPreparadas: variablesNotificacionChecklistCamioneta,
      notificacionesActivas: canalesPreparados()
    });
  } catch (error) {
    return res.status(500).json({ message: "Error obteniendo alertas checklist camioneta" });
  }
};

export const enviarAlertasChecklistCamionetaController = async (req, res) => {
  try {
    console.log("🔥 INICIO ALERTAS manuales Checklist Camioneta");
    if (!(esAdmin(req) || esSupervision(req))) {
      return res.status(403).json({ message: "No autorizado para enviar alertas" });
    }

    const checklists = await ChecklistCamioneta.find({ eliminado: { $ne: true } })
      .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
      .sort({ fechaInspeccion: -1, createdAt: -1 });
    const resultados = [];

    for (const checklist of checklists) {
      resultados.push(await procesarAlertasChecklist(checklist));
    }

    console.log("✅ ALERTAS MANUALES FINALIZADAS", {
      checklists: checklists.length,
      alertas: resultados.reduce((sum, item) => sum + (item.alertasGeneradas?.length || 0), 0)
    });

    return res.json({
      message: "Proceso de alertas ejecutado",
      totalChecklistsProcesados: checklists.length,
      totalAlertas: resultados.reduce((sum, item) => sum + (item.alertasGeneradas?.length || 0), 0),
      notificacionesActivas: canalesPreparados(),
      resultados
    });
  } catch (error) {
    console.error("❌ ERROR ALERTAS MANUALES:", error);
    return res.status(500).json({ message: "Error enviando alertas checklist camioneta", detail: error.message });
  }
};

export const diagnosticoAlertasChecklistCamionetaController = async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ message: "Solo ADMIN puede ejecutar diagnostico de alertas" });
    }

    const destino = String(req.body?.email || req.query?.email || "jota.raaamirez@gmail.com").trim().toLowerCase();
    const telefono = String(req.body?.telefono || req.query?.telefono || "").trim();
    console.log("🧪 DIAGNOSTICO ALERTAS RESEND", {
      resendApiKeyExists: Boolean(process.env.RESEND_API_KEY),
      resendApiKeyPrefix: process.env.RESEND_API_KEY ? `${String(process.env.RESEND_API_KEY).slice(0, 8)}...` : null,
      emailFrom: process.env.EMAIL_FROM || null,
      twilioSidExists: Boolean(process.env.TWILIO_ACCOUNT_SID),
      twilioFromExists: Boolean(process.env.TWILIO_WHATSAPP_FROM),
      destino,
      telefono: telefono || null
    });

    const resend = await verifyEmailProviders();
    const emailTest = await sendTestEmail({ to: destino });
    const whatsappTest = telefono
      ? await enviarWhatsApp({
        telefono,
        mensaje: [
          "Prueba WhatsApp Render",
          "NOVANDINO | GESTION OPERACIONAL",
          new Date().toISOString()
        ].join("\n")
      })
      : { ok: false, estado: "omitido", motivo: "No se envio telefono de prueba" };

    return res.json({
      ok: Boolean(emailTest.ok),
      destino,
      resend,
      emailTest,
      whatsappTest,
      emailEnv: emailConfigStatus(),
      twilioEnv: whatsappConfigStatus()
    });
  } catch (error) {
    console.error("❌ ERROR DIAGNOSTICO ALERTAS:", {
      message: error?.message,
      code: error?.code,
      response: error?.response,
      command: error?.command,
      stack: error?.stack
    });
    return res.status(500).json({
      message: "Error ejecutando diagnostico de alertas",
      detail: error?.message,
      code: error?.code,
      response: error?.response,
      command: error?.command
    });
  }
};

export const actualizarChecklistCamioneta = async (req, res) => {
  try {
    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;

    const autor = await resolverUserId(req);
    const propio = String(checklist.creadoPor?._id || checklist.creadoPor) === autor;
    if (!esAdmin(req) && !(esOperadorPlanta(req) && propio && checklist.estado === "BORRADOR")) {
      return res.status(403).json({ message: "Solo puedes editar borradores propios" });
    }

    const payload = buildPayload(req.body);
    Object.assign(checklist, payload);
    await checklist.save();

    return res.json({ message: "Checklist actualizado", checklist });
  } catch (error) {
    return res.status(500).json({ message: "Error actualizando checklist camioneta" });
  }
};

export const finalizarChecklistCamioneta = async (req, res) => {
  const inicio = Date.now();
  try {
    console.time("⚡ Tiempo finalizar checklist");
    console.log("🔥 PASO 1");
    console.log("🔥 FINALIZANDO CHECKLIST CAMIONETA");
    console.log("🔥 Checklist a finalizar:", req.params.id);
    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;

    const autor = await resolverUserId(req);
    const propio = String(checklist.creadoPor?._id || checklist.creadoPor) === autor;
    if (!esAdmin(req) && !(esOperadorPlanta(req) && propio)) {
      return res.status(403).json({ message: "No autorizado para finalizar este checklist" });
    }

    if (checklist.estado === "REVISADO") {
      return res.status(400).json({ message: "Un checklist revisado no puede volver a finalizarse" });
    }

    checklist.estado = "FINALIZADO";
    if (!checklist.fechaProgramada) checklist.fechaProgramada = checklist.fechaInspeccion || new Date();
    checklist.fechaRealizacion = checklist.fechaRealizacion || checklist.fechaInspeccion || new Date();
    Object.assign(checklist, normalizarCumplimientoChecklist(checklist));
    checklist.aptitudOperacion = calcularAptitud(checklist);
    if (await tieneBloqueoOperacionPatente(checklist.patente)) {
      checklist.aptitudOperacion = "NO_APTA";
      await registrarEvento({
        req,
        modulo: "CHECKLIST_CAMIONETA",
        entidad: "ChecklistCamioneta",
        entidadId: checklist._id,
        accion: "VEHICULO_NO_APTO",
        observacion: `Vehiculo ${checklist.patente || ""} no apto por alerta activa`.trim()
      });
    }
    checklist.aptaOperacion = checklist.aptitudOperacion === "APTA";

    const faltantes = validarRealizado(checklist);
    if (faltantes.length) {
      return res.status(400).json({
        message: "Faltan datos obligatorios para finalizar",
        faltantes
      });
    }

    const mongoInicio = Date.now();
    await checklist.save();
    await registrarChecklistFinalizado(req, checklist);
    await registrarEvento({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCamioneta",
      entidadId: checklist._id,
      accion: checklist.checklistAtrasado ? "CHECKLIST_ATRASADO" : "CHECKLIST_REALIZADO",
      observacion: `${checklist.checklistAtrasado ? "Checklist atrasado" : "Checklist realizado"} patente ${checklist.patente || ""}`.trim()
    });
    console.log("⚡ Tiempo Mongo finalizar checklist:", `${Date.now() - mongoInicio}ms`);
    console.log("✅ CHECKLIST GUARDADO", {
      checklistId: checklist._id,
      patente: checklist.patente,
      estado: checklist.estado
    });

    res.json({
      ok: true,
      message: "Checklist finalizado",
      checklist: {
        _id: checklist._id,
        estado: checklist.estado,
        patente: checklist.patente,
        aptaOperacion: checklist.aptaOperacion,
        fechaActualizacion: checklist.fechaActualizacion
      },
      alertasEnProceso: true
    });

    ejecutarAlertasChecklistEnSegundoPlano(checklist._id);
    return;
  } catch (error) {
    console.error("❌ Error finalizando checklist camioneta:", error);
    return res.status(500).json({ message: "Error finalizando checklist camioneta" });
  } finally {
    console.timeEnd("⚡ Tiempo finalizar checklist");
    console.log("⚡ Tiempo finalizar checklist total:", `${Date.now() - inicio}ms`);
  }
};

export const revisarChecklistCamioneta = async (req, res) => {
  try {
    console.log("🔥 REVISANDO CHECKLIST CAMIONETA", { checklistId: req.params.id });
    if (!(esAdmin(req) || esSupervision(req))) {
      return res.status(403).json({ message: "No autorizado para revisar" });
    }

    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;

    const faltantes = validarRevisado(req.body);
    if (faltantes.length) {
      return res.status(400).json({
        message: "Faltan datos obligatorios para revisar",
        faltantes
      });
    }

    checklist.estado = "REVISADO";
    const autor = await resolverUserId(req);
    if (!autor) {
      return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
    }
    checklist.revisadoPor = autor;
    checklist.fechaRevision = new Date();
    checklist.nombreRevisor = String(req.body?.nombreRevisadoPor || req.body?.nombreRevisor || req.user?.nombre || checklist.nombreRevisor || "").trim();
    checklist.firmaRevisor = String(req.body?.firmaRevisadoPor || req.body?.firmaRevisor || checklist.firmaRevisor || "");
    checklist.nombreRevisadoPor = String(req.body?.nombreRevisadoPor || "").trim();
    checklist.cargoRevisadoPor = String(req.body?.cargoRevisadoPor || "").trim();
    checklist.fechaRevisadoPor = parseDate(req.body?.fechaRevisadoPor);
    checklist.firmaRevisadoPor = String(req.body?.firmaRevisadoPor || "");
    checklist.firmaRevision = String(req.body?.firmaRevision || req.body?.firmaRevisadoPor || req.body?.firmaRevisor || "");
    checklist.observacionRevision = String(req.body?.observacionRevision || req.body?.observaciones || req.body?.observacion || "").trim();
    await checklist.save();
    await registrarChecklistRevisado(req, checklist);

    console.log("✅ CHECKLIST REVISADO", {
      checklistId: checklist._id,
      patente: checklist.patente,
      estado: checklist.estado,
      revisadoPor: autor
    });

    return res.json({ message: "Checklist revisado", checklist });
  } catch (error) {
    console.error("❌ ERROR ESTADOS CHECKLIST:", error);
    return res.status(500).json({ message: "Error revisando checklist camioneta" });
  }
};

export const eliminarChecklistCamioneta = async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ message: "Solo ADMIN puede eliminar checklists" });
    }

    const deleted = await ChecklistCamioneta.findByIdAndUpdate(
      req.params.id,
      { eliminado: true, activo: false, fechaActualizacion: new Date() },
      { new: true }
    );
    if (!deleted) return res.status(404).json({ message: "Checklist no encontrado" });
    await registrarEvento({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCamioneta",
      entidadId: deleted._id,
      accion: "CHECKLIST_ELIMINADO",
      observacion: `Checklist eliminado patente ${deleted.patente || ""}`.trim()
    });

    return res.json({ message: "Checklist eliminado", checklist: deleted });
  } catch (error) {
    return res.status(500).json({ message: "Error eliminando checklist camioneta" });
  }
};

export const subirFotoChecklistCamioneta = async (req, res) => {
  const inicio = Date.now();
  try {
    console.time("⚡ Tiempo upload checklist");
    if (!(esAdmin(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado para subir fotos" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Archivo requerido" });
    }

    const foto = {
      nombre: req.file.filename,
      ruta: `/uploads/checklist-camionetas/${req.file.filename}`,
      fecha: new Date(),
      subidoPor: await resolverUserId(req)
    };

    console.log("⚡ Tiempo upload:", `${Date.now() - inicio}ms`, {
      nombre: req.file.filename,
      bytes: req.file.size
    });

    return res.status(201).json({ message: "Foto cargada", foto });
  } catch (error) {
    console.error("Error subiendo foto checklist camioneta:", error);
    return res.status(500).json({ message: "Error subiendo foto" });
  } finally {
    console.timeEnd("⚡ Tiempo upload checklist");
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CL");
};

const drawLogo = (doc, x, y, width) => {
  try {
    const logoPath = path.join(process.cwd(), "src", "assets", "logo-novandino5.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, x, y, { width });
  } catch {}
};

const drawBase64Image = (doc, dataUrl, x, y, fit) => {
  if (!dataUrl) return false;
  try {
    const base64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, "");
    doc.image(Buffer.from(base64, "base64"), x, y, { fit });
    return true;
  } catch {
    return false;
  }
};

const ensurePdfSpace = (doc, y, needed = 120) => {
  if (y + needed <= 785) return y;
  doc.addPage();
  return 45;
};

const estadoMark = (estado, target) => String(estado || "").toUpperCase() === target ? "X" : "";

const drawTable = (doc, title, rows, startY, options = {}) => {
  const colors = { purple: "#461D77", border: "#D7D8E8", row: "#F8FAFC", dark: "#111827" };
  let y = startY;
  const rowHeight = options.rowHeight || 12;
  const headerHeight = options.headerHeight || 13;
  const titleHeight = options.titleHeight || 16;
  const fontSize = options.fontSize || 5.8;
  const allowPageBreak = options.allowPageBreak !== false;

  doc.rect(35, y, 525, titleHeight).fill(colors.purple);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.4).text(title, 42, y + 4.5);
  y += titleHeight;

  doc.rect(35, y, 255, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.rect(290, y, 42, headerHeight).fillAndStroke("#DCFCE7", colors.border);
  doc.rect(332, y, 42, headerHeight).fillAndStroke("#FEE2E2", colors.border);
  doc.rect(374, y, 42, headerHeight).fillAndStroke("#E5E7EB", colors.border);
  doc.rect(416, y, 144, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(5.8)
    .text("ITEM", 42, y + 4)
    .text("BUENO", 294, y + 4, { width: 34, align: "center" })
    .text("MALO", 336, y + 4, { width: 34, align: "center" })
    .text("N/A", 378, y + 4, { width: 34, align: "center" })
    .text("OBSERVACION", 423, y + 4, { width: 128 });
  y += headerHeight;

  rows.forEach((row, index) => {
    if (allowPageBreak && y > 760) {
      doc.addPage();
      y = 40;
    }
    const fill = index % 2 ? "#FFFFFF" : colors.row;
    doc.rect(35, y, 255, rowHeight).fillAndStroke(fill, colors.border);
    doc.rect(290, y, 42, rowHeight).fillAndStroke(row.estado === "BUENO" || row.estado === "VIGENTE" ? "#DCFCE7" : fill, colors.border);
    doc.rect(332, y, 42, rowHeight).fillAndStroke(row.estado === "MALO" || row.estado === "VENCIDO" ? "#FEE2E2" : fill, colors.border);
    doc.rect(374, y, 42, rowHeight).fillAndStroke(row.estado === "NA" || row.estado === "NO_APLICA" ? "#E5E7EB" : fill, colors.border);
    doc.rect(416, y, 144, rowHeight).fillAndStroke(fill, colors.border);
    doc.fillColor(colors.dark).font("Helvetica").fontSize(fontSize).text(row.nombre || "-", 42, y + 3.5, { width: 240 });
    doc.font("Helvetica-Bold")
      .text(estadoMark(row.estado, "BUENO") || estadoMark(row.estado, "VIGENTE"), 294, y + 3.5, { width: 34, align: "center" })
      .text(estadoMark(row.estado, "MALO") || estadoMark(row.estado, "VENCIDO"), 336, y + 3.5, { width: 34, align: "center" })
      .text(estadoMark(row.estado, "NA") || estadoMark(row.estado, "NO_APLICA"), 378, y + 3.5, { width: 34, align: "center" });
    doc.font("Helvetica").text(row.observacion || "-", 423, y + 3.5, { width: 128 });
    y += rowHeight;
  });

  return y + 10;
};

const drawMiniInspectionTable = (doc, title, rows = [], x, startY, width = 255) => {
  const colors = { purple: "#461D77", border: "#D7D8E8", row: "#F8FAFC", dark: "#111827" };
  const titleHeight = 14;
  const headerHeight = 10;
  const rowHeight = 8.7;
  const itemWidth = 118;
  const stateWidth = 18;
  const obsWidth = width - itemWidth - (stateWidth * 3);
  let y = startY;

  doc.rect(x, y, width, titleHeight).fill(colors.purple);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(6.6).text(title, x + 6, y + 4);
  y += titleHeight;

  doc.rect(x, y, itemWidth, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.rect(x + itemWidth, y, stateWidth, headerHeight).fillAndStroke("#DCFCE7", colors.border);
  doc.rect(x + itemWidth + stateWidth, y, stateWidth, headerHeight).fillAndStroke("#FEE2E2", colors.border);
  doc.rect(x + itemWidth + (stateWidth * 2), y, stateWidth, headerHeight).fillAndStroke("#E5E7EB", colors.border);
  doc.rect(x + itemWidth + (stateWidth * 3), y, obsWidth, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(4.8)
    .text("ITEM", x + 4, y + 3)
    .text("B", x + itemWidth, y + 3, { width: stateWidth, align: "center" })
    .text("M", x + itemWidth + stateWidth, y + 3, { width: stateWidth, align: "center" })
    .text("N/A", x + itemWidth + (stateWidth * 2), y + 3, { width: stateWidth, align: "center" })
    .text("OBS.", x + itemWidth + (stateWidth * 3) + 3, y + 3);
  y += headerHeight;

  rows.forEach((row, index) => {
    const fill = index % 2 ? "#FFFFFF" : colors.row;
    const buenoX = x + itemWidth;
    const maloX = buenoX + stateWidth;
    const naX = maloX + stateWidth;
    const obsX = naX + stateWidth;
    doc.rect(x, y, itemWidth, rowHeight).fillAndStroke(fill, colors.border);
    doc.rect(buenoX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "BUENO" ? "#DCFCE7" : fill, colors.border);
    doc.rect(maloX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "MALO" ? "#FEE2E2" : fill, colors.border);
    doc.rect(naX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "NA" ? "#E5E7EB" : fill, colors.border);
    doc.rect(obsX, y, obsWidth, rowHeight).fillAndStroke(fill, colors.border);
    doc.fillColor(colors.dark).font("Helvetica").fontSize(4.9)
      .text(row.nombre || "-", x + 4, y + 2.3, { width: itemWidth - 8, height: rowHeight - 1 });
    doc.font("Helvetica-Bold").fontSize(5.2)
      .text(estadoMark(row.estado, "BUENO"), buenoX, y + 2.3, { width: stateWidth, align: "center" })
      .text(estadoMark(row.estado, "MALO"), maloX, y + 2.3, { width: stateWidth, align: "center" })
      .text(estadoMark(row.estado, "NA"), naX, y + 2.3, { width: stateWidth, align: "center" });
    doc.font("Helvetica").fontSize(4.7)
      .text(row.observacion || "-", obsX + 3, y + 2.3, { width: obsWidth - 6, height: rowHeight - 1 });
    y += rowHeight;
  });

  return y + 8;
};

const drawMiniResponseTable = (doc, title, rows = [], startY) => {
  const colors = { purple: "#461D77", border: "#D7D8E8", row: "#F8FAFC", dark: "#111827" };
  const x = 35;
  const width = 525;
  const titleHeight = 14;
  const headerHeight = 10;
  const rowHeight = 9.3;
  const itemWidth = 292;
  const stateWidth = 24;
  const obsWidth = width - itemWidth - (stateWidth * 3);
  let y = ensurePdfSpace(doc, startY, titleHeight + headerHeight + (rows.length * rowHeight) + 18);

  doc.rect(x, y, width, titleHeight).fill(colors.purple);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(6.8).text(title, x + 6, y + 4);
  y += titleHeight;

  doc.rect(x, y, itemWidth, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.rect(x + itemWidth, y, stateWidth, headerHeight).fillAndStroke("#DCFCE7", colors.border);
  doc.rect(x + itemWidth + stateWidth, y, stateWidth, headerHeight).fillAndStroke("#FEE2E2", colors.border);
  doc.rect(x + itemWidth + (stateWidth * 2), y, stateWidth, headerHeight).fillAndStroke("#E5E7EB", colors.border);
  doc.rect(x + itemWidth + (stateWidth * 3), y, obsWidth, headerHeight).fillAndStroke("#EDE9FE", colors.border);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(5)
    .text("ITEM", x + 4, y + 3)
    .text("SI", x + itemWidth, y + 3, { width: stateWidth, align: "center" })
    .text("NO", x + itemWidth + stateWidth, y + 3, { width: stateWidth, align: "center" })
    .text("N/A", x + itemWidth + (stateWidth * 2), y + 3, { width: stateWidth, align: "center" })
    .text("OBSERVACION", x + itemWidth + (stateWidth * 3) + 4, y + 3);
  y += headerHeight;

  rows.forEach((row, index) => {
    const fill = index % 2 ? "#FFFFFF" : colors.row;
    const siX = x + itemWidth;
    const noX = siX + stateWidth;
    const naX = noX + stateWidth;
    const obsX = naX + stateWidth;
    doc.rect(x, y, itemWidth, rowHeight).fillAndStroke(fill, colors.border);
    doc.rect(siX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "SI" ? "#DCFCE7" : fill, colors.border);
    doc.rect(noX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "NO" ? "#FEE2E2" : fill, colors.border);
    doc.rect(naX, y, stateWidth, rowHeight).fillAndStroke(row.estado === "NA" ? "#E5E7EB" : fill, colors.border);
    doc.rect(obsX, y, obsWidth, rowHeight).fillAndStroke(fill, colors.border);
    doc.fillColor(colors.dark).font("Helvetica").fontSize(4.9)
      .text(row.nombre || "-", x + 4, y + 2.4, { width: itemWidth - 8, height: rowHeight - 1 });
    doc.font("Helvetica-Bold").fontSize(5.2)
      .text(estadoMark(row.estado, "SI"), siX, y + 2.4, { width: stateWidth, align: "center" })
      .text(estadoMark(row.estado, "NO"), noX, y + 2.4, { width: stateWidth, align: "center" })
      .text(estadoMark(row.estado, "NA"), naX, y + 2.4, { width: stateWidth, align: "center" });
    doc.font("Helvetica").fontSize(4.7)
      .text(row.observacion || "-", obsX + 4, y + 2.4, { width: obsWidth - 8, height: rowHeight - 1 });
    y += rowHeight;
  });

  return y + 8;
};

export const descargarChecklistCamionetaPdf = async (req, res) => {
  try {
    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;
    await registrarPdfDescargado({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCamioneta",
      entidadId: checklist._id,
      observacion: `PDF checklist camioneta ${checklist.patente || ""}`.trim()
    });

    const doc = new PDFDocument({ size: "A4", margin: 35 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=checklist-camioneta-${checklist.patente || checklist._id}.pdf`);
    doc.pipe(res);

    drawLogo(doc, 35, 24, 120);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(20).text("CHECKLIST CAMIONETA", 170, 34);
    doc.fillColor("#64748B").font("Helvetica").fontSize(9).text("Superintendencia Operaciones Litio - Planta PC1", 172, 60);
    doc.rect(35, 88, 525, 5).fill("#461D77");

    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11)
      .text(`Estado: ${checklist.estado}`, 35, 110)
      .text(`Aptitud: ${checklist.aptitudOperacion === "NO_APTA" ? "NO APTA PARA OPERACION" : "APTA PARA OPERACION"}`, 250, 110);

    const datos = [
      ["Tipo", checklist.tipoVehiculo], ["Marca", checklist.marca], ["Modelo", checklist.modelo], ["Patente", checklist.patente],
      ["Color", checklist.color], ["Km/Horometro", checklist.kilometrajeHorometro], ["Ultima mantencion", formatDate(checklist.fechaUltimaMantencion)],
      ["Proxima mantencion", formatDate(checklist.fechaProximaMantencion)], ["Conductor", checklist.conductorResponsable],
      ["Area", checklist.areaTrabajo], ["Fecha inspeccion", formatDate(checklist.fechaInspeccion)], ["Hora", checklist.horaInspeccion],
      ["Turno", checklist.turno || "-"], ["N turno", checklist.turnoNumero || "-"]
    ];

    let y = 145;
    datos.forEach((item, index) => {
      const x = index % 2 === 0 ? 35 : 300;
      if (index % 2 === 0 && index !== 0) y += 28;
      doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(7).text(item[0], x, y);
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(item[1] || "-", x, y + 10, { width: 230 });
    });

    y += 45;
    y = drawTable(doc, "DOCUMENTACION", checklist.documentacion.map(d => ({
      nombre: d.nombre,
      estado: d.estado,
      observacion: formatDate(d.fechaVencimiento)
    })), y, { rowHeight: 13, headerHeight: 13, titleHeight: 16 });

    const inspectionY = y + 2;
    const leftX = 35;
    const rightX = 305;
    let leftY = inspectionY;
    let rightY = inspectionY;
    leftY = drawMiniInspectionTable(doc, "EQUIPAMIENTO Y SEGURIDAD", checklist.aspectosInspeccionar, leftX, leftY, 255);
    leftY = drawMiniInspectionTable(doc, "ESTADO CAMIONETA", checklist.estadoCamioneta, leftX, leftY, 255);
    rightY = drawMiniInspectionTable(doc, "FRENOS Y DIRECCION", checklist.frenosDireccion, rightX, rightY, 255);
    rightY = drawMiniInspectionTable(doc, "LUCES", checklist.luces, rightX, rightY, 255);

    doc.addPage();
    y = 40;

    doc.rect(35, y, 525, 18).fill("#461D77");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8).text("REVISION CARROCERIA", 42, y + 5);
    y += 24;
    const imagenCarroceria = checklist.revisionCarroceria?.imagenMarcada;
    if (imagenCarroceria) {
      drawBase64Image(doc, imagenCarroceria, 40, y, [300, 150]);
      doc.rect(40, y, 300, 150).stroke("#D7D8E8");
    } else {
      doc.rect(40, y, 300, 150).stroke("#D7D8E8");
      doc.fillColor("#64748B").font("Helvetica").fontSize(8).text("Sin marcas graficas", 130, y + 70);
    }
    doc.fillColor("#111827").font("Helvetica").fontSize(8)
      .text(`Abolladura: ${checklist.abolladura ? "SI" : "NO"}`, 355, y + 10)
      .text(`Raya: ${checklist.raya ? "SI" : "NO"}`, 355, y + 28)
      .text(`Picadura: ${checklist.picadura ? "SI" : "NO"}`, 355, y + 46)
      .text(`Observacion: ${checklist.observacionesCarroceria || "-"}`, 355, y + 70, { width: 190 });
    y += 166;

    y = drawMiniResponseTable(doc, "REVISION SISTEMA DE ASISTENCIA AL CONDUCTOR", checklist.sistemaAsistenciaConductor || [], y);
    y = drawMiniResponseTable(doc, "ENCUESTA DE FATIGA / SOMNOLENCIA", checklist.encuestaFatigaSomnolencia || [], y);

    y = ensurePdfSpace(doc, y, 80);
    doc.rect(35, y, 525, 68).fillAndStroke("#F8FAFC", "#D7D8E8");
    doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(9).text("OBSERVACIONES", 45, y + 10);
    doc.fillColor("#111827").font("Helvetica").fontSize(8)
      .text(checklist.observacionesGenerales || "-", 45, y + 30, { width: 500, height: 30 });

    y += 86;
    if (y > 500 && checklist.fotosObservaciones?.length) {
      doc.addPage();
      y = 40;
    }

    doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(10).text("EVIDENCIAS FOTOGRAFICAS", 35, y);
    y += 18;

    if (checklist.fotosObservaciones?.length) {
      const foto = checklist.fotosObservaciones[0];
        const imgPath = path.join(process.cwd(), "src", String(foto.ruta || "").replace(/^\/uploads\//, "uploads/"));
        if (fs.existsSync(imgPath)) {
          try {
            doc.image(imgPath, 35, y, { fit: [525, 245], align: "center", valign: "center" });
            doc.rect(35, y, 525, 245).stroke("#D7D8E8");
          } catch {
            doc.rect(35, y, 525, 245).stroke("#D7D8E8");
          }
        } else {
          doc.rect(35, y, 525, 245).stroke("#D7D8E8");
          doc.fillColor("#64748B").font("Helvetica").fontSize(8).text(foto.nombre || "Foto", 43, y + 116, { width: 509, align: "center" });
        }
        doc.fillColor("#111827").font("Helvetica").fontSize(7).text(`${foto.nombre || "Foto"} - ${formatDate(foto.fecha)}`, 35, y + 249, { width: 525 });
        if (checklist.fotosObservaciones.length > 1) {
          doc.fillColor("#64748B").font("Helvetica").fontSize(7)
            .text(`Hay ${checklist.fotosObservaciones.length - 1} evidencia(s) adicional(es) disponible(s) en el sistema.`, 35, y + 261, { width: 525 });
        }
        y += 282;
    } else {
      doc.fillColor("#64748B").font("Helvetica").fontSize(8).text("Sin evidencias adjuntas", 35, y);
      y += 24;
    }

    y = Math.min(y + 4, 612);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Realizado por", 75, y);
    doc.text("Revisado por", 350, y);
    drawBase64Image(doc, checklist.firmaRealizadoPor || checklist.firmaConductor, 35, y + 18, [245, 95]);
    drawBase64Image(doc, checklist.firmaRevisadoPor || checklist.firmaRevisor, 315, y + 18, [245, 95]);
    doc.moveTo(35, y + 125).lineTo(280, y + 125).stroke();
    doc.moveTo(315, y + 125).lineTo(560, y + 125).stroke();
    doc.font("Helvetica").fontSize(8).text(checklist.nombreRealizadoPor || checklist.nombreConductor || checklist.conductorResponsable || "-", 35, y + 134, { width: 245, align: "center" });
    doc.text(checklist.cargoRealizadoPor || "-", 35, y + 146, { width: 245, align: "center" });
    doc.text(checklist.nombreRevisadoPor || checklist.nombreRevisor || "-", 315, y + 134, { width: 245, align: "center" });
    doc.text(checklist.cargoRevisadoPor || "-", 315, y + 146, { width: 245, align: "center" });

    doc.end();
  } catch (error) {
    return res.status(500).json({ message: "Error generando PDF checklist camioneta" });
  }
};

const styleHeader = (row) => {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF461D77" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" }
    };
  });
};

const paintEstado = (cell) => {
  const value = String(cell.value || "").toUpperCase();
  const colors = {
    BUENO: "FFDCFCE7",
    SI: "FFDCFCE7",
    VIGENTE: "FFDCFCE7",
    MALO: "FFFEE2E2",
    NO: "FFFEE2E2",
    VENCIDO: "FFFEE2E2",
    NA: "FFE5E7EB",
    NO_APLICA: "FFE5E7EB"
  };
  if (colors[value]) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors[value] } };
  }
};

export const descargarChecklistCamionetaExcel = async (req, res) => {
  try {
    const checklist = await getChecklistOr404(req, res);
    if (!checklist) return;
    await registrarExcelDescargado({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCamioneta",
      entidadId: checklist._id,
      observacion: `Excel checklist camioneta ${checklist.patente || ""}`.trim()
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Superintendencia Operaciones Litio";
    const sheet = workbook.addWorksheet("Checklist Camioneta");
    sheet.columns = [
      { header: "Seccion", key: "seccion", width: 28 },
      { header: "Item", key: "item", width: 34 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Observacion / Valor", key: "observacion", width: 48 }
    ];
    styleHeader(sheet.getRow(1));

    const addRow = (seccion, item, estado, observacion = "") => {
      const row = sheet.addRow({ seccion, item, estado, observacion });
      row.eachCell(cell => {
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" }
        };
      });
      paintEstado(row.getCell(3));
    };

    addRow("Datos generales", "Estado", checklist.estado, checklist.aptaOperacion ? "APTA PARA OPERACION" : "NO APTA PARA OPERACION");
    addRow("Vehiculo", "Tipo", "", checklist.tipoVehiculo);
    addRow("Vehiculo", "Marca / Modelo", "", `${checklist.marca || "-"} ${checklist.modelo || ""}`.trim());
    addRow("Vehiculo", "Patente", "", checklist.patente);
    addRow("Vehiculo", "Km/Horometro", "", checklist.kilometrajeHorometro);
    addRow("Conductor", "Responsable", "", checklist.conductorResponsable);
    addRow("Conductor", "Area", "", checklist.areaTrabajo);
    addRow("Conductor", "Fecha / Hora", "", `${formatDate(checklist.fechaInspeccion)} ${checklist.horaInspeccion || ""}`.trim());
    addRow("Conductor", "Turno", "", `${checklist.turno || "-"} ${checklist.turnoNumero ? "N " + checklist.turnoNumero : ""}`.trim());

    checklist.documentacion.forEach(d => addRow("Documentacion", d.nombre, d.estado, formatDate(d.fechaVencimiento)));
    checklist.aspectosInspeccionar.forEach(i => addRow("Equipamiento y seguridad", i.nombre, i.estado, i.observacion));
    checklist.estadoCamioneta.forEach(i => addRow("Estado camioneta", i.nombre, i.estado, i.observacion));
    checklist.frenosDireccion.forEach(i => addRow("Frenos y direccion", i.nombre, i.estado, i.observacion));
    checklist.luces.forEach(i => addRow("Luces", i.nombre, i.estado, i.observacion));
    (checklist.sistemaAsistenciaConductor || []).forEach(i => addRow("Sistema asistencia conductor", i.nombre, i.estado, i.observacion));
    (checklist.encuestaFatigaSomnolencia || []).forEach(i => addRow("Encuesta fatiga / somnolencia", i.nombre, i.estado, i.observacion));
    addRow("Carroceria", "Abolladura / Raya / Picadura", "", `${checklist.abolladura ? "Abolladura " : ""}${checklist.raya ? "Raya " : ""}${checklist.picadura ? "Picadura" : ""}`.trim() || "Sin marcas");
    addRow("Observaciones", "Generales", "", checklist.observacionesGenerales);
    (checklist.fotosObservaciones || []).forEach((foto, index) => {
      addRow("Evidencias", `Foto ${index + 1}`, "", foto.ruta || foto.nombre || "-");
    });
    addRow("Firmas", "Realizado por", "", `${checklist.nombreRealizadoPor || "-"} / ${checklist.cargoRealizadoPor || "-"}`);
    addRow("Firmas", "Revisado por", "", `${checklist.nombreRevisadoPor || "-"} / ${checklist.cargoRevisadoPor || "-"}`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", `attachment; filename=checklist-camioneta-${checklist.patente || checklist._id}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: "Error generando Excel checklist camioneta" });
  }
};
