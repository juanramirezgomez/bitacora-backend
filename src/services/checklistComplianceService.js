import mongoose from "mongoose";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
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
  const recientes = await ChecklistCamioneta.aggregate([
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
  ]);

  const map = new Map();
  [...DEFAULT_VEHICLES, ...recientes].forEach((item) => {
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
  for (const item of pendientes) {
    await registrarEvento({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCumplimiento",
      accion: "CHECKLIST_RECORDATORIO_ENVIADO",
      observacion: `Recordatorio ${hora}:00 checklist pendiente patente ${item.patente}`
    });
  }
  return { total: pendientes.length, pendientes };
};

export const generarEscalamiento = async ({ fecha = new Date(), nivel = "MEDIA", req = null } = {}) => {
  const cumplimiento = await validarChecklistDiario({ fecha, user: req?.user || null });
  const pendientes = cumplimiento.vehiculos.filter((item) => item.estadoCumplimiento === "PENDIENTE");
  const accion = nivel === "CRITICA" ? "CHECKLIST_INCUMPLIMIENTO_CRITICO" : "CHECKLIST_INCUMPLIMIENTO";
  for (const item of pendientes) {
    await registrarEvento({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCumplimiento",
      accion,
      observacion: `${accion} patente ${item.patente}`
    });
  }
  return { total: pendientes.length, pendientes, nivel };
};

export const actualizarIndicadores = validarChecklistDiario;
