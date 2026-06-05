import User from "../models/user.js";
import CamionetaAsignada from "../models/CamionetaAsignada.js";
import { registrarEvento } from "../services/operationalAuditService.js";
import {
  AREAS_OPERACIONALES,
  ROLES_ORGANIZACIONALES,
  TURNOS_OPERACIONALES,
  normalizarCamposOrganizacionales,
  obtenerAsignacionUsuario,
  obtenerDashboardOrganizacional
} from "../services/organizationalService.js";

export const obtenerCatalogosOrganizacionales = async (req, res) => {
  res.json({
    areas: AREAS_OPERACIONALES,
    turnos: TURNOS_OPERACIONALES,
    rolesJerarquicos: ROLES_ORGANIZACIONALES,
    cargosSugeridos: [
      "Superintendente",
      "Jefe Planta",
      "Jefe Turno",
      "ECM",
      "Operador Lider",
      "Operador Planta",
      "Operador Caldera"
    ]
  });
};

export const obtenerDashboardOrganizacion = async (req, res) => {
  try {
    const dashboard = await obtenerDashboardOrganizacional();
    return res.json({ dashboard });
  } catch (error) {
    console.error("ERROR DASHBOARD ORGANIZACIONAL:", error);
    return res.status(500).json({ message: "Error cargando dashboard organizacional" });
  }
};

export const obtenerMiAsignacionOperacional = async (req, res) => {
  try {
    const data = await obtenerAsignacionUsuario(req.user?.uid);
    if (!data) return res.status(404).json({ message: "Asignacion operacional no encontrada" });
    return res.json(data);
  } catch (error) {
    console.error("ERROR MI ASIGNACION OPERACIONAL:", error);
    return res.status(500).json({ message: "Error obteniendo asignacion operacional" });
  }
};

export const listarCamionetasAsignadas = async (req, res) => {
  try {
    const camionetas = await CamionetaAsignada.find({})
      .populate("usuarioResponsable", "nombre operadorId rol turno area")
      .sort({ patente: 1 })
      .lean();
    return res.json({ camionetas });
  } catch (error) {
    return res.status(500).json({ message: "Error listando camionetas asignadas" });
  }
};

export const crearCamionetaAsignada = async (req, res) => {
  try {
    const payload = normalizarCamioneta(req.body);
    const camioneta = await CamionetaAsignada.create(payload);
    await registrarEvento({
      req,
      modulo: "ORGANIZACION",
      entidad: "CamionetaAsignada",
      entidadId: camioneta._id,
      accion: "CAMIONETA_ASIGNADA",
      observacion: `Camioneta ${camioneta.patente} creada/asignada`
    });
    await sincronizarResponsableCamioneta(camioneta, req);
    return res.status(201).json({ camioneta });
  } catch (error) {
    return res.status(500).json({ message: "Error creando camioneta asignada", detail: error?.message });
  }
};

export const actualizarCamionetaAsignada = async (req, res) => {
  try {
    const payload = normalizarCamioneta(req.body, { parcial: true });
    const camioneta = await CamionetaAsignada.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!camioneta) return res.status(404).json({ message: "Camioneta no encontrada" });
    await registrarEvento({
      req,
      modulo: "ORGANIZACION",
      entidad: "CamionetaAsignada",
      entidadId: camioneta._id,
      accion: camioneta.usuarioResponsable ? "CAMIONETA_ASIGNADA" : "CAMIONETA_DESASIGNADA",
      observacion: `Camioneta ${camioneta.patente} actualizada`
    });
    await sincronizarResponsableCamioneta(camioneta, req);
    return res.json({ camioneta });
  } catch (error) {
    return res.status(500).json({ message: "Error actualizando camioneta asignada", detail: error?.message });
  }
};

