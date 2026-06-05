// src/controllers/authController.js
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import HistorialUsuario from "../models/HistorialUsuario.js";
import LoginAudit from "../models/LoginAudit.js";
import PasswordResetRequest from "../models/PasswordResetRequest.js";
import {
  registrarCambioPassword,
  registrarDesbloqueoAutomatico,
  registrarLoginBloqueado,
  registrarLoginExitoso,
  registrarLoginFallido,
  registrarLogout,
  registrarPasswordTemporalGenerada,
  registrarResetPassword,
  registrarResetPasswordAprobado,
  registrarResetPasswordRechazado,
  registrarSolicitudRecuperacionAprobada,
  registrarSolicitudResetPassword
} from "../services/loginAuditService.js";
import { registrarEvento } from "../services/operationalAuditService.js";
import { buildPasswordTemporalEmailHtml, sendEmailAlert } from "../services/emailService.js";
import { sendWhatsAppAlert } from "../services/whatsappService.js";

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

const REGISTER_ROLES = [
  "OPERADOR_CALDERA",
  "OPERADOR_LIDER",
  "OPERADOR_PLANTA",
  "SUPERINTENDENTE",
  "JEFE_PLANTA",
  "JEFE_TURNO",
  "ECM",
  "SUPERVISION"
];

const normalizarRol = (rol) => String(rol || "").trim().toUpperCase();
const ESTADOS = ["PENDIENTE", "ACTIVO", "BLOQUEADO", "INACTIVO"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_CL_REGEX = /^\+569\d{8}$/;
const GMAIL_REGEX = /^[^\s@]+@gmail\.com$/i;
const OPERADOR_ID_REGEX = /^[A-Z0-9]{3,12}$/;
const PASSWORD_SEGURA_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 5;
const TURNOS_USUARIO = ["", "39", "44", "ADMINISTRATIVO", "OTROS"];

const normalizarOperadorId = (value = "") => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizarTurno = (value = "") => {
  const turno = String(value || "").trim();
  return TURNOS_USUARIO.includes(turno) ? turno : "";
};

const generarOperadorId = async (nombre = "OP", rol = "OPERADOR") => {
  const parts = String(nombre || "OP")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const iniciales = (parts.slice(0, 2).map((part) => part.charAt(0)).join("") || "OP").padEnd(2, "X").slice(0, 3);
  const prefix = ["SUPERVISION", "SUPERVISOR", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"].includes(rol)
    ? "SUP"
    : iniciales;

  for (let i = 1; i <= 999; i++) {
    const candidate = `${prefix}${String(i).padStart(2, "0")}`.slice(0, 12);
    const exists = await User.exists({ operadorId: candidate });
    if (!exists) return candidate;
  }

  return `${prefix}${Date.now().toString().slice(-4)}`.slice(0, 12);
};

const normalizarPreferenciasAlertas = (preferencias = {}) => ({
  whatsapp: preferencias.whatsapp !== false,
  correoCorporativo: preferencias.correoCorporativo !== false,
  correoRespaldo: preferencias.correoRespaldo !== false,
  soloCriticas: preferencias.soloCriticas === true
});

const toBoolean = (value) =>
  value === true || String(value || "").trim().toUpperCase() === "SI" || String(value || "").trim().toLowerCase() === "true";

const normalizarFecha = (value) => {
  if (!value) return null;
  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const buildContactosAlerta = ({ email = "", correoCorporativo = "", correoRespaldo = "", telefono = "" }) => {
  const corporativo = String(correoCorporativo || email || "").trim().toLowerCase();
  const respaldo = String(correoRespaldo || "").trim().toLowerCase();
  const principal = corporativo || respaldo || String(email || "").trim().toLowerCase();

  return {
    email: principal,
    username: principal,
    correoCorporativo: corporativo,
    correoRespaldo: respaldo,
    telefono: String(telefono || "").trim()
  };
};

const validarContactosAlerta = ({ email, correoCorporativo, correoRespaldo, telefono }, { telefonoObligatorio = false } = {}) => {
  const errores = [];
  if (!email) errores.push("Debes ingresar correo corporativo o Gmail respaldo");
  if (correoCorporativo && !EMAIL_REGEX.test(correoCorporativo)) errores.push("Correo corporativo invalido");
  if (correoRespaldo && !GMAIL_REGEX.test(correoRespaldo)) errores.push("Correo Gmail respaldo invalido");
  if (telefonoObligatorio && !telefono) errores.push("Telefono WhatsApp obligatorio");
  if (telefono && !TELEFONO_CL_REGEX.test(telefono)) errores.push("Telefono invalido. Usa formato +569XXXXXXXX");
  return errores;
};

const modulosPorRol = (rol) => {
  if (rol === "ADMIN") {
    return ["BITACORA_CALDERA", "CHECKLIST_CAMIONETA", "PLANTA_PC1"];
  }

  if (rol === "OPERADOR_PLANTA") {
    return ["CHECKLIST_CAMIONETA", "PLANTA_PC1"];
  }

  if (["OPERADOR", "OPERADOR_LIDER"].includes(rol)) {
    return ["CHECKLIST_CAMIONETA", "PLANTA_PC1"];
  }

  if (rol === "OPERADOR_CALDERA") {
    return ["BITACORA_CALDERA"];
  }

  if (["SUPERVISOR", "SUPERVISION", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"].includes(rol)) {
    return ["CHECKLIST_CAMIONETA", "REPORTES_BITACORA", "REPORTES_EJECUTIVOS"];
  }

  return [];
};

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  operadorId: user.operadorId || "",
  nombre: user.nombre,
  email: user.email,
  correoCorporativo: user.correoCorporativo || user.email || "",
  correoRespaldo: user.correoRespaldo || "",
  telefono: user.telefono,
  preferenciasAlertas: normalizarPreferenciasAlertas(user.preferenciasAlertas),
  rol: user.rol,
  estado: user.estado,
  planta: user.planta,
  area: user.area || user.planta || "PC1",
  turno: normalizarTurno(user.turno),
  cargo: user.cargo || "",
  licenciaClaseB: user.licenciaClaseB === true,
  fechaVencimientoLicenciaB: user.fechaVencimientoLicenciaB || null,
  licenciaInterna: user.licenciaInterna === true,
  fechaVencimientoLicenciaInterna: user.fechaVencimientoLicenciaInterna || null,
  modulosPermitidos: user.modulosPermitidos || [],
  failedLoginAttempts: Number(user.failedLoginAttempts || 0),
  lockUntil: user.lockUntil || null,
  lastFailedLogin: user.lastFailedLogin || null,
  debeCambiarPassword: user.debeCambiarPassword === true,
  requiereCambioPassword: user.debeCambiarPassword === true,
  activo: user.activo,
  fechaCreacion: user.fechaCreacion || user.createdAt
});

const snapshotUsuario = (user = {}) => ({
  nombre: user?.nombre || "",
  email: user?.email || user?.username || "",
  operadorId: user?.operadorId || "",
  rol: user?.rol || "",
  estado: user?.estado || "",
  planta: user?.planta || "",
  turno: user?.turno || ""
});

const snapshotActor = (req) => ({
  nombre: req.user?.nombre || "",
  email: req.user?.email || req.user?.correoCorporativo || "",
  operadorId: req.user?.operadorId || "",
  rol: req.user?.rol || ""
});

const cambiosEntre = (antes = {}, despues = {}, campos = []) => {
  const cambios = {};
  for (const campo of campos) {
    const anterior = antes?.[campo];
    const nuevo = despues?.[campo];
    if (JSON.stringify(anterior ?? "") !== JSON.stringify(nuevo ?? "")) {
      cambios[campo] = { anterior: anterior ?? "", nuevo: nuevo ?? "" };
    }
  }
  return cambios;
};

const registrarHistorialUsuario = async (req, { usuario, accion, cambios = {}, comentario = "" }) => {
  try {
    if (!usuario?._id) return;
    await HistorialUsuario.create({
      usuario: usuario._id,
      usuarioSnapshot: snapshotUsuario(usuario),
      actor: req.user?.uid || null,
      actorSnapshot: snapshotActor(req),
      accion,
      cambios,
      comentario,
      fecha: new Date()
    });
  } catch (error) {
    console.error("ERROR registrando historial de usuario:", error);
  }
};

const comentarioAdmin = (req, fallback = "") => {
  const motivo = String(req.body?.motivo || req.body?.comentario || "").trim();
  return motivo || fallback;
};

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en .env");

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    {
      uid: user._id.toString(),
      rol: user.rol,
      nombre: user.nombre,
      username: user.username,
      operadorId: user.operadorId || "",
      email: user.email,
      correoCorporativo: user.correoCorporativo || user.email || "",
      correoRespaldo: user.correoRespaldo || "",
      preferenciasAlertas: normalizarPreferenciasAlertas(user.preferenciasAlertas),
      estado: user.estado,
      planta: user.planta,
      area: user.area || user.planta || "PC1",
      turno: normalizarTurno(user.turno),
      cargo: user.cargo || "",
      licenciaClaseB: user.licenciaClaseB === true,
      fechaVencimientoLicenciaB: user.fechaVencimientoLicenciaB || null,
      licenciaInterna: user.licenciaInterna === true,
      fechaVencimientoLicenciaInterna: user.fechaVencimientoLicenciaInterna || null,
      debeCambiarPassword: user.debeCambiarPassword === true,
      modulosPermitidos: user.modulosPermitidos || []
    },
    secret,
    { expiresIn }
  );
};

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const {
      nombre,
      email,
      correoCorporativo = "",
      correoRespaldo = "",
      telefono = "",
      operadorId = "",
      turno = "",
      area = "PC1",
      cargo = "",
      licenciaClaseB = false,
      fechaVencimientoLicenciaB = null,
      licenciaInterna = false,
      fechaVencimientoLicenciaInterna = null,
      password,
      confirmPassword,
      rol,
      preferenciasAlertas = {}
    } = req.body || {};

    if (!nombre || !password || !confirmPassword || !rol) {
      return res.status(400).json({
        message: "nombre, password, confirmPassword y rol son obligatorios"
      });
    }

    if (String(password) !== String(confirmPassword)) {
      return res.status(400).json({ message: "Las contraseñas no coinciden" });
    }

    const rolUp = normalizarRol(rol);
    if (!REGISTER_ROLES.includes(rolUp)) {
      return res.status(400).json({ message: "Rol solicitado inválido" });
    }

    const contactos = buildContactosAlerta({ email, correoCorporativo, correoRespaldo, telefono });
    const erroresContactos = validarContactosAlerta(contactos, { telefonoObligatorio: true });
    if (erroresContactos.length) {
      return res.status(400).json({ message: erroresContactos.join(". ") });
    }

    let operadorIdFinal = normalizarOperadorId(operadorId);
    if (operadorIdFinal && !OPERADOR_ID_REGEX.test(operadorIdFinal)) {
      return res.status(400).json({ message: "ID operador invalido. Usa formato corto, ejemplo JR023" });
    }
    if (!operadorIdFinal) operadorIdFinal = await generarOperadorId(nombre, rolUp);

    const exists = await User.findOne({
      $or: [
        { email: contactos.email },
        { username: contactos.username },
        { operadorId: operadorIdFinal }
      ]
    });
    if (exists) return res.status(409).json({ message: "El correo ya está registrado" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const nuevo = await User.create({
      username: contactos.username,
      operadorId: operadorIdFinal,
      nombre: String(nombre).trim(),
      email: contactos.email,
      correoCorporativo: contactos.correoCorporativo,
      correoRespaldo: contactos.correoRespaldo,
      telefono: contactos.telefono,
      preferenciasAlertas: normalizarPreferenciasAlertas(preferenciasAlertas),
      rol: rolUp,
      estado: "PENDIENTE",
      planta: String(area || "PC1").trim().toUpperCase() || "PC1",
      area: String(area || "PC1").trim().toUpperCase() || "PC1",
      turno: normalizarTurno(turno),
      cargo: String(cargo || "").trim(),
      licenciaClaseB: toBoolean(licenciaClaseB),
      fechaVencimientoLicenciaB: normalizarFecha(fechaVencimientoLicenciaB),
      licenciaInterna: toBoolean(licenciaInterna),
      fechaVencimientoLicenciaInterna: normalizarFecha(fechaVencimientoLicenciaInterna),
      modulosPermitidos: modulosPorRol(rolUp),
      passwordHash,
      activo: false,
      fechaCreacion: new Date()
    });

    return res.status(201).json({
      message: "Registro recibido. Tu usuario queda pendiente de aprobación.",
      user: publicUser(nuevo)
    });
  } catch (e) {
    return res.status(500).json({ message: "Error registrando usuario" });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const identificador = String(username || email || "").trim().toLowerCase();
    const operadorLookup = normalizarOperadorId(username || email || "");

    if (!identificador || !password) {
      return res.status(400).json({ message: "usuario/correo y password son obligatorios" });
    }

    const user = await User.findOne({
      $or: [
        { username: identificador },
        { email: identificador },
        { correoCorporativo: identificador },
        { correoRespaldo: identificador },
        { operadorId: operadorLookup }
      ]
    });

    if (!user) {
      await registrarLoginFallido(req, identificador, "Credenciales incorrectas");
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const ahora = new Date();
    if (user.lockUntil && new Date(user.lockUntil).getTime() > ahora.getTime()) {
      await registrarLoginBloqueado(
        req,
        user,
        "Usuario bloqueado temporalmente por exceso de intentos fallidos"
      );
      return res.status(423).json({
        message: "Cuenta bloqueada temporalmente. Intente nuevamente en unos minutos.",
        lockUntil: user.lockUntil
      });
    }

    if (user.lockUntil && new Date(user.lockUntil).getTime() <= ahora.getTime()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
      await registrarDesbloqueoAutomatico(req, user);
    }

    const estado = String(user.estado || (user.activo ? "ACTIVO" : "BLOQUEADO")).toUpperCase();
    if (!user.activo || estado !== "ACTIVO") {
      const message = estado === "PENDIENTE"
        ? "Tu cuenta está pendiente de aprobación por un administrador."
        : "Usuario bloqueado o inactivo";
      return res.status(403).json({ message });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
      user.lastFailedLogin = new Date();
      await registrarLoginFallido(req, identificador, "Credenciales incorrectas");

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
        await user.save();
        await registrarLoginBloqueado(
          req,
          user,
          "Usuario bloqueado temporalmente por exceso de intentos fallidos"
        );
        return res.status(423).json({
          message: "Cuenta bloqueada temporalmente. Intente nuevamente en unos minutos.",
          lockUntil: user.lockUntil
        });
      }

      await user.save();
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    if (!user.modulosPermitidos?.length) {
      user.modulosPermitidos = modulosPorRol(user.rol);
    }

    await user.save();

    const token = signToken(user);
    await registrarLoginExitoso(req, user);

    return res.json({
      token,
      requiereCambioPassword: user.debeCambiarPassword === true,
      user: publicUser(user)
    });
  } catch (e) {
    return res.status(500).json({ message: "Error en login" });
  }
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    await registrarLogout(req);
    return res.json({ ok: true, message: "Logout registrado" });
  } catch (e) {
    return res.status(500).json({ message: "Error registrando logout" });
  }
};

