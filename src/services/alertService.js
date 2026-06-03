import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import HistorialAlerta from "../models/HistorialAlerta.js";
import User from "../models/user.js";
import { getAlertTemplate } from "../config/alertTemplates.js";
import { buildAlertEmailHtml, emailConfigured, emailConfigStatus, sendEmailAlert } from "./emailService.js";
import { sendWhatsAppAlert, whatsappConfigured } from "./whatsappService.js";
import { sincronizarAlertasOperacionalesChecklist } from "./alertaCamionetaService.js";

const ALERTA_DIAS = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_CL_REGEX = /^\+569\d{8}$/;
const ROLES_ALERTA = ["SUPERVISION", "SUPERVISOR", "ADMIN"];
const ROLES_VALIDOS_ALERTA = ["ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR", "OPERADOR_PLANTA", "OPERADOR_CALDERA"];
const ESTADOS_ACTIVOS = ["ACTIVO"];
const ALERT_CHECKLIST_SELECT = [
  "-revisionCarroceria.imagenMarcada",
  "-firmaConductor",
  "-firmaRevisor",
  "-firmaRealizadoPor",
  "-firmaRevisadoPor"
].join(" ");

const DOCUMENT_TYPE_MAP = {
  "LICENCIA MUNICIPAL": ["LICENCIA_VENCIDA", "LICENCIA_POR_VENCER"],
  "LICENCIA INTERNA": ["LICENCIA_INTERNA_VENCIDA", "LICENCIA_INTERNA_POR_VENCER"],
  "REVISION TECNICA": ["REVISION_TECNICA_VENCIDA", "REVISION_TECNICA_POR_VENCER"],
  "PERMISO DE CIRCULACION": ["PERMISO_CIRCULACION_VENCIDO", "PERMISO_CIRCULACION_POR_VENCER"],
  "SEGURO OBLIGATORIO": ["SEGURO_OBLIGATORIO_VENCIDO", "SEGURO_OBLIGATORIO_POR_VENCER"],
  "CERTIFICACION INTERNA": ["CERTIFICACION_INTERNA_VENCIDA", "CERTIFICACION_INTERNA_POR_VENCER"]
};

const CRITICAL_ITEMS = [
  "FRENOS",
  "FRENO DE MANO",
  "ESTADO DE NEUMATICOS",
  "ESTADO NEUMATICOS",
  "LUCES DE FRENO",
  "CINTURONES DE SEGURIDAD",
  "EXTINTOR",
  "ALARMA DE RETROCESO",
  "ESTADO DE BOCINA",
  "BOCINA"
];

const inicioDia = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const calcularDiasRestantes = (fecha, hoy = new Date()) => {
  const vencimiento = inicioDia(fecha);
  const actual = inicioDia(hoy);
  return Math.ceil((vencimiento.getTime() - actual.getTime()) / 86400000);
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const descripcionAlerta = (alerta) => {
  const anomalias = Array.isArray(alerta.anomalias) ? alerta.anomalias.filter(Boolean) : [];
  return anomalias[0] || alerta.mensaje || alerta.titulo || alerta.tipo;
};

const buildDedupeKey = (checklist, alerta) => [
  checklist?._id,
  alerta.tipo,
  normalizeText(alerta.item || alerta.documento || descripcionAlerta(alerta)).slice(0, 90)
].join(":");

const debeSincronizarOperacional = (checklist) =>
  ["FINALIZADO", "REVISADO"].includes(String(checklist?.estado || "").trim().toUpperCase());

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CL");
};

const preferenciasAlertasDe = (user = {}) => ({
  whatsapp: user?.preferenciasAlertas?.whatsapp !== false,
  correoCorporativo: user?.preferenciasAlertas?.correoCorporativo !== false,
  correoRespaldo: user?.preferenciasAlertas?.correoRespaldo !== false,
  soloCriticas: user?.preferenciasAlertas?.soloCriticas === true
});

