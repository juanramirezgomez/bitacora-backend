import mongoose from "mongoose";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import User from "../models/user.js";
import CamionetaAsignada from "../models/CamionetaAsignada.js";
import { sendEmailAlert } from "./emailService.js";
import { sendWhatsAppAlert } from "./whatsappService.js";
import { registrarEvento } from "./operationalAuditService.js";

const DEFAULT_VEHICLES = [
  {
    patente: "SWJJ-86",
    planta: "PC1",
    area: "PLANTA PC1",
    turnoNumero: "44",
    operador: "Operador PC1",
    activo: true
  }
];

const startOfDay = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date = new Date()) => {
  const value = startOfDay(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const addDays = (date, days) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

const normalizePatente = (value) => String(value || "").trim().toUpperCase();

const dayRange = (date = new Date()) => ({
  start: startOfDay(date),
  end: endOfDay(date)
});

const pct = (realizados, total) => total ? Math.round((realizados / total) * 100) : 100;

const isNoAptaPorAlerta = (alerta = {}) => {
  const tipo = String(alerta.tipo || alerta.descripcion || "").toUpperCase();
  const estado = String(alerta.estado || "").toUpperCase();
  if (!["ABIERTA", "ASIGNADA", "EN_PROCESO"].includes(estado)) return false;
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
  ].some((word) => tipo.includes(word)) && tipo.includes("VENC");
};

const emailValido = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const telefonoValido = (value = "") => /^\+569\d{8}$/.test(String(value || "").trim());

const obtenerUsuariosNotificacion = async ({ roles = [], turnoNumero = "" } = {}) => {
  const incluyeOperadores = roles.some((rol) => ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"].includes(rol));
  const usuarios = await User.find({
    activo: true,
    estado: "ACTIVO",
    rol: { $in: roles },
    ...(incluyeOperadores ? {
      $or: [
        { rol: { $nin: ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"] } },
        {
          conductorAutorizado: true,
          licenciaInternaVigente: true,
          habilitadoChecklistCamioneta: true,
          camionetaAsignada: { $ne: null }
        }
      ]
    } : {})
  })
    .select("nombre rol turno correoCorporativo correoRespaldo telefono preferenciasAlertas")
    .lean();

  const filtrados = usuarios.filter((user) => {
    if (!turnoNumero) return true;
    if (!["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"].includes(user.rol)) return true;
    return !user.turno || String(user.turno) === String(turnoNumero);
  });

  const map = new Map();
  for (const user of filtrados) map.set(String(user._id), user);
  return Array.from(map.values());
};

const buildMensajeCumplimiento = ({ item, tipo, nivel = "MEDIA" }) => {
  const titulo = tipo === "RECORDATORIO"
    ? "Recordatorio checklist camioneta"
    : nivel === "CRITICA"
      ? "Incumplimiento operacional critico"
      : "Incumplimiento checklist camioneta";

  const texto = `${titulo}\n\nPatente: ${item.patente}\nArea: ${item.area || "PC1"}\nTurno: ${item.turnoNumero || "-"}\nEstado: Checklist pendiente\n\nNOVANDINO | GESTION OPERACIONAL`;
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#111827">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#312e81;color:white;padding:18px 22px">
          <strong>OPERACIONES LITIO</strong>
          <h2 style="margin:6px 0 0;font-size:20px">${titulo}</h2>
        </div>
        <div style="padding:22px">
          <p>Se detecta checklist de camioneta pendiente.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Patente</td><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>${item.patente}</strong></td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Area</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${item.area || "PC1"}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Turno</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${item.turnoNumero || "-"}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Nivel</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${nivel}</td></tr>
          </table>
          <p style="margin-top:20px;color:#475569">Favor regularizar el cumplimiento operacional del checklist diario.</p>
        </div>
        <div style="padding:14px 22px;background:#f1f5f9;color:#475569;font-size:12px">NOVANDINO | GESTION OPERACIONAL</div>
      </div>
    </div>
  `;
  return { titulo, texto, html };
};

const enviarNotificacionCumplimiento = async ({ item, tipo, nivel = "MEDIA", req = null }) => {
  const roles = tipo === "RECORDATORIO"
    ? ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"]
    : nivel === "CRITICA"
      ? ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER", "JEFE_TURNO", "JEFE_PLANTA", "SUPERINTENDENTE"]
      : ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER", "JEFE_TURNO", "JEFE_PLANTA"];
  const usuarios = await obtenerUsuariosNotificacion({ roles, turnoNumero: item.turnoNumero });
  const mensaje = buildMensajeCumplimiento({ item, tipo, nivel });
  const enviados = [];

  for (const user of usuarios) {
    const preferencias = user.preferenciasAlertas || {};
    if (preferencias.soloCriticas && nivel !== "CRITICA") continue;

    const correos = [];
    if (preferencias.correoCorporativo !== false && emailValido(user.correoCorporativo)) {
      correos.push({ canal: "EMAIL_CORPORATIVO", email: user.correoCorporativo });
    }
    if (preferencias.correoRespaldo !== false && emailValido(user.correoRespaldo)) {
      correos.push({ canal: "EMAIL_RESPALDO", email: user.correoRespaldo });
    }

    const emailsUnicos = new Map(correos.map((mail) => [mail.email, mail]));
    for (const mail of emailsUnicos.values()) {
      console.log("ALERTA_ENVIO_INICIADO", { canal: mail.canal, destinatario: mail.email, patente: item.patente });
      const result = await sendEmailAlert({
        to: mail.email,
        subject: mensaje.titulo,
        html: mensaje.html,
        text: mensaje.texto,
        metadata: { tipo: "CHECKLIST_CUMPLIMIENTO", patente: item.patente, canal: mail.canal }
      });
      enviados.push({ usuario: user.nombre, canal: mail.canal, destinatario: mail.email, ok: result.ok });
    }

    if (preferencias.whatsapp !== false && telefonoValido(user.telefono)) {
      console.log("ALERTA_ENVIO_INICIADO", { canal: "WHATSAPP", destinatario: user.telefono, patente: item.patente });
      const result = await sendWhatsAppAlert({ to: user.telefono, body: mensaje.texto });
      enviados.push({ usuario: user.nombre, canal: "WHATSAPP", destinatario: user.telefono, ok: result.ok });
    }
  }

  await registrarEvento({
    req,
    modulo: "CHECKLIST_CAMIONETA",
    entidad: "ChecklistCumplimiento",
    accion: tipo === "RECORDATORIO"
      ? "CHECKLIST_RECORDATORIO_ENVIADO"
      : nivel === "CRITICA"
        ? "CHECKLIST_INCUMPLIMIENTO_CRITICO"
        : "CHECKLIST_INCUMPLIMIENTO",
    observacion: `${item.patente}: ${enviados.length} notificaciones procesadas`
  });

  console.log("ALERTA_ENVIO_FINALIZADO", { patente: item.patente, total: enviados.length });
  return enviados;
};

export const normalizarCumplimientoChecklist = (payload = {}) => {
  const fechaProgramada = payload.fechaProgramada || payload.fechaInspeccion || new Date();
  const fechaRealizacion = payload.fechaRealizacion || payload.fechaInspeccion || new Date();
  const programada = startOfDay(fechaProgramada);
  const realizada = startOfDay(fechaRealizacion);
  const atrasado = realizada.getTime() > programada.getTime();

  return {
    fechaProgramada,
    fechaRealizacion,
    checklistAtrasado: atrasado,
    cumplimientoEstado: atrasado ? "ATRASADO" : "REALIZADO"
  };
};

export const obtenerFlotaChecklistActiva = async ({ filtroBase = {} } = {}) => {
  const [recientes, asignadas] = await Promise.all([
    ChecklistCamioneta.aggregate([
    {
      $match: {
        eliminado: { $ne: true },
        patente: { $nin: [null, ""] },
        ...filtroBase
      }
    },
    { $sort: { fechaInspeccion: -1, createdAt: -1 } },
    {
      $group: {
        _id: "$patente",
        patente: { $first: "$patente" },
        planta: { $first: "$planta" },
        area: { $first: "$areaTrabajo" },
        turnoNumero: { $first: "$turnoNumero" },
        operador: { $first: "$conductorResponsable" }
      }
    },
    { $limit: 80 }
    ]),
    CamionetaAsignada.find({ activo: true })
      .select("patente marca modelo color area turno usuarioResponsable")
      .populate("usuarioResponsable", "nombre turno")
      .lean()
  ]);

  const map = new Map();
  const flotaAsignada = asignadas.map((item) => ({
    patente: item.patente,
    planta: item.area || "PC1",
    area: item.area || "PC1",
    turnoNumero: item.turno || item.usuarioResponsable?.turno || "",
    operador: item.usuarioResponsable?.nombre || ""
  }));
  [...DEFAULT_VEHICLES, ...flotaAsignada, ...recientes].forEach((item) => {
    const patente = normalizePatente(item.patente);
    if (!patente) return;
    map.set(patente, {
      patente,
      planta: item.planta || "PC1",
      area: item.area || item.areaTrabajo || "PLANTA PC1",
      turnoNumero: String(item.turnoNumero || "").trim(),
      operador: item.operador || item.conductorResponsable || "",
      activo: true
    });
  });
  return Array.from(map.values());
};

const contarRealizadosPeriodo = async ({ desde, hasta, filtroBase = {} }) =>
  ChecklistCamioneta.countDocuments({
    eliminado: { $ne: true },
    estado: { $in: ["FINALIZADO", "REVISADO"] },
    ...filtroBase,
    $or: [
      { fechaProgramada: { $gte: desde, $lte: hasta } },
      { fechaInspeccion: { $gte: desde, $lte: hasta } }
    ]
  });

export const validarChecklistDiario = async ({ fecha = new Date(), user = null } = {}) => {
  const inicio = Date.now();
  const { start, end } = dayRange(fecha);
  const filtroBase = {};

  if (["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"].includes(String(user?.rol || "").toUpperCase())) {
    const id = user?.id || user?._id || user?.uid;
    if (mongoose.Types.ObjectId.isValid(String(id || ""))) {
      filtroBase.creadoPor = new mongoose.Types.ObjectId(id);
    }
  }

  const flota = await obtenerFlotaChecklistActiva({ filtroBase });
  const patentes = flota.map((item) => item.patente);

  const [checklistsHoy, atrasados, alertasActivas] = await Promise.all([
    ChecklistCamioneta.find({
      eliminado: { $ne: true },
      patente: { $in: patentes },
      ...filtroBase,
      $or: [
        { fechaProgramada: { $gte: start, $lte: end } },
        { fechaInspeccion: { $gte: start, $lte: end } }
      ]
    })
      .select("_id patente estado fechaProgramada fechaRealizacion fechaInspeccion turno turnoNumero planta areaTrabajo conductorResponsable aptaOperacion aptitudOperacion checklistAtrasado cumplimientoEstado")
      .sort({ fechaInspeccion: -1, createdAt: -1 })
      .lean(),
    ChecklistCamioneta.countDocuments({
      eliminado: { $ne: true },
      checklistAtrasado: true,
      ...filtroBase
    }),
    AlertaCamioneta.find({
      activo: { $ne: false },
      patente: { $in: patentes },
      estado: { $in: ["ABIERTA", "ASIGNADA", "EN_PROCESO"] }
    }).select("patente tipo descripcion prioridad estado").lean()
  ]);

  const checklistPorPatente = new Map();
  for (const checklist of checklistsHoy) {
    const patente = normalizePatente(checklist.patente);
    if (!checklistPorPatente.has(patente)) checklistPorPatente.set(patente, checklist);
  }

  const alertasPorPatente = new Map();
  for (const alerta of alertasActivas) {
    const patente = normalizePatente(alerta.patente);
    const arr = alertasPorPatente.get(patente) || [];
    arr.push(alerta);
    alertasPorPatente.set(patente, arr);
  }

  const vehiculos = flota.map((vehiculo) => {
    const checklist = checklistPorPatente.get(vehiculo.patente);
    const alertas = alertasPorPatente.get(vehiculo.patente) || [];
    const noAptoPorAlerta = alertas.some(isNoAptaPorAlerta);
    const noAptoPorChecklist = checklist?.aptaOperacion === false || String(checklist?.aptitudOperacion || "").toUpperCase() === "NO_APTA";
    return {
      ...vehiculo,
      estadoCumplimiento: checklist ? "CUMPLIDO" : "PENDIENTE",
      checklistId: checklist?._id || null,
      fechaProgramada: checklist?.fechaProgramada || start,
      fechaRealizacion: checklist?.fechaRealizacion || checklist?.fechaInspeccion || null,
      atrasado: Boolean(checklist?.checklistAtrasado),
      noApto: noAptoPorAlerta || noAptoPorChecklist,
      motivoNoApto: noAptoPorAlerta ? "Alerta activa critica o documental vencida" : (noAptoPorChecklist ? "Checklist no apto" : ""),
      turno: checklist?.turno || "",
      turnoNumero: checklist?.turnoNumero || vehiculo.turnoNumero || "",
      operador: checklist?.conductorResponsable || vehiculo.operador || ""
    };
  });

  const totalVehiculos = vehiculos.length;
  const realizadosHoy = vehiculos.filter((item) => item.estadoCumplimiento === "CUMPLIDO").length;
  const pendientesHoy = Math.max(totalVehiculos - realizadosHoy, 0);
  const noAptos = vehiculos.filter((item) => item.noApto).length;
  const incumplimientosCriticos = vehiculos.filter((item) => item.estadoCumplimiento === "PENDIENTE" && item.noApto).length;

  const weekStart = addDays(start, -6);
  const monthStart = addDays(start, -29);
  const [realizadosSemana, realizadosMes] = await Promise.all([
    contarRealizadosPeriodo({ desde: weekStart, hasta: end, filtroBase }),
    contarRealizadosPeriodo({ desde: monthStart, hasta: end, filtroBase })
  ]);

  const cumplimiento = {
    hoy: pct(realizadosHoy, totalVehiculos),
    semana: pct(realizadosSemana, totalVehiculos * 7),
    mes: pct(realizadosMes, totalVehiculos * 30)
  };

  const turnos = ["39", "44"].map((turnoNumero) => {
    const items = vehiculos.filter((item) => String(item.turnoNumero || "") === turnoNumero);
    return {
      turnoNumero,
      realizados: items.filter((item) => item.estadoCumplimiento === "CUMPLIDO").length,
      pendientes: items.filter((item) => item.estadoCumplimiento === "PENDIENTE").length,
      atrasados: items.filter((item) => item.atrasado).length
    };
  });

  const areasMap = new Map();
  for (const item of vehiculos) {
    const area = item.area || item.planta || "PC1";
    const current = areasMap.get(area) || { area, realizados: 0, pendientes: 0, atrasados: 0, noAptos: 0 };
    if (item.estadoCumplimiento === "CUMPLIDO") current.realizados += 1;
    if (item.estadoCumplimiento === "PENDIENTE") current.pendientes += 1;
    if (item.atrasado) current.atrasados += 1;
    if (item.noApto) current.noAptos += 1;
    areasMap.set(area, current);
  }

  const resumen = {
    checklistRealizadosHoy: realizadosHoy,
    checklistPendientesHoy: pendientesHoy,
    checklistAtrasados: atrasados,
    incumplimientosCriticos,
    vehiculosNoAptos: noAptos,
    totalVehiculos,
    cumplimiento,
    turnos,
    areas: Array.from(areasMap.values()),
    vehiculos,
    actualizadoEn: new Date()
  };

  console.log("✅ CUMPLIMIENTO CHECKLIST CALCULADO", {
    realizadosHoy,
    pendientesHoy,
    totalVehiculos,
    tiempo: `${Date.now() - inicio}ms`
  });
  return resumen;
};

export const generarRecordatorios = async ({ fecha = new Date(), hora = 8, req = null } = {}) => {
  const cumplimiento = await validarChecklistDiario({ fecha, user: req?.user || null });
  const pendientes = cumplimiento.vehiculos.filter((item) => item.estadoCumplimiento === "PENDIENTE");
  const notificaciones = [];
  for (const item of pendientes) {
    notificaciones.push(...await enviarNotificacionCumplimiento({ item, tipo: "RECORDATORIO", nivel: "MEDIA", req }));
  }
  return { total: pendientes.length, pendientes, notificaciones, hora };
};

export const generarEscalamiento = async ({ fecha = new Date(), nivel = "MEDIA", req = null } = {}) => {
  const cumplimiento = await validarChecklistDiario({ fecha, user: req?.user || null });
  const pendientes = cumplimiento.vehiculos.filter((item) => item.estadoCumplimiento === "PENDIENTE");
  const notificaciones = [];
  for (const item of pendientes) {
    notificaciones.push(...await enviarNotificacionCumplimiento({ item, tipo: "ESCALAMIENTO", nivel, req }));
  }
  return { total: pendientes.length, pendientes, nivel, notificaciones };
};

export const actualizarIndicadores = validarChecklistDiario;
