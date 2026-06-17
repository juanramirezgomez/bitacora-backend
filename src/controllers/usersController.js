// src/controllers/usersController.js
import bcrypt from "bcryptjs";
import User from "../models/user.js";
import { reevaluarAlertasDocumentales } from "../services/documentacionOperacionalService.js";

const ROLES = [
  "ADMIN",
  "SUPERINTENDENTE",
  "JEFE_PLANTA",
  "JEFE_TURNO",
  "ECM",
  "OPERADOR_LIDER",
  "OPERADOR",
  "SUPERVISOR",
  "OPERADOR_CALDERA",
  "OPERADOR_PLANTA",
  "SUPERVISION"
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_REGEX = /^[^\s@]+@gmail\.com$/i;
const TELEFONO_CL_REGEX = /^\+569\d{8}$/;
const TURNOS_ASIGNADOS_ALERTA = ["39", "44", "Ambos"];
const toBoolean = (value) =>
  value === true || String(value || "").trim().toUpperCase() === "SI" || String(value || "").trim().toLowerCase() === "true";

const normalizarFecha = (value) => {
  if (!value) return null;
  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const preferenciasAlertasDefault = (preferencias = {}) => ({
  whatsapp: preferencias.whatsapp !== false,
  correoCorporativo: preferencias.correoCorporativo !== false,
  correoRespaldo: preferencias.correoRespaldo !== false,
  soloCriticas: preferencias.soloCriticas === true
});

const normalizarTurnoAsignado = (value = "Ambos") => {
  const turno = String(value || "").trim();
  return TURNOS_ASIGNADOS_ALERTA.includes(turno) ? turno : "Ambos";
};

const contactosDe = ({ username = "", email = "", correoCorporativo = "", correoRespaldo = "", telefono = "" }) => {
  const corporativo = String(correoCorporativo || email || username || "").trim().toLowerCase();
  const respaldo = String(correoRespaldo || "").trim().toLowerCase();
  const principal = corporativo || respaldo;
  return {
    username: principal,
    email: principal,
    correoCorporativo: corporativo,
    correoRespaldo: respaldo,
    telefono: String(telefono || "").trim()
  };
};

const validarContactos = ({ email, correoCorporativo, correoRespaldo, telefono }) => {
  const errores = [];
  if (!email) errores.push("correo corporativo o Gmail respaldo obligatorio");
  if (correoCorporativo && !EMAIL_REGEX.test(correoCorporativo)) errores.push("correo corporativo invalido");
  if (correoRespaldo && !GMAIL_REGEX.test(correoRespaldo)) errores.push("correo Gmail respaldo invalido");
  if (telefono && !TELEFONO_CL_REGEX.test(telefono)) errores.push("telefono invalido. Usa formato +569XXXXXXXX");
  return errores;
};

const sanitizeUser = (u) => ({
  id: u._id,
  username: u.username,
  operadorId: u.operadorId || "",
  nombre: u.nombre,
  email: u.email,
  correoCorporativo: u.correoCorporativo || u.email || "",
  correoRespaldo: u.correoRespaldo || "",
  telefono: u.telefono,
  preferenciasAlertas: preferenciasAlertasDefault(u.preferenciasAlertas),
  rol: u.rol,
  estado: u.estado,
  planta: u.planta,
  area: u.area || u.planta || "PC1",
  turno: u.turno || "",
  turnoAsignado: normalizarTurnoAsignado(u.turnoAsignado),
  cargo: u.cargo || "",
  licenciaClaseB: u.licenciaClaseB === true,
  fechaVencimientoLicenciaB: u.fechaVencimientoLicenciaB || null,
  licenciaInterna: u.licenciaInterna === true,
  fechaVencimientoLicenciaInterna: u.fechaVencimientoLicenciaInterna || null,
  modulosPermitidos: u.modulosPermitidos || [],
  debeCambiarPassword: u.debeCambiarPassword === true,
  activo: u.activo,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt
});

// PUT /api/users/documentacion
export const actualizarDocumentacionOperacional = async (req, res) => {
  try {
    const id = req.user?.uid || req.user?.id || req.user?._id;
    if (!id) return res.status(401).json({ message: "Token invalido" });

    const update = {};
    if (req.body?.licenciaClaseB !== undefined) update.licenciaClaseB = toBoolean(req.body.licenciaClaseB);
    if (req.body?.licenciaInterna !== undefined) update.licenciaInterna = toBoolean(req.body.licenciaInterna);

    if (req.body?.fechaVencimientoLicenciaB !== undefined) {
      const fecha = normalizarFecha(req.body.fechaVencimientoLicenciaB);
      if (req.body.fechaVencimientoLicenciaB && !fecha) return res.status(400).json({ message: "Fecha vencimiento Licencia Clase B invalida" });
      update.fechaVencimientoLicenciaB = fecha;
    }

    if (req.body?.fechaVencimientoLicenciaInterna !== undefined) {
      const fecha = normalizarFecha(req.body.fechaVencimientoLicenciaInterna);
      if (req.body.fechaVencimientoLicenciaInterna && !fecha) return res.status(400).json({ message: "Fecha vencimiento Licencia Interna invalida" });
      update.fechaVencimientoLicenciaInterna = fecha;
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno turnoAsignado cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const reevaluacion = await reevaluarAlertasDocumentales(user);
    return res.json({
      message: "Documentacion operacional actualizada",
      user: sanitizeUser(user),
      reevaluacion
    });
  } catch (e) {
    console.error("ERROR ACTUALIZANDO DOCUMENTACION OPERACIONAL:", e);
    return res.status(500).json({ message: "Error actualizando documentacion operacional" });
  }
};

// GET /api/users
export const listUsers = async (req, res) => {
  try {
    const { q = "", rol = "", activo = "" } = req.query;

    const filter = {};

    if (q) {
      filter.$or = [
        { username: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { correoCorporativo: { $regex: String(q), $options: "i" } },
        { correoRespaldo: { $regex: String(q), $options: "i" } },
        { nombre: { $regex: String(q), $options: "i" } }
      ];
    }

    if (rol) filter.rol = String(rol).toUpperCase();
    if (activo !== "") filter.activo = String(activo) === "true";

    const users = await User.find(filter).sort({ createdAt: -1 });
    return res.json(users.map(sanitizeUser));
  } catch (e) {
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// POST /api/users
export const createUser = async (req, res) => {
  try {
    const { username, email, correoCorporativo, correoRespaldo, telefono, preferenciasAlertas, nombre, rol, password, turnoAsignado } = req.body || {};

    const contactos = contactosDe({ username, email, correoCorporativo, correoRespaldo, telefono });
    const n = String(nombre || "").trim();
    const r = String(rol || "").trim().toUpperCase();
    const p = String(password || "").trim();

    if (!contactos.email || !n || !r || !p) {
      return res.status(400).json({ message: "correo, nombre, rol y password son obligatorios" });
    }

    const erroresContactos = validarContactos(contactos);
    if (erroresContactos.length) return res.status(400).json({ message: erroresContactos.join(". ") });

    if (!ROLES.includes(r)) {
      return res.status(400).json({ message: "rol invalido" });
    }

    const exists = await User.findOne({
      $or: [
        { username: contactos.username },
        { email: contactos.email }
      ]
    });
    if (exists) return res.status(409).json({ message: "usuario ya existe" });

    const passwordHash = await bcrypt.hash(p, 10);

    const created = await User.create({
      username: contactos.username,
      nombre: n,
      email: contactos.email,
      correoCorporativo: contactos.correoCorporativo,
      correoRespaldo: contactos.correoRespaldo,
      telefono: contactos.telefono,
      preferenciasAlertas: preferenciasAlertasDefault(preferenciasAlertas),
      rol: r,
      turnoAsignado: normalizarTurnoAsignado(turnoAsignado),
      passwordHash,
      estado: "ACTIVO",
      planta: "PC1",
      activo: true
    });

    return res.status(201).json(sanitizeUser(created));
  } catch (e) {
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// PUT /api/users/:id
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, correoCorporativo, correoRespaldo, telefono, preferenciasAlertas, nombre, rol, turnoAsignado } = req.body || {};

    const update = {};

    if (username !== undefined || email !== undefined || correoCorporativo !== undefined || correoRespaldo !== undefined || telefono !== undefined) {
      const actual = await User.findById(id);
      if (!actual) return res.status(404).json({ message: "Usuario no encontrado" });

      const contactos = contactosDe({
        username: username ?? actual.username,
        email: email ?? actual.email,
        correoCorporativo: correoCorporativo ?? actual.correoCorporativo,
        correoRespaldo: correoRespaldo ?? actual.correoRespaldo,
        telefono: telefono ?? actual.telefono
      });

      const erroresContactos = validarContactos(contactos);
      if (erroresContactos.length) return res.status(400).json({ message: erroresContactos.join(". ") });

      const exists = await User.findOne({
        _id: { $ne: id },
        $or: [
          { username: contactos.username },
          { email: contactos.email }
        ]
      });
      if (exists) return res.status(409).json({ message: "usuario ya existe" });

      update.username = contactos.username;
      update.email = contactos.email;
      update.correoCorporativo = contactos.correoCorporativo;
      update.correoRespaldo = contactos.correoRespaldo;
      update.telefono = contactos.telefono;
    }

    if (nombre !== undefined) {
      const n = String(nombre || "").trim();
      if (!n) return res.status(400).json({ message: "nombre invalido" });
      update.nombre = n;
    }

    if (rol !== undefined) {
      const r = String(rol || "").trim().toUpperCase();
      if (!ROLES.includes(r)) return res.status(400).json({ message: "rol invalido" });
      update.rol = r;
    }

    if (preferenciasAlertas !== undefined) {
      update.preferenciasAlertas = preferenciasAlertasDefault(preferenciasAlertas);
    }
    if (turnoAsignado !== undefined) {
      update.turnoAsignado = normalizarTurnoAsignado(turnoAsignado);
    }

    const updated = await User.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json(sanitizeUser(updated));
  } catch (e) {
    return res.status(500).json({ message: "Error editando usuario" });
  }
};

// PATCH /api/users/:id/password
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const p = String(password || "").trim();

    if (!p) return res.status(400).json({ message: "password es obligatorio" });

    const passwordHash = await bcrypt.hash(p, 10);

    const updated = await User.findByIdAndUpdate(
      id,
      {
        passwordHash,
        debeCambiarPassword: true,
        failedLoginAttempts: 0,
        lockUntil: null
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Password actualizado", user: sanitizeUser(updated) });
  } catch (e) {
    return res.status(500).json({ message: "Error reseteando password" });
  }
};

// PATCH /api/users/:id/activo
export const setActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body || {};

    const val = Boolean(activo);

    const updated = await User.findByIdAndUpdate(id, { activo: val, estado: val ? "ACTIVO" : "BLOQUEADO" }, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Estado actualizado", user: sanitizeUser(updated) });
  } catch (e) {
    return res.status(500).json({ message: "Error cambiando estado" });
  }
};

// DELETE /api/users/:id
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user?.uid || "") === String(id)) {
      return res.status(400).json({ message: "No puedes eliminar tu propio usuario" });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Usuario eliminado" });
  } catch (e) {
    return res.status(500).json({ message: "Error eliminando usuario" });
  }
};