const plainUser = (user) => ({
  userId: user?._id || null,
  nombre: user?.nombre || "",
  email: String(user?.email || "").trim().toLowerCase(),
  correoCorporativo: String(user?.correoCorporativo || user?.email || "").trim().toLowerCase(),
  correoRespaldo: String(user?.correoRespaldo || "").trim().toLowerCase(),
  telefono: String(user?.telefono || "").trim(),
  rol: user?.rol || "",
  estadoUsuario: user?.estado || "",
  activo: user?.activo !== false,
  preferenciasAlertas: preferenciasAlertasDe(user)
});

const usuarioBaseValido = (destinatario) => {
  const motivos = [];
  if (!destinatario.userId) motivos.push("Usuario no identificado");
  if (!ROLES_VALIDOS_ALERTA.includes(destinatario.rol)) {
    motivos.push(`Rol no habilitado para alertas (${destinatario.rol || "sin rol"})`);
  }
  if (!ESTADOS_ACTIVOS.includes(destinatario.estadoUsuario) || !destinatario.activo) {
    motivos.push(`Usuario no activo (${destinatario.estadoUsuario || "sin estado"})`);
  }
  return motivos;
};

export const validarUsuarioAlertas = (user, canal = "ambos") => {
  const destinatario = plainUser(user);
  const motivos = usuarioBaseValido(destinatario);

  if ((canal === "correo" || canal === "correoCorporativo" || canal === "ambos") && !EMAIL_REGEX.test(destinatario.correoCorporativo)) {
    motivos.push("Correo corporativo obligatorio o formato invalido");
  }
  if (canal === "correoRespaldo" && !EMAIL_REGEX.test(destinatario.correoRespaldo)) {
    motivos.push("Correo respaldo obligatorio o formato invalido");
  }
  if ((canal === "whatsapp" || canal === "ambos") && !TELEFONO_CL_REGEX.test(destinatario.telefono)) {
    motivos.push("Telefono obligatorio o formato invalido +569XXXXXXXX");
  }

  return {
    valido: motivos.length === 0,
    motivos,
    destinatario
  };
};

const debeOmitirPorSoloCriticas = (user, alerta) =>
  preferenciasAlertasDe(user).soloCriticas && alerta.prioridad !== "CRITICA";

const buildBaseAlert = (checklist, tipo, data = {}) => {
  const template = getAlertTemplate(tipo);
  const alerta = {
    tipo,
    prioridad: data.prioridad || template.prioridad,
    titulo: template.whatsapp.title,
    subject: template.email.subject,
    checklistId: checklist._id,
    patente: checklist.patente || "-",
    planta: checklist.planta || "PC1",
    operador: checklist.conductorResponsable || checklist.creadoPor?.nombre || "",
    fecha: checklist.fechaInspeccion || checklist.createdAt || new Date(),
    fechaTexto: formatDate(checklist.fechaInspeccion || checklist.createdAt),
    anomalias: [],
    ...data
  };
  alerta.mensaje = data.mensaje || `${alerta.titulo} - camioneta ${alerta.patente}`;
  return alerta;
};

const documentTypesFor = (nombre) => {
  const normalized = normalizeText(nombre);
  return DOCUMENT_TYPE_MAP[normalized] || ["DOCUMENTACION_INCOMPLETA", "DOCUMENTACION_INCOMPLETA"];
};