export const actualizarOrganizacionUsuario = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const org = normalizarCamposOrganizacionales(req.body);
    const update = {
      area: org.area,
      planta: org.area,
      turno: org.turno,
      cargo: org.cargo,
      conductorAutorizado: org.conductorAutorizado,
      licenciaInterna: org.licenciaInterna,
      licenciaInternaVigente: org.licenciaInternaVigente,
      fechaVencimientoLicenciaInterna: org.fechaVencimientoLicenciaInterna,
      habilitadoChecklistCamioneta: org.habilitadoChecklistCamioneta,
      jefaturaDirecta: req.body.jefaturaDirecta || null,
      camionetaAsignada: req.body.camionetaAsignada || null
    };

    const actualizado = await User.findByIdAndUpdate(user._id, update, { new: true })
      .populate("jefaturaDirecta", "nombre operadorId rol")
      .populate("camionetaAsignada")
      .lean();

    await registrarEvento({
      req,
      modulo: "ORGANIZACION",
      entidad: "User",
      entidadId: user._id,
      accion: "USUARIO_ASIGNADO_AREA",
      observacion: `Area ${update.area}`
    });
    await registrarEvento({
      req,
      modulo: "ORGANIZACION",
      entidad: "User",
      entidadId: user._id,
      accion: "USUARIO_ASIGNADO_TURNO",
      observacion: `Turno ${update.turno || "SIN_TURNO"}`
    });
    await registrarEvento({
      req,
      modulo: "ORGANIZACION",
      entidad: "User",
      entidadId: user._id,
      accion: update.habilitadoChecklistCamioneta ? "USUARIO_HABILITADO_CONDUCTOR" : "USUARIO_DESHABILITADO_CONDUCTOR",
      observacion: update.habilitadoChecklistCamioneta ? "Habilitado checklist camioneta" : "Deshabilitado checklist camioneta"
    });

    if (org.licenciaInterna.estado === "POR_VENCER" || org.licenciaInterna.estado === "VENCIDA") {
      await registrarEvento({
        req,
        modulo: "ORGANIZACION",
        entidad: "User",
        entidadId: user._id,
        accion: org.licenciaInterna.estado === "VENCIDA" ? "LICENCIA_VENCIDA" : "LICENCIA_POR_VENCER",
        resultado: org.licenciaInterna.estado === "VENCIDA" ? "ERROR" : "OK",
        observacion: `Licencia interna ${org.licenciaInterna.estado}`
      });
    }

    return res.json({ user: actualizado });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO ORGANIZACION USUARIO:", error);
    return res.status(500).json({ message: "Error actualizando organizacion del usuario" });
  }
};

const normalizarCamioneta = (body = {}, { parcial = false } = {}) => {
  const payload = {};
  if (!parcial || body.patente !== undefined) payload.patente = String(body.patente || "").trim().toUpperCase();
  if (!parcial || body.marca !== undefined) payload.marca = String(body.marca || "TOYOTA").trim().toUpperCase();
  if (!parcial || body.modelo !== undefined) payload.modelo = String(body.modelo || "HILUX").trim().toUpperCase();
  if (!parcial || body.color !== undefined) payload.color = String(body.color || "ROJO").trim().toUpperCase();
  if (!parcial || body.area !== undefined) payload.area = String(body.area || "PC1").trim().toUpperCase();
  if (!parcial || body.turno !== undefined) payload.turno = String(body.turno || "").trim().toUpperCase();
  if (body.usuarioResponsable !== undefined) payload.usuarioResponsable = body.usuarioResponsable || null;
  if (body.activo !== undefined) payload.activo = body.activo === true;
  if (body.observacion !== undefined) payload.observacion = String(body.observacion || "").trim();
  return payload;
};

const sincronizarResponsableCamioneta = async (camioneta, req) => {
  if (!camioneta?.usuarioResponsable) return;
  await User.findByIdAndUpdate(camioneta.usuarioResponsable, {
    camionetaAsignada: camioneta._id,
    area: camioneta.area,
    planta: camioneta.area,
    turno: camioneta.turno || undefined
  });
  await registrarEvento({
    req,
    modulo: "ORGANIZACION",
    entidad: "User",
    entidadId: camioneta.usuarioResponsable,
    accion: "CAMIONETA_ASIGNADA",
    observacion: `Camioneta ${camioneta.patente} asignada`
  });
};