// GET /api/auth/me
export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user?.uid)
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ user: publicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: "Error obteniendo perfil" });
  }
};

// PATCH /api/auth/me
export const actualizarMiPerfil = async (req, res) => {
  try {
    const id = req.user?.uid;
    if (!id) return res.status(401).json({ message: "Token invalido" });

    const actual = await User.findById(id);
    if (!actual) return res.status(404).json({ message: "Usuario no encontrado" });

    const contactos = buildContactosAlerta({
      email: req.body?.email ?? actual.email,
      correoCorporativo: req.body?.correoCorporativo ?? actual.correoCorporativo,
      correoRespaldo: req.body?.correoRespaldo ?? actual.correoRespaldo,
      telefono: req.body?.telefono ?? actual.telefono
    });

    const erroresContactos = validarContactosAlerta(contactos);
    if (erroresContactos.length) {
      return res.status(400).json({ message: erroresContactos.join(". ") });
    }

    const update = {
      email: contactos.email,
      username: contactos.username,
      correoCorporativo: contactos.correoCorporativo,
      correoRespaldo: contactos.correoRespaldo,
      telefono: contactos.telefono
    };

    if (req.body?.preferenciasAlertas !== undefined) {
      update.preferenciasAlertas = normalizarPreferenciasAlertas(req.body.preferenciasAlertas);
    }
    if (req.body?.licenciaClaseB !== undefined) update.licenciaClaseB = toBoolean(req.body.licenciaClaseB);
    if (req.body?.fechaVencimientoLicenciaB !== undefined) update.fechaVencimientoLicenciaB = normalizarFecha(req.body.fechaVencimientoLicenciaB);
    if (req.body?.licenciaInterna !== undefined) update.licenciaInterna = toBoolean(req.body.licenciaInterna);
    if (req.body?.fechaVencimientoLicenciaInterna !== undefined) update.fechaVencimientoLicenciaInterna = normalizarFecha(req.body.fechaVencimientoLicenciaInterna);

    const duplicado = await User.findOne({
      _id: { $ne: id },
      $or: [
        { email: contactos.email },
        { username: contactos.username }
      ]
    });
    if (duplicado) return res.status(409).json({ message: "El correo ya esta registrado por otro usuario" });

    const user = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");

    return res.json({ message: "Perfil actualizado", user: publicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando perfil" });
  }
};

// POST /api/auth/me/password
export const cambiarMiPassword = async (req, res) => {
  try {
    const id = req.user?.uid;
    const { passwordActual, newPassword, confirmPassword } = req.body || {};

    if (!id) return res.status(401).json({ message: "Token invalido" });
    if (!newPassword) {
      return res.status(400).json({ message: "Nueva contrasena obligatoria" });
    }
    if (confirmPassword !== undefined && String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({ message: "Las contrasenas no coinciden" });
    }
    if (!PASSWORD_SEGURA_REGEX.test(String(newPassword))) {
      return res.status(400).json({ message: "La contrasena debe tener minimo 8 caracteres, 1 mayuscula y 1 numero" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (user.debeCambiarPassword !== true) {
      if (!passwordActual) {
        return res.status(400).json({ message: "passwordActual es obligatorio" });
      }
      const ok = await bcrypt.compare(String(passwordActual), user.passwordHash);
      if (!ok) return res.status(400).json({ message: "Password actual incorrecto" });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.debeCambiarPassword = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await registrarCambioPassword(req, user);

    return res.json({ ok: true, message: "Password cambiado", user: publicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: "Error cambiando password" });
  }
};

// POST /api/auth/users
export const crearUsuario = async (req, res) => {
  try {
    const {
      username,
      nombre,
      email,
      correoCorporativo = "",
      correoRespaldo = "",
      telefono = "",
      rol,
      password,
      operadorId = "",
      estado = "ACTIVO",
      planta = "PC1",
      turno = "",
      area = planta,
      cargo = "",
      licenciaClaseB = false,
      fechaVencimientoLicenciaB = null,
      licenciaInterna = false,
      fechaVencimientoLicenciaInterna = null,
      preferenciasAlertas = {}
    } = req.body || {};
    const contactos = buildContactosAlerta({ email: email || username, correoCorporativo, correoRespaldo, telefono });
    const identificador = contactos.email;

    if (!identificador || !nombre || !rol || !password) {
      return res.status(400).json({ message: "email/username, nombre, rol y password son obligatorios" });
    }

    const erroresContactos = validarContactosAlerta(contactos);
    if (erroresContactos.length) {
      return res.status(400).json({ message: erroresContactos.join(". ") });
    }

    const rolUp = normalizarRol(rol);
    if (!ROLES.includes(rolUp)) {
      return res.status(400).json({ message: "rol inválido" });
    }

    let operadorIdFinal = normalizarOperadorId(operadorId);
    if (operadorIdFinal && !OPERADOR_ID_REGEX.test(operadorIdFinal)) {
      return res.status(400).json({ message: "ID operador invalido. Usa formato corto, ejemplo JR023" });
    }
    if (!operadorIdFinal) operadorIdFinal = await generarOperadorId(nombre, rolUp);

    const exists = await User.findOne({
      $or: [
        { username: identificador },
        { email: identificador },
        { operadorId: operadorIdFinal }
      ]
    });
    if (exists) return res.status(409).json({ message: "usuario ya existe" });

    const estadoUp = String(estado || "ACTIVO").toUpperCase();
    if (!ESTADOS.includes(estadoUp)) {
      return res.status(400).json({ message: "estado inválido" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const nuevo = await User.create({
      username: contactos.username,
      operadorId: operadorIdFinal,
      nombre: String(nombre).trim(),
      email: contactos.email,
      correoCorporativo: contactos.correoCorporativo,
      correoRespaldo: contactos.correoRespaldo,
      telefono: contactos.telefono,
      preferenciasAlertas: normalizarPreferenciasAlertas(preferenciasAlertas),
      rol: rolUp,
      estado: estadoUp,
      planta: String(area || planta || "PC1").trim().toUpperCase() || "PC1",
      area: String(area || planta || "PC1").trim().toUpperCase() || "PC1",
      turno: normalizarTurno(turno),
      cargo: String(cargo || "").trim(),
      licenciaClaseB: toBoolean(licenciaClaseB),
      fechaVencimientoLicenciaB: normalizarFecha(fechaVencimientoLicenciaB),
      licenciaInterna: toBoolean(licenciaInterna),
      fechaVencimientoLicenciaInterna: normalizarFecha(fechaVencimientoLicenciaInterna),
      modulosPermitidos: modulosPorRol(rolUp),
      passwordHash,
      activo: estadoUp === "ACTIVO",
      fechaCreacion: new Date()
    });

    await registrarHistorialUsuario(req, {
      usuario: nuevo,
      accion: "USUARIO_CREADO",
      cambios: {
        estado: { anterior: "", nuevo: nuevo.estado },
        rol: { anterior: "", nuevo: nuevo.rol },
        planta: { anterior: "", nuevo: nuevo.planta }
      },
      comentario: "Usuario creado desde panel administrador"
    });

    return res.status(201).json({
      message: "Usuario creado",
      user: publicUser(nuevo)
    });
  } catch (e) {
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// GET /api/auth/users
export const listarUsuarios = async (req, res) => {
  try {
    const { q = "", rol = "", estado = "" } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { username: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { correoCorporativo: { $regex: String(q), $options: "i" } },
        { correoRespaldo: { $regex: String(q), $options: "i" } },
        { operadorId: { $regex: String(q), $options: "i" } },
        { nombre: { $regex: String(q), $options: "i" } },
        { telefono: { $regex: String(q), $options: "i" } }
      ];
    }

    if (rol) filter.rol = normalizarRol(rol);
    if (estado) {
      const estadoUp = String(estado).toUpperCase();
      if (!ESTADOS.includes(estadoUp)) {
        return res.status(400).json({ message: "estado inválido" });
      }
      filter.estado = estadoUp;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");
    return res.json(users);
  } catch (e) {
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// GET /api/auth/users/:id/historial
export const listarHistorialUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query?.limit || 30), 100);

    const historial = await HistorialUsuario.find({ usuario: id })
      .sort({ fecha: -1 })
      .limit(limit)
      .lean();

    return res.json({ historial });
  } catch (e) {
    return res.status(500).json({ message: "Error listando historial de usuario" });
  }
};

// GET /api/auth/login-audit
export const listarLoginAudit = async (req, res) => {
  try {
    const registros = await LoginAudit.find({})
      .sort({ fecha: -1 })
      .limit(500)
      .lean();

    return res.json({ registros });
  } catch (e) {
    return res.status(500).json({ message: "Error listando auditoria de accesos" });
  }
};

const buscarUsuarioPorIdentificador = async (identificador = "") => {
  const value = String(identificador || "").trim();
  const email = value.toLowerCase();
  const operadorLookup = normalizarOperadorId(value);
  return User.findOne({
    $or: [
      { username: email },
      { email },
      { correoCorporativo: email },
      { correoRespaldo: email },
      { operadorId: operadorLookup }
    ]
  });
};

const generarPasswordTemporal = () => {
  const numero = crypto.randomInt(100, 999);
  const letras = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `Nova${new Date().getFullYear()}!${numero}${letras.slice(0, 2)}`;
};

const enviarPasswordTemporal = async (user, passwordTemporal) => {
  const preferencias = normalizarPreferenciasAlertas(user.preferenciasAlertas);
  const resultados = [];
  const correos = new Set();

  if (preferencias.correoCorporativo && (user.correoCorporativo || user.email)) {
    correos.add(String(user.correoCorporativo || user.email).trim().toLowerCase());
  }
  if (preferencias.correoRespaldo && user.correoRespaldo) {
    correos.add(String(user.correoRespaldo).trim().toLowerCase());
  }

  for (const correo of correos) {
    if (!EMAIL_REGEX.test(correo)) {
      resultados.push({ canal: "correo", destino: correo, estado: "omitido", motivo: "Correo invalido" });
      continue;
    }

    resultados.push(await sendEmailAlert({
      to: correo,
      subject: "Contrasena temporal - Superintendencia Operaciones Litio",
      html: buildPasswordTemporalEmailHtml({ user, passwordTemporal }),
      text: [
        `Hola ${user.nombre || "usuario"}`,
        "Administracion aprobo tu solicitud de recuperacion.",
        `Contrasena temporal: ${passwordTemporal}`,
        "Al iniciar sesion deberas crear una nueva contrasena personal.",
        "AURA PRIME | OPERACIONES LITIO"
      ].join("\n")
    }));
  }

  if (preferencias.whatsapp && user.telefono) {
    const telefono = String(user.telefono || "").trim();
    if (TELEFONO_CL_REGEX.test(telefono)) {
      resultados.push(await sendWhatsAppAlert({
        to: telefono,
        body: [
          "?? RECUPERACION DE CONTRASENA",
          "",
          `Hola ${user.nombre || "usuario"}, administracion aprobo tu solicitud.`,
          `Contrasena temporal: ${passwordTemporal}`,
          "",
          "Al iniciar sesion deberas crear una nueva contrasena personal.",
          "NOVANDINO | GESTION OPERACIONAL"
        ].join("\n")
      }));
    } else {
      resultados.push({ canal: "whatsapp", destino: telefono, estado: "omitido", motivo: "Telefono invalido" });
    }
  }

  return resultados;
};

// POST /api/auth/password-reset/request
export const solicitarPasswordReset = async (req, res) => {
  try {
    const identificador = String(req.body?.identificador || req.body?.username || req.body?.email || "").trim();
    if (!identificador) {
      return res.status(400).json({ message: "Ingresa correo o ID operador" });
    }

    const user = await buscarUsuarioPorIdentificador(identificador);
    if (!user) {
      await registrarSolicitudResetPassword(req, null, identificador);
      return res.status(404).json({ message: "No se encontro usuario asociado" });
    }

    const existente = await PasswordResetRequest.findOne({
      usuarioId: user._id,
      estado: "PENDIENTE"
    });

    if (existente) {
      return res.json({
        ok: true,
        message: "Ya existe una solicitud pendiente para este usuario",
        solicitud: existente
      });
    }

    const solicitud = await PasswordResetRequest.create({
      usuarioId: user._id,
      nombreUsuario: user.nombre || "",
      username: user.username || user.operadorId || "",
      email: user.email || user.correoCorporativo || "",
      operadorId: user.operadorId || "",
      rol: user.rol || "",
      planta: user.planta || "",
      estado: "PENDIENTE",
      solicitadoEn: new Date(),
      observacion: "Solicitud creada desde login"
    });

    await registrarSolicitudResetPassword(req, user, identificador);

    return res.status(201).json({
      ok: true,
      message: "Solicitud enviada. Un administrador debe aprobar el restablecimiento.",
      solicitud
    });
  } catch (e) {
    console.error("Error solicitando reset password:", e);
    return res.status(500).json({ message: "Error creando solicitud de recuperacion" });
  }
};

// GET /api/auth/password-reset/requests
export const listarPasswordResetRequests = async (req, res) => {
  try {
    const solicitudes = await PasswordResetRequest.find({})
      .sort({ solicitadoEn: -1, createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ solicitudes });
  } catch (e) {
    return res.status(500).json({ message: "Error listando solicitudes de recuperacion" });
  }
};

// PATCH /api/auth/password-reset/:id/aprobar
export const aprobarPasswordResetRequest = async (req, res) => {
  try {
    const solicitud = await PasswordResetRequest.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });
    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).json({ message: "La solicitud ya fue resuelta" });
    }

    const user = await User.findById(solicitud.usuarioId);
    if (!user) return res.status(404).json({ message: "Usuario asociado no encontrado" });

    const passwordTemporal = generarPasswordTemporal();
    user.passwordHash = await bcrypt.hash(passwordTemporal, 10);
    user.debeCambiarPassword = true;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    solicitud.estado = "APROBADO";
    solicitud.resueltoEn = new Date();
    solicitud.resueltoPor = req.user?.uid || null;
    solicitud.resueltoPorNombre = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
    solicitud.observacion = comentarioAdmin(req, "Reset aprobado por administrador");
    await solicitud.save();

    const notificaciones = await enviarPasswordTemporal(user, passwordTemporal);

    await registrarSolicitudRecuperacionAprobada(req, user);
    await registrarPasswordTemporalGenerada(req, user);
    await registrarResetPasswordAprobado(req, user);
    await registrarResetPassword(req, user);

    return res.json({
      ok: true,
      message: "Contraseña temporal enviada correctamente.",
      notificaciones,
      solicitud
    });
  } catch (e) {
    console.error("Error aprobando reset password:", e);
    return res.status(500).json({ message: "Error aprobando solicitud" });
  }
};

// PATCH /api/auth/password-reset/:id/rechazar
export const rechazarPasswordResetRequest = async (req, res) => {
  try {
    const solicitud = await PasswordResetRequest.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });
    if (solicitud.estado !== "PENDIENTE") {
      return res.status(400).json({ message: "La solicitud ya fue resuelta" });
    }

    const user = solicitud.usuarioId ? await User.findById(solicitud.usuarioId) : null;
    const observacion = comentarioAdmin(req, "Reset rechazado por administrador");

    solicitud.estado = "RECHAZADO";
    solicitud.resueltoEn = new Date();
    solicitud.resueltoPor = req.user?.uid || null;
    solicitud.resueltoPorNombre = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
    solicitud.observacion = observacion;
    await solicitud.save();

    await registrarResetPasswordRechazado(req, user || solicitud, observacion);

    return res.json({ ok: true, message: "Solicitud rechazada", solicitud });
  } catch (e) {
    console.error("Error rechazando reset password:", e);
    return res.status(500).json({ message: "Error rechazando solicitud" });
  }
};

// PATCH /api/auth/users/:id
export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const antes = await User.findById(id).lean();
    if (!antes) return res.status(404).json({ message: "Usuario no encontrado" });

    const update = {};
    if (req.body.nombre !== undefined) update.nombre = String(req.body.nombre).trim();
    if (req.body.operadorId !== undefined) {
      const operadorId = normalizarOperadorId(req.body.operadorId);
      if (!OPERADOR_ID_REGEX.test(operadorId)) {
        return res.status(400).json({ message: "ID operador invalido. Usa formato corto, ejemplo JR023" });
      }
      update.operadorId = operadorId;
    }
    if (req.body.telefono !== undefined) update.telefono = String(req.body.telefono).trim();
    if (req.body.correoCorporativo !== undefined) {
      update.correoCorporativo = String(req.body.correoCorporativo || "").trim().toLowerCase();
    }
    if (req.body.correoRespaldo !== undefined) {
      update.correoRespaldo = String(req.body.correoRespaldo || "").trim().toLowerCase();
    }
    if (req.body.preferenciasAlertas !== undefined) {
      update.preferenciasAlertas = normalizarPreferenciasAlertas(req.body.preferenciasAlertas);
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      update.email = email;
      update.username = email;
    }
    if (update.email) {
      const duplicado = await User.findOne({
        _id: { $ne: id },
        $or: [
          { email: update.email },
          { username: update.email }
        ]
      });
      if (duplicado) return res.status(409).json({ message: "El correo ya esta registrado por otro usuario" });
    }
    if (update.operadorId) {
      const duplicadoOperador = await User.findOne({ _id: { $ne: id }, operadorId: update.operadorId });
      if (duplicadoOperador) return res.status(409).json({ message: "El ID operador ya esta registrado por otro usuario" });
    }
    const contactosActualizados = buildContactosAlerta({
      email: update.email,
      correoCorporativo: update.correoCorporativo,
      correoRespaldo: update.correoRespaldo,
      telefono: update.telefono
    });
    const erroresContactos = validarContactosAlerta(contactosActualizados);
    if (erroresContactos.some((error) => !error.startsWith("Debes ingresar"))) {
      return res.status(400).json({ message: erroresContactos.join(". ") });
    }
    if (req.body.planta !== undefined) {
      update.planta = String(req.body.planta || "PC1").trim() || "PC1";
    }
    if (req.body.area !== undefined) {
      update.area = String(req.body.area || req.body.planta || antes.area || antes.planta || "PC1").trim().toUpperCase();
      update.planta = update.area;
    }
    if (req.body.cargo !== undefined) update.cargo = String(req.body.cargo || "").trim();
    if (req.body.licenciaClaseB !== undefined) update.licenciaClaseB = toBoolean(req.body.licenciaClaseB);
    if (req.body.fechaVencimientoLicenciaB !== undefined) update.fechaVencimientoLicenciaB = normalizarFecha(req.body.fechaVencimientoLicenciaB);
    if (req.body.licenciaInterna !== undefined) update.licenciaInterna = toBoolean(req.body.licenciaInterna);
    if (req.body.fechaVencimientoLicenciaInterna !== undefined) update.fechaVencimientoLicenciaInterna = normalizarFecha(req.body.fechaVencimientoLicenciaInterna);
    if (req.body.turno !== undefined) {
      update.turno = normalizarTurno(req.body.turno);
    }
    if (req.body.activo !== undefined) {
      update.activo = !!req.body.activo;
      update.estado = update.activo ? "ACTIVO" : "BLOQUEADO";
    }
    if (req.body.estado !== undefined) {
      const estadoUp = String(req.body.estado).toUpperCase();
      if (!ESTADOS.includes(estadoUp)) {
        return res.status(400).json({ message: "estado inválido" });
      }
      if (String(req.user?.uid || "") === String(id) && estadoUp !== "ACTIVO") {
        return res.status(400).json({ message: "No puedes bloquear o dejar pendiente tu propia cuenta ADMIN" });
      }
      update.estado = estadoUp;
      update.activo = estadoUp === "ACTIVO";
    }

    if (req.body.rol !== undefined) {
      const rolUp = normalizarRol(req.body.rol);
      if (!ROLES.includes(rolUp)) {
        return res.status(400).json({ message: "rol inválido" });
      }
      update.rol = rolUp;
      update.modulosPermitidos = modulosPorRol(rolUp);
    }

    const u = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    const cambios = cambiosEntre(antes, u.toObject(), [
      "nombre",
      "operadorId",
      "email",
      "correoCorporativo",
      "correoRespaldo",
      "telefono",
      "planta",
      "area",
      "turno",
      "cargo",
      "licenciaClaseB",
      "fechaVencimientoLicenciaB",
      "licenciaInterna",
      "fechaVencimientoLicenciaInterna",
      "rol",
      "estado",
      "activo",
      "modulosPermitidos",
      "preferenciasAlertas"
    ]);

    await registrarHistorialUsuario(req, {
      usuario: u,
      accion: "USUARIO_ACTUALIZADO",
      cambios,
      comentario: comentarioAdmin(req, "Usuario actualizado desde panel administrador")
    });

    return res.json({ message: "Usuario actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando usuario" });
  }
};

// PATCH /api/auth/users/:id/estado
export const actualizarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const estadoUp = String(req.body?.estado || "").toUpperCase();
    const antes = await User.findById(id).lean();
    if (!antes) return res.status(404).json({ message: "Usuario no encontrado" });

    if (!ESTADOS.includes(estadoUp)) {
      return res.status(400).json({ message: "estado inválido" });
    }

    if (String(req.user?.uid || "") === String(id) && estadoUp !== "ACTIVO") {
      return res.status(400).json({ message: "No puedes bloquear o dejar pendiente tu propia cuenta ADMIN" });
    }

    const u = await User.findByIdAndUpdate(
      id,
      {
        estado: estadoUp,
        activo: estadoUp === "ACTIVO"
      },
      { new: true }
    ).select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    await registrarHistorialUsuario(req, {
      usuario: u,
      accion: "ESTADO_CAMBIADO",
      cambios: {
        estado: { anterior: antes.estado || "", nuevo: u.estado || "" },
        activo: { anterior: antes.activo ?? "", nuevo: u.activo ?? "" }
      },
      comentario: comentarioAdmin(req, `Estado cambiado a ${estadoUp}`)
    });
    await registrarEvento({
      req,
      modulo: "USUARIOS",
      entidad: "User",
      entidadId: u._id,
      accion: estadoUp === "ACTIVO" ? "USUARIO_APROBADO" : "USUARIO_BLOQUEADO",
      observacion: comentarioAdmin(req, `Estado cambiado a ${estadoUp}`)
    });

    return res.json({ message: "Estado actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando estado" });
  }
};