const generarAlertasDocumentos = (checklist) => {
  const alertas = [];

  for (const documento of checklist.documentacion || []) {
    if (!documento?.nombre || documento.estado === "NO_APLICA") continue;

    if (!documento.fechaVencimiento) {
      alertas.push(buildBaseAlert(checklist, "DOCUMENTACION_INCOMPLETA", {
        categoria: "DOCUMENTACION",
        estadoAlerta: "DOCUMENTACION_INCOMPLETA",
        estadoTexto: "Documentacion incompleta",
        prioridad: "ALTA",
        documento: documento.nombre,
        anomalias: [`${documento.nombre}: sin fecha de vencimiento registrada`],
        mensaje: `${documento.nombre} sin fecha de vencimiento en camioneta ${checklist.patente || "-"}`
      }));
      continue;
    }

    const diasRestantes = calcularDiasRestantes(documento.fechaVencimiento);
    if (diasRestantes > ALERTA_DIAS && documento.estado !== "VENCIDO") continue;

    const [vencidaType, porVencerType] = documentTypesFor(documento.nombre);
    const vencida = diasRestantes < 0 || documento.estado === "VENCIDO";
    const tipo = vencida ? vencidaType : porVencerType;
    const estadoTexto = vencida ? `vencido hace ${Math.abs(diasRestantes)} dias` : `vence en ${diasRestantes} dias`;

    alertas.push(buildBaseAlert(checklist, tipo, {
      categoria: "DOCUMENTACION",
      estadoAlerta: vencida ? "VENCIDA" : "VENCE_PRONTO",
      estadoTexto: vencida ? "Documento vencido" : "Vence pronto",
      prioridad: vencida ? "CRITICA" : "ALTA",
      documento: documento.nombre,
      fechaVencimiento: documento.fechaVencimiento,
      diasRestantes,
      anomalias: [`${documento.nombre}: ${estadoTexto}`],
      mensaje: `${documento.nombre} de camioneta ${checklist.patente || "-"} ${estadoTexto}.`
    }));
  }

  return alertas;
};

const generarAlertasMantencion = (checklist) => {
  if (!checklist.fechaProximaMantencion) return [];
  const diasRestantes = calcularDiasRestantes(checklist.fechaProximaMantencion);
  if (diasRestantes > ALERTA_DIAS) return [];
  const estadoTexto = diasRestantes < 0 ? `vencida hace ${Math.abs(diasRestantes)} dias` : `vence en ${diasRestantes} dias`;

  return [buildBaseAlert(checklist, "MANTENCION_PROXIMA", {
    categoria: "MANTENCION",
    estadoAlerta: diasRestantes < 0 ? "VENCIDA" : "VENCE_PRONTO",
    estadoTexto: diasRestantes < 0 ? "Mantencion vencida" : "Mantencion proxima",
    prioridad: diasRestantes < 0 ? "CRITICA" : "ALTA",
    fechaVencimiento: checklist.fechaProximaMantencion,
    diasRestantes,
    anomalias: [`Proxima mantencion: ${estadoTexto}`],
    mensaje: `Mantencion de camioneta ${checklist.patente || "-"} ${estadoTexto}.`
  })];
};

const tipoInspeccionMala = (seccion, item) => {
  const group = normalizeText(seccion);
  const itemName = normalizeText(item?.nombre);
  if (group.includes("FRENOS")) return "FRENOS_MALOS";
  if (group.includes("LUCES")) return "LUCES_MALAS";
  if (CRITICAL_ITEMS.includes(itemName)) return "ALERTA_CRITICA";
  return "ALERTA_CRITICA";
};

const generarAlertasInspeccion = (checklist) => {
  const grupos = [
    ["Equipamiento y seguridad", checklist.aspectosInspeccionar || []],
    ["Estado camioneta", checklist.estadoCamioneta || []],
    ["Frenos y direccion", checklist.frenosDireccion || []],
    ["Luces", checklist.luces || []]
  ];

  return grupos.flatMap(([seccion, items]) =>
    items
      .filter((item) => item.estado === "MALO")
      .map((item) => buildBaseAlert(checklist, tipoInspeccionMala(seccion, item), {
        categoria: "INSPECCION",
        estadoAlerta: "ITEM_DEFICIENTE",
        estadoTexto: "Inspeccion requerida",
        prioridad: "ALTA",
        seccion,
        item: item.nombre,
        observacion: item.observacion || "",
        anomalias: [`${seccion}: ${item.nombre} marcado MALO. Observacion: ${item.observacion || "Sin observacion"}`],
        mensaje: `${seccion}: ${item.nombre} marcado MALO en camioneta ${checklist.patente || "-"}. Observacion: ${item.observacion || "Sin observacion"}.`
      }))
  );
};

