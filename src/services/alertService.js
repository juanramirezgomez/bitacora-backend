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
const ROLES_VALIDOS_ALERTA = [
  "ADMIN",
  "SUPERINTENDENTE",
  "JEFE_PLANTA",
  "JEFE_TURNO",
  "ECM",
  "OPERADOR_LIDER",
  "SUPERVISION",
  "SUPERVISOR",
  "OPERADOR",
  "OPERADOR_PLANTA",
  "OPERADOR_CALDERA"
];
const MATRIZ_NOTIFICACION_ALERTAS = {
  CRITICA: ["JEFE_PLANTA", "JEFE_TURNO", "SUPERINTENDENTE"],
  MEDIA: ["JEFE_PLANTA", "JEFE_TURNO"],
  MENOR: ["JEFE_PLANTA", "JEFE_TURNO"]
};
const CANALES_HISTORIAL = {
  correoCorporativo: "EMAIL_CORPORATIVO",
  correoRespaldo: "EMAIL_RESPALDO",
  whatsapp: "WHATSAPP"
};
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
  "BALIZA",
  "FRENOS",
  "DIRECCION",
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

const ALERTA_CONSOLIDADA_TIPO = "CHECKLIST_CAMIONETA_CONSOLIDADO";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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

const nivelNotificacionAlerta = (alerta = {}) => {
  const prioridad = String(alerta.prioridad || "").trim().toUpperCase();
  if (prioridad === "CRITICA") return "CRITICA";
  if (prioridad === "MEDIA") return "MEDIA";
  return "MENOR";
};

const rolesDestinoParaAlerta = (alerta = {}) =>
  MATRIZ_NOTIFICACION_ALERTAS[nivelNotificacionAlerta(alerta)] || MATRIZ_NOTIFICACION_ALERTAS.MENOR;

const ALERT_USER_SELECT = "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas area turno planta";

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