// PATCH /api/auth/users/:id/rol
export const actualizarRolUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const rolUp = normalizarRol(req.body?.rol);
    const antes = await User.findById(id).lean();
    if (!antes) return res.status(404).json({ message: "Usuario no encontrado" });

    if (!ROLES.includes(rolUp)) {
      return res.status(400).json({ message: "rol inválido" });
    }

    const u = await User.findByIdAndUpdate(
      id,
      {
        rol: rolUp,
        modulosPermitidos: modulosPorRol(rolUp)
      },
      { new: true }
    ).select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo createdAt fechaCreacion");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    await registrarHistorialUsuario(req, {
      usuario: u,
      accion: "ROL_CAMBIADO",
      cambios: {
        rol: { anterior: antes.rol || "", nuevo: u.rol || "" },
        modulosPermitidos: { anterior: antes.modulosPermitidos || [], nuevo: u.modulosPermitidos || [] }
      },
      comentario: comentarioAdmin(req, `Rol cambiado a ${rolUp}`)
    });
    await registrarEvento({
      req,
      modulo: "USUARIOS",
      entidad: "User",
      entidadId: u._id,
      accion: "CAMBIO_ROL",
      observacion: comentarioAdmin(req, `Rol cambiado a ${rolUp}`)
    });
    await registrarEvento({
      req,
      modulo: "USUARIOS",
      entidad: "User",
      entidadId: u._id,
      accion: "CAMBIO_PERMISO",
      observacion: comentarioAdmin(req, `Permisos recalculados por rol ${rolUp}`)
    });

    return res.json({ message: "Rol actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando rol" });
  }
};