const generarAlertasObservacionesCriticas = (checklist) => {
  const texto = String(checklist.observacionesGenerales || checklist.observacionesDetectadas || "").trim();
  if (!texto) return [];

  const normalizado = normalizeText(texto);
  const critica = ["CRITICO", "URGENTE", "NO OPERAR", "NO APTA", "FUERA DE SERVICIO", "RIESGO", "PELIGRO"]
    .some((keyword) => normalizado.includes(keyword));
  if (!critica) return [];

  return [buildBaseAlert(checklist, "ALERTA_CRITICA", {
    seccion: "Observaciones",
    observacion: texto,
    anomalias: [`Observacion critica registrada: ${texto}`],
    mensaje: `Observacion critica en camioneta ${checklist.patente || "-"}: ${texto}`
  })];
};

export const generarAlertasChecklist = async (checklistInput) => {
  const checklist = typeof checklistInput?.populate === "function"
    ? await checklistInput.populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
    : checklistInput;

  return [
    ...generarAlertasDocumentos(checklist),
    ...generarAlertasMantencion(checklist),
    ...generarAlertasInspeccion(checklist),
    ...generarAlertasObservacionesCriticas(checklist)
  ];
};

const enriquecerAlertasOperacionales = async (checklist, alertas = []) => {
  if (!checklist?._id || !Array.isArray(alertas) || !alertas.length) return alertas;

  const keys = alertas.map((alerta) => buildDedupeKey(checklist, alerta));
  const operacionales = await AlertaCamioneta.find({ dedupeKey: { $in: keys } })
    .select("_id dedupeKey estado prioridad responsable fechaAsignacion fechaResolucion fechaCierre")
    .lean();
  const byKey = new Map(operacionales.map((alerta) => [alerta.dedupeKey, alerta]));

  return alertas.map((alerta) => {
    const operacional = byKey.get(buildDedupeKey(checklist, alerta));
    return {
      ...alerta,
      alertaOperacionalId: operacional?._id ? String(operacional._id) : "",
      estadoOperacionAlerta: operacional?.estado || "ABIERTA",
      prioridadOperacionAlerta: operacional?.prioridad || alerta.prioridad,
      responsableAlerta: operacional?.responsable || "",
      fechaAsignacionAlerta: operacional?.fechaAsignacion || null,
      fechaResolucionAlerta: operacional?.fechaResolucion || null,
      fechaCierreAlerta: operacional?.fechaCierre || null
    };
  });
};

export const obtenerAlertasVencimientosChecklistCamioneta = async (filter = {}) => {
  console.log("PASO 1 ALERT SERVICE: obtener alertas de vencimientos");
  const checklists = await ChecklistCamioneta.find({ eliminado: { $ne: true }, ...filter })
    .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
    .sort({ fechaInspeccion: -1, createdAt: -1 });

  const alertas = [];
  for (const checklist of checklists) {
    const generadas = await generarAlertasChecklist(checklist);
    if (debeSincronizarOperacional(checklist)) {
      await sincronizarAlertasOperacionalesChecklist(checklist, generadas);
    }
    const enriquecidas = await enriquecerAlertasOperacionales(checklist, generadas);
    alertas.push(...enriquecidas.filter((alerta) =>
      ["LICENCIA_", "REVISION_", "PERMISO_", "SEGURO_", "CERTIFICACION_", "MANTENCION_", "DOCUMENTACION_"]
        .some((prefix) => alerta.tipo.startsWith(prefix))
    ));
  }

  console.log("PASO 2 ALERT SERVICE: alertas de vencimientos generadas", alertas.length);
  return alertas;
};

export const obtenerAlertasChecklistCamioneta = async (filter = {}) => {
  console.log("PASO 1 ALERT SERVICE: obtener todas las alertas checklist camioneta");
  const checklists = await ChecklistCamioneta.find({ eliminado: { $ne: true }, ...filter })
    .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
    .sort({ fechaInspeccion: -1, createdAt: -1 });

  const alertas = [];
  for (const checklist of checklists) {
    const generadas = await generarAlertasChecklist(checklist);
    if (debeSincronizarOperacional(checklist)) {
      await sincronizarAlertasOperacionalesChecklist(checklist, generadas);
    }
    alertas.push(...await enriquecerAlertasOperacionales(checklist, generadas));
  }

  console.log("PASO 2 ALERT SERVICE: total alertas checklist camioneta", alertas.length);
  return alertas;
};