const generarAlertasDocumentacionConductor = (checklist) => {
  const docs = [
    {
      posee: checklist.licenciaClaseB === true,
      fecha: checklist.fechaVencimientoLicenciaB,
      nombre: "Licencia Clase B",
      tipoVencida: "LICENCIA_VENCIDA",
      tipoPorVencer: "LICENCIA_POR_VENCER"
    },
    {
      posee: checklist.licenciaInterna === true,
      fecha: checklist.fechaVencimientoLicenciaInterna,
      nombre: "Licencia Interna",
      tipoVencida: "LICENCIA_INTERNA_VENCIDA",
      tipoPorVencer: "LICENCIA_INTERNA_POR_VENCER"
    }
  ];

  const alertas = [];
  for (const doc of docs) {
    if (!doc.posee) {
      alertas.push(buildBaseAlert(checklist, "DOCUMENTACION_INCOMPLETA", {
        categoria: "DOCUMENTACION_CONDUCTOR",
        estadoAlerta: "DOCUMENTACION_INCOMPLETA",
        estadoTexto: "Documentacion conductor incompleta",
        prioridad: "CRITICA",
        documento: doc.nombre,
        anomalias: [`${doc.nombre}: no registrada en perfil del operador`],
        mensaje: `${doc.nombre} no registrada para operador de camioneta ${checklist.patente || "-"}.`
      }));
      continue;
    }

    if (!doc.fecha) continue;
    const diasRestantes = calcularDiasRestantes(doc.fecha);
    if (diasRestantes > ALERTA_DIAS) continue;

    const vencida = diasRestantes < 0;
    const estadoTexto = vencida ? `vencida hace ${Math.abs(diasRestantes)} dias` : `vence en ${diasRestantes} dias`;
    alertas.push(buildBaseAlert(checklist, vencida ? doc.tipoVencida : doc.tipoPorVencer, {
      categoria: "DOCUMENTACION_CONDUCTOR",
      estadoAlerta: vencida ? "VENCIDA" : "VENCE_PRONTO",
      estadoTexto: vencida ? "Documento vencido" : "Vence pronto",
      prioridad: vencida ? "CRITICA" : "ALTA",
      documento: doc.nombre,
      fechaVencimiento: doc.fecha,
      diasRestantes,
      anomalias: [`${doc.nombre}: ${estadoTexto}`],
      mensaje: `${doc.nombre} del operador ${estadoTexto} en camioneta ${checklist.patente || "-"}.`
    }));
  }
  return alertas;
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
      .map((item) => {
        const tipo = tipoInspeccionMala(seccion, item);
        const prioridad = tipo === "FRENOS_MALOS" || tipo === "ALERTA_CRITICA" ? "CRITICA" : "ALTA";
        return buildBaseAlert(checklist, tipo, {
          categoria: "INSPECCION",
          estadoAlerta: "ITEM_DEFICIENTE",
          estadoTexto: "Inspeccion requerida",
          prioridad,
          seccion,
          item: item.nombre,
          observacion: item.observacion || "",
          anomalias: [`${seccion}: ${item.nombre} marcado MALO. Observacion: ${item.observacion || "Sin observacion"}`],
          mensaje: `${seccion}: ${item.nombre} marcado MALO en camioneta ${checklist.patente || "-"}. Observacion: ${item.observacion || "Sin observacion"}.`
        });
      })
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

const generarAlertasCarroceria = (checklist) => {
  const revision = checklist.revisionCarroceria || {};
  const hallazgos = [];

  if (checklist.abolladura || revision.abolladura) hallazgos.push("Abolladura registrada");
  if (checklist.raya || revision.raya) hallazgos.push("Raya registrada");
  if (checklist.picadura || revision.picadura) hallazgos.push("Picadura registrada");
  if (Array.isArray(checklist.marcasDanio) && checklist.marcasDanio.length) {
    hallazgos.push(`${checklist.marcasDanio.length} marcas de dano registradas en plantilla`);
  }

  const observacion = String(checklist.observacionesCarroceria || revision.observacionesCarroceria || "").trim();
  if (observacion) hallazgos.push(`Observacion carroceria: ${observacion}`);

  if (!hallazgos.length) return [];

  return [buildBaseAlert(checklist, "CARROCERIA_OBSERVACION", {
    categoria: "CARROCERIA",
    estadoAlerta: "OBSERVACION_MENOR",
    estadoTexto: "Observacion menor",
    prioridad: "BAJA",
    subject: "Observaciones de carroceria en checklist camioneta",
    titulo: "Observaciones de carroceria",
    seccion: "Carroceria",
    observacion,
    anomalias: hallazgos,
    mensaje: `Observaciones de carroceria en camioneta ${checklist.patente || "-"}: ${hallazgos.join("; ")}`
  })];
};

export const generarAlertasChecklist = async (checklistInput) => {
  const checklist = typeof checklistInput?.populate === "function"
    ? await checklistInput.populate("creadoPor", ALERT_USER_SELECT)
    : checklistInput;

  return [
    ...generarAlertasDocumentos(checklist),
    ...generarAlertasDocumentacionConductor(checklist),
    ...generarAlertasMantencion(checklist),
    ...generarAlertasInspeccion(checklist),
    ...generarAlertasCarroceria(checklist),
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

export const obtenerDestinatariosAlertas = async (checklist, alerta = {}) => {
  console.log("Buscando destinatarios dinamicos de alertas por matriz de roles...");
  const operadorId = checklist.creadoPor?._id || checklist.creadoPor || null;
  const rolesDestino = rolesDestinoParaAlerta(alerta);
  const consultas = [];
  if (operadorId) consultas.push({ _id: operadorId });
  if (rolesDestino.length) consultas.push({ rol: { $in: rolesDestino } });

  const users = consultas.length
    ? await User.find({
      $or: consultas,
      estado: "ACTIVO",
      activo: { $ne: false }
    })
      .select(ALERT_USER_SELECT)
      .lean()
    : [];

  const seen = new Set();
  const destinatarios = [];
  for (const user of users) {
    const key = String(user._id || user.email || user.telefono);
    if (seen.has(key)) {
      console.log("ALERTA_DESTINATARIO_OMITIDO_DUPLICADO", {
        motivo: "usuario duplicado",
        userId: key,
        rol: user.rol,
        alerta: alerta.tipo
      });
      continue;
    }
    seen.add(key);
    destinatarios.push(user);
  }

  console.log("ALERTA_DESTINATARIOS_RESUELTOS", {
    alerta: alerta.tipo,
    prioridad: alerta.prioridad,
    nivel: nivelNotificacionAlerta(alerta),
    rolesDestino,
    creadorChecklist: operadorId ? String(operadorId) : "",
    total: destinatarios.length,
    destinatarios: destinatarios.map((u) => ({
      nombre: u.nombre,
      rol: u.rol,
      estado: u.estado,
      telefono: u.telefono,
      correoCorporativo: u.correoCorporativo || u.email,
      correoRespaldo: u.correoRespaldo,
      preferenciasAlertas: u.preferenciasAlertas
    }))
  });
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
  "AURA PRIME | OPERACIONES LITIO"
].join("\n");

const buildPlainMessage = (alerta) => [
  `Alerta Checklist Camioneta - ${alerta.prioridad}`,
  `Patente: ${alerta.patente}`,
  `Operador: ${alerta.operador || "-"}`,
  `Fecha: ${alerta.fechaTexto || "-"}`,
  ...(alerta.anomalias || [alerta.mensaje]).map((item) => `- ${item}`),
  "",
  "AURA PRIME | OPERACIONES LITIO"
].join("\n");

const prioridadConsolidada = (alertas = []) => {
  if (alertas.some((alerta) => alerta.prioridad === "CRITICA")) return "CRITICA";
  if (alertas.some((alerta) => alerta.prioridad === "ALTA")) return "ALTA";
  if (alertas.some((alerta) => alerta.prioridad === "MEDIA")) return "MEDIA";
  return "BAJA";
};

const grupoVacio = () => ({
  documentacionCritica: [],
  documentacionPorVencer: [],
  itemsCriticos: [],
  itemsNoCriticos: []
});

const clasificarAlertaConsolidada = (alerta) => {
  const categoria = normalizeText(alerta.categoria);
  const estado = normalizeText(alerta.estadoAlerta);
  const tipo = normalizeText(alerta.tipo);
  const item = normalizeText(alerta.item || alerta.documento || alerta.seccion);
  const seccion = normalizeText(alerta.seccion);

  if (categoria.includes("DOCUMENTACION") || tipo.includes("LICENCIA") || tipo.includes("REVISION") || tipo.includes("PERMISO") || tipo.includes("SEGURO") || tipo.includes("CERTIFICACION")) {
    return estado.includes("VENCIDA") || alerta.prioridad === "CRITICA"
      ? "documentacionCritica"
      : "documentacionPorVencer";
  }

  if (categoria.includes("MANTENCION")) {
    return estado.includes("VENCIDA") || alerta.prioridad === "CRITICA"
      ? "documentacionCritica"
      : "documentacionPorVencer";
  }

  if (categoria.includes("INSPECCION")) {
    const menor = seccion.includes("CARROCERIA") || item.includes("ABOLLADURA") || item.includes("RAYA") || item.includes("PICADURA");
    if (menor) return "itemsNoCriticos";
    return "itemsCriticos";
  }

  return alerta.prioridad === "CRITICA" ? "itemsCriticos" : "itemsNoCriticos";
};

const resumenItemAlerta = (alerta) => ({
  tipo: alerta.tipo,
  prioridad: alerta.prioridad,
  titulo: alerta.documento || alerta.item || alerta.seccion || alerta.titulo || alerta.tipo,
  detalle: descripcionAlerta(alerta),
  fechaVencimiento: alerta.fechaVencimiento || null,
  diasRestantes: Number.isFinite(alerta.diasRestantes) ? alerta.diasRestantes : null,
  observacion: alerta.observacion || "",
  alertaOperacionalId: alerta.alertaOperacionalId || ""
});

const agruparAlertasChecklist = (alertas = []) => {
  const grupos = grupoVacio();
  for (const alerta of alertas) {
    grupos[clasificarAlertaConsolidada(alerta)].push(resumenItemAlerta(alerta));
  }
  return grupos;
};

const totalAlertasAgrupadas = (grupos) =>
  Object.values(grupos).reduce((total, items) => total + items.length, 0);

const renderGrupoEmail = (titulo, items, color) => {
  if (!items.length) return "";
  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">
        <strong>${escapeHtml(item.titulo)}</strong><br>
        <span style="color:#475569;">${escapeHtml(item.detalle)}</span>
        ${item.fechaVencimiento ? `<br><span style="color:#64748b;">Vencimiento: ${escapeHtml(formatDate(item.fechaVencimiento))}</span>` : ""}
        ${item.observacion ? `<br><span style="color:#64748b;">Observacion: ${escapeHtml(item.observacion)}</span>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${color};">
        ${escapeHtml(item.prioridad)}
      </td>
    </tr>
  `).join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td colspan="2" style="background:${color};padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;">
          ${escapeHtml(titulo)} (${items.length})
        </td>
      </tr>
      ${rows}
    </table>
  `;
};

const buildConsolidatedEmailHtml = ({ alerta }) => {
  const grupos = alerta.grupos || grupoVacio();
  const resumen = alerta.resumen || {};
  return `
  <div style="margin:0;padding:0;background:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:760px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background:#25105f;padding:24px 28px;text-align:center;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:.08em;color:#c4b5fd;font-weight:700;">OPERACIONES LITIO</div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;color:#ffffff;font-weight:800;margin-top:6px;">Alerta consolidada Checklist Camioneta</div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#ddd6fe;margin-top:8px;">PLATAFORMA DE GESTION OPERACIONAL</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#334155;">
                  Se finalizo un checklist de camioneta con <strong>${totalAlertasAgrupadas(grupos)}</strong> hallazgos agrupados para gestion operacional. Este correo consolida la informacion para evitar notificaciones repetidas.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Patente</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;font-weight:700;">${escapeHtml(alerta.patente)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Vehiculo</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">${escapeHtml(resumen.vehiculo)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Inspector</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">${escapeHtml(alerta.operador || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Fecha</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">${escapeHtml(alerta.fechaTexto || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Planta / turno</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;">${escapeHtml(resumen.plantaTurno)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">Aptitud</td>
                    <td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;font-weight:700;">${escapeHtml(resumen.aptitud)}</td>
                  </tr>
                </table>

                ${renderGrupoEmail("DOCUMENTACION CRITICA", grupos.documentacionCritica, "#dc2626")}
                ${renderGrupoEmail("DOCUMENTACION POR VENCER", grupos.documentacionPorVencer, "#d97706")}
                ${renderGrupoEmail("ITEMS CRITICOS", grupos.itemsCriticos, "#ea580c")}
                ${renderGrupoEmail("ITEMS NO CRITICOS", grupos.itemsNoCriticos, "#2563eb")}

                ${resumen.observaciones ? `
                  <div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#334155;">
                    <strong>Observaciones generales:</strong><br>${escapeHtml(resumen.observaciones)}
                  </div>
                ` : ""}

                <p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;text-align:center;">
                  AURA PRIME | OPERACIONES LITIO
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
};

const buildConsolidatedPlainMessage = (alerta) => {
  const grupos = alerta.grupos || grupoVacio();
  const lines = [
    `Alerta consolidada Checklist Camioneta - ${alerta.prioridad}`,
    `Patente: ${alerta.patente}`,
    `Operador: ${alerta.operador || "-"}`,
    `Fecha: ${alerta.fechaTexto || "-"}`,
    ""
  ];
  for (const [titulo, items] of [
    ["DOCUMENTACION CRITICA", grupos.documentacionCritica],
    ["DOCUMENTACION POR VENCER", grupos.documentacionPorVencer],
    ["ITEMS CRITICOS", grupos.itemsCriticos],
    ["ITEMS NO CRITICOS", grupos.itemsNoCriticos]
  ]) {
    if (!items.length) continue;
    lines.push(`${titulo}:`);
    lines.push(...items.map((item) => `- ${item.titulo}: ${item.detalle}`));
    lines.push("");
  }
  lines.push("AURA PRIME | OPERACIONES LITIO");
  return lines.join("\n");
};

const buildConsolidatedWhatsappMessage = (alerta) => {
  const grupos = alerta.grupos || grupoVacio();
  const resumenGrupo = (nombre, items) => items.length ? `${nombre}: ${items.length}` : "";
  const principales = [
    ...grupos.documentacionCritica,
    ...grupos.itemsCriticos,
    ...grupos.documentacionPorVencer,
    ...grupos.itemsNoCriticos
  ].slice(0, 8);

  return [
    "ALERTA CONSOLIDADA CHECKLIST CAMIONETA",
    "",
    `Prioridad: ${alerta.prioridad}`,
    `Patente: ${alerta.patente}`,
    `Operador: ${alerta.operador || "-"}`,
    `Fecha: ${alerta.fechaTexto || "-"}`,
    "",
    "Resumen:",
    resumenGrupo("Documentacion critica", grupos.documentacionCritica),
    resumenGrupo("Documentacion por vencer", grupos.documentacionPorVencer),
    resumenGrupo("Items criticos", grupos.itemsCriticos),
    resumenGrupo("Items no criticos", grupos.itemsNoCriticos),
    "",
    "Principales hallazgos:",
    ...principales.map((item) => `- ${item.titulo}: ${item.detalle}`),
    "",
    "AURA PRIME | OPERACIONES LITIO"
  ].filter((line) => line !== "").join("\n");
};

const buildAlertaConsolidadaChecklist = ({ checklist, alertas }) => {
  const grupos = agruparAlertasChecklist(alertas);
  const prioridad = prioridadConsolidada(alertas);
  const vehiculo = [checklist.marca, checklist.modelo, checklist.color].filter(Boolean).join(" ") || checklist.tipoVehiculo || "-";
  const observaciones = String(checklist.observacionesGenerales || checklist.observacionesDetectadas || checklist.observacionesCarroceria || checklist.revisionCarroceria?.observacionesCarroceria || "").trim();
  const alerta = {
    tipo: ALERTA_CONSOLIDADA_TIPO,
    prioridad,
    titulo: "Alerta consolidada Checklist Camioneta",
    subject: "Alerta consolidada Checklist Camioneta",
    checklistId: checklist._id,
    patente: checklist.patente || "-",
    planta: checklist.planta || "PC1",
    operador: checklist.conductorResponsable || checklist.creadoPor?.nombre || "",
    fecha: checklist.fechaInspeccion || checklist.createdAt || new Date(),
    fechaTexto: formatDate(checklist.fechaInspeccion || checklist.createdAt),
    grupos,
    resumen: {
      vehiculo,
      plantaTurno: `${checklist.planta || "PC1"} / ${checklist.turno || "-"} ${checklist.turnoNumero || ""}`.trim(),
      aptitud: checklist.aptitudOperacion || (checklist.aptaOperacion ? "APTA" : "NO_APTA"),
      observaciones
    },
    anomalias: [
      `Documentacion critica: ${grupos.documentacionCritica.length}`,
      `Documentacion por vencer: ${grupos.documentacionPorVencer.length}`,
      `Items criticos: ${grupos.itemsCriticos.length}`,
      `Items no criticos: ${grupos.itemsNoCriticos.length}`
    ],
    mensaje: `Checklist camioneta ${checklist.patente || "-"} finalizado con ${alertas.length} alertas consolidadas.`
  };
  alerta.html = buildConsolidatedEmailHtml({ alerta });
  alerta.text = buildConsolidatedPlainMessage(alerta);
  alerta.whatsappBody = buildConsolidatedWhatsappMessage(alerta);
  return alerta;
};

export const registrarHistorialAlerta = async ({ alerta, destinatario, canal, estado, error = "", provider = "", messageId = "", from = "" }) => {
  console.log("REGISTRANDO HISTORIAL ALERTA", {
    tipo: alerta.tipo,
    canal,
    estado,
    destinatario: destinatario.email || destinatario.telefono || destinatario.nombre,
    messageId
  });

  const doc = await HistorialAlerta.create({
    tipo: alerta.tipo,
    prioridad: alerta.prioridad,
    mensaje: `${alerta.mensaje} AURA PRIME | OPERACIONES LITIO`,
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
    provider,
    messageId,
    from,
    error,
    checklistId: alerta.checklistId,
    patente: alerta.patente,
    operador: alerta.operador,
    fecha: new Date()
  });

  console.log("HISTORIAL ALERTA REGISTRADO", {
    id: doc._id,
    tipo: alerta.tipo,
    canal,
    estado,
    destinatario: destinatario.email || destinatario.telefono,
    messageId,
    error
  });
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
  const canalValidacion = tipoCorreo === "respaldo" ? "correoRespaldo" : "correoCorporativo";
  const canal = tipoCorreo === "respaldo" ? CANALES_HISTORIAL.correoRespaldo : CANALES_HISTORIAL.correoCorporativo;
  const etiqueta = tipoCorreo === "respaldo" ? "correo respaldo" : "correo corporativo";
  console.log("ENVIANDO ALERTA EMAIL", { usuario: user.email || user.nombre, etiqueta });

  if (debeOmitirPorSoloCriticas(user, alerta)) {
    return omitirCanal({ alerta, user, canal, motivo: "Preferencia soloCriticas activa y alerta no critica" });
  }

  if (tipoCorreo === "respaldo" && !preferencias.correoRespaldo) {
    return omitirCanal({ alerta, user, canal, motivo: "Usuario desactivo correo respaldo" });
  }

  if (tipoCorreo !== "respaldo" && !preferencias.correoCorporativo) {
    return omitirCanal({ alerta, user, canal, motivo: "Usuario desactivo correo corporativo" });
  }

  const validacion = validarUsuarioAlertas(user, canalValidacion);
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
  const html = alerta.html || buildAlertEmailHtml({ alerta, destinatario: validacion.destinatario });
  const text = alerta.text || buildPlainMessage(alerta);
  console.log("ENVIANDO CORREO", {
    fecha: new Date().toISOString(),
    tipo: alerta.tipo,
    canal,
    destinatario: destinoCorreo,
    correoCorporativo: validacion.destinatario.correoCorporativo,
    correoRespaldo: validacion.destinatario.correoRespaldo
  });

  const result = await sendEmailAlert({
    to: destinoCorreo,
    subject,
    html,
    text,
    metadata: {
      correoCorporativo: validacion.destinatario.correoCorporativo,
      correoRespaldo: validacion.destinatario.correoRespaldo
    }
  });

  await registrarHistorialAlerta({
    alerta,
    destinatario: { ...validacion.destinatario, email: destinoCorreo },
    canal,
    estado: result.estado,
    error: result.motivo || "",
    provider: result.provider || "resend",
    messageId: result.messageId || "",
    from: result.from || ""
  });
  return { alerta: alerta.tipo, ...result, canal, provider: result.provider || result.canal };
};
const enviarWhatsappUsuario = async ({ alerta, user }) => {
  console.log("ðŸ“² ENVIANDO ALERTA WHATSAPP", { usuario: user.telefono || user.nombre });
  const preferencias = preferenciasAlertasDe(user);

  if (debeOmitirPorSoloCriticas(user, alerta)) {
    return omitirCanal({ alerta, user, canal: CANALES_HISTORIAL.whatsapp, motivo: "Preferencia soloCriticas activa y alerta no critica" });
  }

  if (!preferencias.whatsapp) {
    return omitirCanal({ alerta, user, canal: CANALES_HISTORIAL.whatsapp, motivo: "Usuario desactivo WhatsApp" });
  }

  const validacion = validarUsuarioAlertas(user, "whatsapp");
  if (!validacion.valido) {
    return omitirCanal({ alerta, user, canal: CANALES_HISTORIAL.whatsapp, motivo: validacion.motivos.join("; ") });
  }
  if (!whatsappConfigured()) {
    return omitirCanal({ alerta, user, canal: CANALES_HISTORIAL.whatsapp, motivo: "Twilio WhatsApp Sandbox no configurado" });
  }

  console.log("ðŸ“² ENVIANDO WHATSAPP", { tipo: alerta.tipo, destinatario: validacion.destinatario.telefono });
  const result = await sendWhatsAppAlert({ to: validacion.destinatario.telefono, body: alerta.whatsappBody || buildWhatsappMessage(alerta) });
  await registrarHistorialAlerta({ alerta, destinatario: validacion.destinatario, canal: CANALES_HISTORIAL.whatsapp, estado: result.estado, error: result.motivo || result.respuesta || "" });
  return { alerta: alerta.tipo, ...result };
};

const destinoCanalParaDeduplicar = ({ user, tipoCorreo = "", canal }) => {
  const destinatario = plainUser(user);
  if (canal === CANALES_HISTORIAL.whatsapp) {
    return destinatario.telefono ? `${canal}:${destinatario.telefono}` : "";
  }
  const email = tipoCorreo === "respaldo"
    ? destinatario.correoRespaldo
    : destinatario.correoCorporativo;
  return email ? `EMAIL:${email}` : "";
};

export const procesarAlertasChecklist = async (checklistOrId) => {
  const inicio = Date.now();
  try {
    console.log("ðŸ”¥ INICIO ALERT SERVICE", {
      email: emailConfigStatus(),
      whatsapp: whatsappConfigured()
    });
    const mongoInicio = Date.now();
    const checklist = typeof checklistOrId === "string"
      ? await ChecklistCamioneta.findById(checklistOrId)
        .select(ALERT_CHECKLIST_SELECT)
        .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas")
      : await checklistOrId.populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas");
    console.log("âš¡ Tiempo Mongo alertas:", `${Date.now() - mongoInicio}ms`);

    if (!checklist) {
      return { alertasGeneradas: [], notificaciones: [{ estado: "omitido", motivo: "Checklist no encontrado" }] };
    }

    const alertasGeneradas = await generarAlertasChecklist(checklist);
    const alertasOperacionales = await sincronizarAlertasOperacionalesChecklist(checklist, alertasGeneradas);
    const notificaciones = [];
    const destinatariosFinales = new Map();

    console.log("EJECUTANDO ALERTAS CHECKLIST", {
      checklistId: checklist._id,
      patente: checklist.patente,
      totalAlertas: alertasGeneradas.length
    });

    if (!alertasGeneradas.length) {
      console.log("ALERT SERVICE: no hay alertas para este checklist");
    }

    if (alertasGeneradas.length) {
      const alertaConsolidada = buildAlertaConsolidadaChecklist({ checklist, alertas: alertasGeneradas });
      const destinatariosPorUsuario = new Map();

      for (const alerta of alertasGeneradas) {
        console.log("Alerta generada para consolidacion:", { tipo: alerta.tipo, prioridad: alerta.prioridad, mensaje: alerta.mensaje });
        const destinatarios = await obtenerDestinatariosAlertas(checklist, alerta);
        for (const user of destinatarios) {
          const destinatarioPlano = plainUser(user);
          const key = String(destinatarioPlano.userId || destinatarioPlano.email || destinatarioPlano.telefono || "");
          if (!key) continue;
          if (destinatariosPorUsuario.has(key)) {
            console.log("ALERTA_DESTINATARIO_OMITIDO_DUPLICADO", {
              alerta: alertaConsolidada.tipo,
              prioridad: alertaConsolidada.prioridad,
              usuario: destinatarioPlano.nombre,
              rol: destinatarioPlano.rol
            });
            continue;
          }
          destinatariosPorUsuario.set(key, user);
          if (destinatarioPlano.userId) {
            destinatariosFinales.set(String(destinatarioPlano.userId), destinatarioPlano);
          }
        }
      }

      console.log("ALERTA CONSOLIDADA PREPARADA", {
        checklistId: checklist._id,
        patente: checklist.patente,
        prioridad: alertaConsolidada.prioridad,
        alertasIncluidas: alertasGeneradas.length,
        destinatarios: destinatariosPorUsuario.size,
        grupos: Object.fromEntries(Object.entries(alertaConsolidada.grupos).map(([key, value]) => [key, value.length]))
      });

      const enviosRealizados = new Set();
      for (const user of destinatariosPorUsuario.values()) {
        const destinatarioPlano = plainUser(user);

        for (const tipoCorreo of ["corporativo", "respaldo"]) {
          const canal = tipoCorreo === "respaldo" ? CANALES_HISTORIAL.correoRespaldo : CANALES_HISTORIAL.correoCorporativo;
          try {
            const dedupeKey = destinoCanalParaDeduplicar({ user, tipoCorreo, canal });
            if (dedupeKey && enviosRealizados.has(dedupeKey)) {
              console.log("ALERTA_DESTINATARIO_OMITIDO_DUPLICADO", {
                alerta: alertaConsolidada.tipo,
                prioridad: alertaConsolidada.prioridad,
                canal,
                destino: dedupeKey,
                usuario: destinatarioPlano.nombre,
                rol: destinatarioPlano.rol
              });
              continue;
            }
            if (dedupeKey) enviosRealizados.add(dedupeKey);

            console.log("ALERTA_ENVIO_INICIADO", {
              alerta: alertaConsolidada.tipo,
              prioridad: alertaConsolidada.prioridad,
              canal,
              usuario: destinatarioPlano.nombre,
              rol: destinatarioPlano.rol
            });
            notificaciones.push(await enviarCorreoUsuario({ alerta: alertaConsolidada, user, tipoCorreo }));
            console.log("ALERTA_ENVIO_FINALIZADO", { alerta: alertaConsolidada.tipo, canal, usuario: destinatarioPlano.nombre });
          } catch (error) {
            console.error("ERROR ALERTAS CORREO CONSOLIDADO:", { tipoCorreo, error: error.message });
            console.error(error);
            const destinatario = plainUser(user);
            await registrarHistorialAlerta({ alerta: alertaConsolidada, destinatario, canal, estado: "error", error: error.message });
            notificaciones.push({ alerta: alertaConsolidada.tipo, canal, estado: "error", destino: destinatario.email, motivo: error.message });
          }
        }

        const canal = CANALES_HISTORIAL.whatsapp;
        try {
          const dedupeKey = destinoCanalParaDeduplicar({ user, canal });
          if (dedupeKey && enviosRealizados.has(dedupeKey)) {
            console.log("ALERTA_DESTINATARIO_OMITIDO_DUPLICADO", {
              alerta: alertaConsolidada.tipo,
              prioridad: alertaConsolidada.prioridad,
              canal,
              destino: dedupeKey,
              usuario: destinatarioPlano.nombre,
              rol: destinatarioPlano.rol
            });
            continue;
          }
          if (dedupeKey) enviosRealizados.add(dedupeKey);

          console.log("ALERTA_ENVIO_INICIADO", {
            alerta: alertaConsolidada.tipo,
            prioridad: alertaConsolidada.prioridad,
            canal,
            usuario: destinatarioPlano.nombre,
            rol: destinatarioPlano.rol
          });
          notificaciones.push(await enviarWhatsappUsuario({ alerta: alertaConsolidada, user }));
          console.log("ALERTA_ENVIO_FINALIZADO", { alerta: alertaConsolidada.tipo, canal, usuario: destinatarioPlano.nombre });
        } catch (error) {
          console.error("ERROR ALERTAS WHATSAPP CONSOLIDADO:", error.message);
          console.error(error);
          const destinatario = plainUser(user);
          await registrarHistorialAlerta({ alerta: alertaConsolidada, destinatario, canal, estado: "error", error: error.message });
          notificaciones.push({ alerta: alertaConsolidada.tipo, canal, estado: "error", destino: destinatario.telefono, motivo: error.message });
        }
      }

      console.log("ALERTA CONSOLIDADA PROCESADA", {
        checklistId: checklist._id,
        patente: checklist.patente,
        notificaciones: notificaciones.length
      });
    }

    console.log("ALERTAS FINALIZADAS", {
      checklistId: checklist._id,
      alertas: alertasGeneradas.length,
      notificaciones: notificaciones.length
    });

    return {
      alertasGeneradas,
      alertasOperacionales,
      notificaciones,
      destinatarios: Array.from(destinatariosFinales.values()),
      canalesActivos: canalesPreparados()
    };
  } catch (error) {
    console.error("âŒ ERROR ALERT SERVICE:", error);
    return { alertasGeneradas: [], notificaciones: [{ estado: "error", motivo: error.message }], destinatarios: [], canalesActivos: canalesPreparados() };
  } finally {
    console.log("âš¡ Tiempo alertas:", `${Date.now() - inicio}ms`);
  }
};

export const canalesPreparados = () => ({
  correo: emailConfigured(),
  email: emailConfigStatus(),
  whatsapp: whatsappConfigured()
});

export const variablesNotificacionChecklistCamioneta = [
  "RESEND_API_KEY",
  "EMAIL_FROM=Operaciones Litio <alertas@auraprime.cl>",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM=whatsapp:+14155238886"
];