// POST /api/auth/users/:id/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};

    if (!newPassword) return res.status(400).json({ message: "newPassword es obligatorio" });

    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    const u = await User.findByIdAndUpdate(
      id,
      {
        passwordHash,
        debeCambiarPassword: true,
        failedLoginAttempts: 0,
        lockUntil: null
      },
      { new: true }
    )
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    await registrarHistorialUsuario(req, {
      usuario: u,
      accion: "PASSWORD_RESETEADA",
      cambios: { password: { anterior: "********", nuevo: "********" } },
      comentario: "Password reseteado desde panel administrador"
    });
    await registrarResetPassword(req, u);
    await registrarEvento({
      req,
      modulo: "USUARIOS",
      entidad: "User",
      entidadId: u._id,
      accion: "USUARIO_RESET_PASSWORD",
      observacion: "Password reseteado desde panel administrador"
    });

    return res.json({ message: "Password actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error reseteando password" });
  }
};

// DELETE /api/auth/users/:id
export const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user?.uid || "") === String(id)) {
      return res.status(400).json({ message: "No puedes eliminar tu propio usuario ADMIN" });
    }

    const deleted = await User.findByIdAndDelete(id)
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta area turno cargo licenciaClaseB fechaVencimientoLicenciaB licenciaInterna fechaVencimientoLicenciaInterna failedLoginAttempts lockUntil lastFailedLogin debeCambiarPassword activo");

    if (!deleted) return res.status(404).json({ message: "Usuario no encontrado" });

    await registrarHistorialUsuario(req, {
      usuario: deleted,
      accion: "USUARIO_ELIMINADO",
      cambios: { eliminado: { anterior: false, nuevo: true } },
      comentario: "Usuario eliminado desde panel administrador"
    });
    await registrarEvento({
      req,
      modulo: "USUARIOS",
      entidad: "User",
      entidadId: deleted._id,
      accion: "USUARIO_ELIMINADO",
      observacion: "Usuario eliminado desde panel administrador"
    });

    return res.json({ message: "Usuario eliminado", user: deleted });
  } catch (e) {
    return res.status(500).json({ message: "Error eliminando usuario" });
  }
};