export const obtenerDestinatariosAlertas = async (checklist) => {
  console.log("Buscando destinatarios dinamicos de alertas...");
  const operadorId = checklist.creadoPor?._id || checklist.creadoPor || null;
  const users = await User.find({
    $or: [
      { _id: operadorId },
      { rol: { $in: ROLES_ALERTA } }
    ]
  })
    .select("nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
    .lean();

  const seen = new Set();
  const destinatarios = [];
  for (const user of users) {
    const key = String(user._id || user.email || user.telefono);
    if (seen.has(key)) continue;
    seen.add(key);
    destinatarios.push(user);
  }

  console.log("Destinatarios encontrados:", destinatarios.map((u) => ({
    nombre: u.nombre,
    rol: u.rol,
    estado: u.estado,
    telefono: u.telefono,
    correoCorporativo: u.correoCorporativo || u.email,
    correoRespaldo: u.correoRespaldo,
    preferenciasAlertas: u.preferenciasAlertas
  })));
  return destinatarios;
};

const buildWhatsappMessage = (alerta) => [
  "ALERTA CHECKLIST CAMIONETA",
  "",
  `Prioridad: ${alerta.prioridad}`,
  `Patente: ${alerta.patente}`,
  `Operador: ${alerta.operador || "-"}`,
  `Fecha: ${alerta.fechaTexto || "-"}`,
  "",
  "Anomalias detectadas:",
  ...(alerta.anomalias || [alerta.mensaje]).map((item) => `- ${item}`),
  "",
  "NOVANDINO | GESTIÓN OPERACIONAL"
].join("\n");

const buildPlainMessage = (alerta) => [
  `Alerta Checklist Camioneta - ${alerta.prioridad}`,
  `Patente: ${alerta.patente}`,
  `Operador: ${alerta.operador || "-"}`,
  `Fecha: ${alerta.fechaTexto || "-"}`,
  ...(alerta.anomalias || [alerta.mensaje]).map((item) => `- ${item}`),
  "",
  "NOVANDINO | GESTIÓN OPERACIONAL"
].join("\n");

export const registrarHistorialAlerta = async ({ alerta, destinatario, canal, estado, error = "" }) => {
  console.log("🧾 REGISTRANDO HISTORIAL", {
    tipo: alerta.tipo,
    canal,
    estado,
    destinatario: destinatario.email || destinatario.telefono || destinatario.nombre
  });

  const doc = await HistorialAlerta.create({
    tipo: alerta.tipo,
    prioridad: alerta.prioridad,
    mensaje: `${alerta.mensaje} NOVANDINO | GESTIÓN OPERACIONAL`,
    destinatarios: [{
      userId: destinatario.userId || destinatario._id || null,
      nombre: destinatario.nombre || "",
      email: destinatario.email || "",
      correoCorporativo: destinatario.correoCorporativo || "",
      correoRespaldo: destinatario.correoRespaldo || "",
      telefono: destinatario.telefono || "",
      rol: destinatario.rol || "",
      estadoUsuario: destinatario.estadoUsuario || destinatario.estado || "",
      motivo: error || ""
    }],
    canal,
    estado,
    error,
    checklistId: alerta.checklistId,
    patente: alerta.patente,
    operador: alerta.operador,
    fecha: new Date()
  });

  console.log("🧾 HISTORIAL REGISTRADO", { id: doc._id, tipo: alerta.tipo, canal, estado, destinatario: destinatario.email || destinatario.telefono, error });
  return doc;
};

const omitirCanal = async ({ alerta, user, canal, motivo }) => {
  const destinatario = plainUser(user);
  console.log(`Alerta omitida por ${canal}:`, { usuario: destinatario.nombre, motivo });
  await registrarHistorialAlerta({ alerta, destinatario, canal, estado: "omitido", error: motivo });
  return { alerta: alerta.tipo, canal, estado: "omitido", destino: destinatario.email || destinatario.telefono || destinatario.nombre, motivo };
};

const enviarCorreoUsuario = async ({ alerta, user, tipoCorreo }) => {
  const preferencias = preferenciasAlertasDe(user);
  const canal = tipoCorreo === "respaldo" ? "correoRespaldo" : "correoCorporativo";
  const etiqueta = tipoCorreo === "respaldo" ? "Gmail respaldo" : "correo corporativo";
  console.log("📧 ENVIANDO ALERTA EMAIL", { usuario: user.email || user.nombre, etiqueta });

  if (debeOmitirPorSoloCriticas(user, alerta)) {
    return omitirCanal({ alerta, user, canal, motivo: "Preferencia soloCriticas activa y alerta no critica" });
  }

  if (tipoCorreo === "respaldo" && !preferencias.correoRespaldo) {
    return omitirCanal({ alerta, user, canal, motivo: "Usuario desactivo correo respaldo" });
  }

  if (tipoCorreo !== "respaldo" && !preferencias.correoCorporativo) {
    return omitirCanal({ alerta, user, canal, motivo: "Usuario desactivo correo corporativo" });
  }

  const validacion = validarUsuarioAlertas(user, canal);
  if (!validacion.valido) {
    return omitirCanal({ alerta, user, canal, motivo: validacion.motivos.join("; ") });
  }
  if (!emailConfigured()) {
    return omitirCanal({ alerta, user, canal, motivo: "Resend no configurado" });
  }

  const destinoCorreo = tipoCorreo === "respaldo"
    ? validacion.destinatario.correoRespaldo
    : validacion.destinatario.correoCorporativo;
  const subject = `[${alerta.prioridad}] ${alerta.subject} - ${alerta.patente}`;
  const html = buildAlertEmailHtml({ alerta, destinatario: validacion.destinatario });
  const text = buildPlainMessage(alerta);
  console.log("📨 ENVIANDO CORREO", { tipo: alerta.tipo, canal, destinatario: destinoCorreo });
  const result = await sendEmailAlert({ to: destinoCorreo, subject, html, text });
  await registrarHistorialAlerta({
    alerta,
    destinatario: { ...validacion.destinatario, email: destinoCorreo },
    canal,
    estado: result.estado,
    error: result.motivo || result.provider || ""
  });
  return { alerta: alerta.tipo, ...result, canal, provider: result.provider || result.canal };
};

const enviarWhatsappUsuario = async ({ alerta, user }) => {
  console.log("📲 ENVIANDO ALERTA WHATSAPP", { usuario: user.telefono || user.nombre });
  const preferencias = preferenciasAlertasDe(user);

  if (debeOmitirPorSoloCriticas(user, alerta)) {
    return omitirCanal({ alerta, user, canal: "whatsapp", motivo: "Preferencia soloCriticas activa y alerta no critica" });
  }

  if (!preferencias.whatsapp) {
    return omitirCanal({ alerta, user, canal: "whatsapp", motivo: "Usuario desactivo WhatsApp" });
  }

  const validacion = validarUsuarioAlertas(user, "whatsapp");
  if (!validacion.valido) {
    return omitirCanal({ alerta, user, canal: "whatsapp", motivo: validacion.motivos.join("; ") });
  }
  if (!whatsappConfigured()) {
    return omitirCanal({ alerta, user, canal: "whatsapp", motivo: "Twilio WhatsApp Sandbox no configurado" });
  }

  console.log("📲 ENVIANDO WHATSAPP", { tipo: alerta.tipo, destinatario: validacion.destinatario.telefono });
  const result = await sendWhatsAppAlert({ to: validacion.destinatario.telefono, body: buildWhatsappMessage(alerta) });
  await registrarHistorialAlerta({ alerta, destinatario: validacion.destinatario, canal: "whatsapp", estado: result.estado, error: result.motivo || result.respuesta || "" });
  return { alerta: alerta.tipo, ...result };
};

export const procesarAlertasChecklist = async (checklistOrId) => {
  const inicio = Date.now();
  try {
    console.log("🔥 INICIO ALERT SERVICE", {
      email: emailConfigStatus(),
      whatsapp: whatsappConfigured()
    });
    const mongoInicio = Date.now();
    const checklist = typeof checklistOrId === "string"
      ? await ChecklistCamioneta.findById(checklistOrId)
        .select(ALERT_CHECKLIST_SELECT)
        .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
      : await checklistOrId.populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas");
    console.log("⚡ Tiempo Mongo alertas:", `${Date.now() - mongoInicio}ms`);

    if (!checklist) {
      return { alertasGeneradas: [], notificaciones: [{ estado: "omitido", motivo: "Checklist no encontrado" }] };
    }

    const alertasGeneradas = await generarAlertasChecklist(checklist);
    const alertasOperacionales = await sincronizarAlertasOperacionalesChecklist(checklist, alertasGeneradas);
    const destinatarios = await obtenerDestinatariosAlertas(checklist);
    const notificaciones = [];

    console.log("🔥 EJECUTANDO ALERTAS CHECKLIST", {
      checklistId: checklist._id,
      patente: checklist.patente,
      totalAlertas: alertasGeneradas.length,
      totalDestinatarios: destinatarios.length
    });

    if (!alertasGeneradas.length) {
      console.log("ALERT SERVICE: no hay alertas para este checklist");
    }

    for (const alerta of alertasGeneradas) {
      console.log("🔥 Alerta generada:", { tipo: alerta.tipo, prioridad: alerta.prioridad, mensaje: alerta.mensaje });
      for (const user of destinatarios) {
        try {
          notificaciones.push(await enviarCorreoUsuario({ alerta, user, tipoCorreo: "corporativo" }));
          notificaciones.push(await enviarCorreoUsuario({ alerta, user, tipoCorreo: "respaldo" }));
        } catch (error) {
          console.error("❌ ERROR ALERTAS CORREO:", error.message);
          console.error(error);
          const destinatario = plainUser(user);
          await registrarHistorialAlerta({ alerta, destinatario, canal: "correo", estado: "error", error: error.message });
          notificaciones.push({ alerta: alerta.tipo, canal: "correo", estado: "error", destino: destinatario.email, motivo: error.message });
        }

        try {
          notificaciones.push(await enviarWhatsappUsuario({ alerta, user }));
        } catch (error) {
          console.error("❌ ERROR ALERTAS WHATSAPP:", error.message);
          console.error(error);
          const destinatario = plainUser(user);
          await registrarHistorialAlerta({ alerta, destinatario, canal: "whatsapp", estado: "error", error: error.message });
          notificaciones.push({ alerta: alerta.tipo, canal: "whatsapp", estado: "error", destino: destinatario.telefono, motivo: error.message });
        }
      }
      console.log("✅ ALERTA PROCESADA", { tipo: alerta.tipo, prioridad: alerta.prioridad });
    }

    console.log("✅ ALERTAS FINALIZADAS", {
      checklistId: checklist._id,
      alertas: alertasGeneradas.length,
      notificaciones: notificaciones.length
    });

    return {
      alertasGeneradas,
      alertasOperacionales,
      notificaciones,
      destinatarios: destinatarios.map(plainUser),
      canalesActivos: canalesPreparados()
    };
  } catch (error) {
    console.error("❌ ERROR ALERT SERVICE:", error);
    return { alertasGeneradas: [], notificaciones: [{ estado: "error", motivo: error.message }], destinatarios: [], canalesActivos: canalesPreparados() };
  } finally {
    console.log("⚡ Tiempo alertas:", `${Date.now() - inicio}ms`);
  }
};

export const canalesPreparados = () => ({
  correo: emailConfigured(),
  email: emailConfigStatus(),
  whatsapp: whatsappConfigured()
});

export const variablesNotificacionChecklistCamioneta = [
  "RESEND_API_KEY",
  "EMAIL_FROM=onboarding@resend.dev",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM=whatsapp:+14155238886"
];
