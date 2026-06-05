import mongoose from "mongoose";
import User from "../models/user.js";
import CamionetaAsignada from "../models/CamionetaAsignada.js";

export const AREAS_OPERACIONALES = ["PC1", "PLANTA_AMPLIADA", "CALDERA", "MANTENCION", "LABORATORIO", "ADMINISTRACION", "OTROS"];
export const TURNOS_OPERACIONALES = ["39", "44", "ADMINISTRATIVO", "OTROS"];
export const ROLES_ORGANIZACIONALES = [
  "SUPERINTENDENTE",
  "JEFE_PLANTA",
  "JEFE_TURNO",
  "ECM",
  "OPERADOR_LIDER",
  "OPERADOR_PLANTA",
  "OPERADOR_CALDERA"
];

const MS_DIA = 24 * 60 * 60 * 1000;

export const normalizarArea = (value = "") => {
  const area = String(value || "").trim().toUpperCase();
  return AREAS_OPERACIONALES.includes(area) ? area : "PC1";
};

export const normalizarTurnoOperacional = (value = "") => {
  const turno = String(value || "").trim().toUpperCase();
  if (!turno) return "";
  return TURNOS_OPERACIONALES.includes(turno) ? turno : "";
};

export const calcularEstadoLicenciaInterna = (fechaVencimiento) => {
  if (!fechaVencimiento) return { estado: "NO_REGISTRADA", vigente: false };
  const vencimiento = new Date(fechaVencimiento);
  if (Number.isNaN(vencimiento.getTime())) return { estado: "NO_REGISTRADA", vigente: false };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  vencimiento.setHours(0, 0, 0, 0);
  const dias = Math.ceil((vencimiento.getTime() - hoy.getTime()) / MS_DIA);
  if (dias < 0) return { estado: "VENCIDA", vigente: false, diasRestantes: dias };
  if (dias <= 30) return { estado: "POR_VENCER", vigente: true, diasRestantes: dias };
  return { estado: "VIGENTE", vigente: true, diasRestantes: dias };
};

export const normalizarCamposOrganizacionales = (payload = {}) => {
  const fechaLicencia = payload.fechaVencimientoLicenciaInterna
    || payload.licenciaInterna?.fechaVencimiento
    || null;
  const licencia = calcularEstadoLicenciaInterna(fechaLicencia);
  const conductorSolicitado = payload.conductorAutorizado === true || String(payload.conductorAutorizado || "").toUpperCase() === "SI";
  const conductorAutorizado = licencia.estado === "VENCIDA" ? false : conductorSolicitado;
  const habilitadoChecklist = payload.habilitadoChecklistCamioneta !== undefined
    ? payload.habilitadoChecklistCamioneta === true || String(payload.habilitadoChecklistCamioneta || "").toUpperCase() === "TRUE"
    : conductorAutorizado && licencia.vigente;

  return {
    area: normalizarArea(payload.area || payload.planta || "PC1"),
    turno: normalizarTurnoOperacional(payload.turno || ""),
    cargo: String(payload.cargo || "").trim(),
    conductorAutorizado,
    licenciaInterna: {
      numero: String(payload.licenciaInterna?.numero || payload.numeroLicenciaInterna || "").trim(),
      fechaVencimiento: fechaLicencia ? new Date(fechaLicencia) : null,
      estado: licencia.estado
    },
    licenciaInternaVigente: licencia.vigente,
    fechaVencimientoLicenciaInterna: fechaLicencia ? new Date(fechaLicencia) : null,
    habilitadoChecklistCamioneta: habilitadoChecklist && conductorAutorizado && licencia.vigente
  };
};

export const obtenerAsignacionUsuario = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) return null;
  const user = await User.findById(userId)
    .select("nombre operadorId rol planta area turno cargo jefaturaDirecta conductorAutorizado licenciaInterna licenciaInternaVigente fechaVencimientoLicenciaInterna habilitadoChecklistCamioneta camionetaAsignada")
    .populate("jefaturaDirecta", "nombre operadorId rol correoCorporativo correoRespaldo telefono")
    .populate("camionetaAsignada")
    .lean();
  if (!user) return null;

  return {
    usuario: user,
    camioneta: user.camionetaAsignada || null,
    puedeChecklistCamioneta: user.habilitadoChecklistCamioneta === true
      && user.conductorAutorizado === true
      && user.licenciaInternaVigente === true
      && Boolean(user.camionetaAsignada)
  };
};

export const obtenerDashboardOrganizacional = async () => {
  const [
    usuariosPorArea,
    usuariosPorTurno,
    conductoresAutorizados,
    conductoresSinLicenciaVigente,
    camionetasAsignadas,
    checklistHabilitados,
    checklistDeshabilitados
  ] = await Promise.all([
    User.aggregate([{ $group: { _id: "$area", total: { $sum: 1 } } }, { $sort: { total: -1 } }]),
    User.aggregate([{ $group: { _id: "$turno", total: { $sum: 1 } } }, { $sort: { total: -1 } }]),
    User.countDocuments({ conductorAutorizado: true, activo: true }),
    User.countDocuments({ conductorAutorizado: true, licenciaInternaVigente: { $ne: true }, activo: true }),
    CamionetaAsignada.countDocuments({ activo: true, usuarioResponsable: { $ne: null } }),
    User.countDocuments({ habilitadoChecklistCamioneta: true, activo: true }),
    User.countDocuments({ habilitadoChecklistCamioneta: { $ne: true }, activo: true })
  ]);

  return {
    usuariosPorArea: usuariosPorArea.map((item) => ({ area: item._id || "SIN_AREA", total: item.total })),
    usuariosPorTurno: usuariosPorTurno.map((item) => ({ turno: item._id || "SIN_TURNO", total: item.total })),
    conductoresAutorizados,
    conductoresSinLicenciaVigente,
    camionetasAsignadas,
    checklistHabilitados,
    checklistDeshabilitados
  };
};
