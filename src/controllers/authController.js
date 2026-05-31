// src/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import HistorialUsuario from "../models/HistorialUsuario.js";
import LoginAudit from "../models/LoginAudit.js";
import {
  registrarCambioPassword,
  registrarDesbloqueoAutomatico,
  registrarLoginBloqueado,
  registrarLoginExitoso,
  registrarLoginFallido,
  registrarLogout,
  registrarResetPassword
} from "../services/loginAuditService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const ROLES = [
  "ADMIN",
  "OPERADOR",
  "SUPERVISOR",
  "OPERADOR_CALDERA",
  "OPERADOR_PLANTA",
  "SUPERVISION"
];

const REGISTER_ROLES = [
  "OPERADOR_CALDERA",
  "OPERADOR_PLANTA",
  "SUPERVISION"
];

const normalizarRol = (rol) => String(rol || "").trim().toUpperCase();
const ESTADOS = ["PENDIENTE", "ACTIVO", "BLOQUEADO", "INACTIVO"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_CL_REGEX = /^\+569\d{8}$/;
const GMAIL_REGEX = /^[^\s@]+@gmail\.com$/i;
const OPERADOR_ID_REGEX = /^[A-Z0-9]{3,12}$/;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 5;

const normalizarOperadorId = (value = "") => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const generarOperadorId = async (nombre = "OP", rol = "OPERADOR") => {
  const parts = String(nombre || "OP")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const iniciales = (parts.slice(0, 2).map((part) => part.charAt(0)).join("") || "OP").padEnd(2, "X").slice(0, 3);
  const prefix = ["SUPERVISION", "SUPERVISOR"].includes(rol) ? "SUP" : iniciales;

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

  if (["OPERADOR", "OPERADOR_CALDERA", "SUPERVISOR", "SUPERVISION"].includes(rol)) {
    return rol === "OPERADOR_CALDERA" || rol === "OPERADOR"
      ? ["BITACORA_CALDERA"]
      : ["BITACORA_CALDERA", "CHECKLIST_CAMIONETA"];
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
  modulosPermitidos: user.modulosPermitidos || [],
  failedLoginAttempts: Number(user.failedLoginAttempts || 0),
  lockUntil: user.lockUntil || null,
  lastFailedLogin: user.lastFailedLogin || null,
  activo: user.activo,
  fechaCreacion: user.fechaCreacion || user.createdAt
});

const snapshotUsuario = (user = {}) => ({
  nombre: user?.nombre || "",
  email: user?.email || user?.username || "",
  operadorId: user?.operadorId || "",
  rol: user?.rol || "",
  estado: user?.estado || "",
  planta: user?.planta || ""
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
      return res.status(400).json({ message: "Las contraseÃ±as no coinciden" });
    }

    const rolUp = normalizarRol(rol);
    if (!REGISTER_ROLES.includes(rolUp)) {
      return res.status(400).json({ message: "Rol solicitado invÃ¡lido" });
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
    if (exists) return res.status(409).json({ message: "El correo ya estÃ¡ registrado" });

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
      planta: "PC1",
      modulosPermitidos: modulosPorRol(rolUp),
      passwordHash,
      activo: false,
      fechaCreacion: new Date()
    });

    return res.status(201).json({
      message: "Registro recibido. Tu usuario queda pendiente de aprobaciÃ³n.",
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
        ? "Tu cuenta estÃ¡ pendiente de aprobaciÃ³n por un administrador."
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
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");

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

    const duplicado = await User.findOne({
      _id: { $ne: id },
      $or: [
        { email: contactos.email },
        { username: contactos.username }
      ]
    });
    if (duplicado) return res.status(409).json({ message: "El correo ya esta registrado por otro usuario" });

    const user = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");

    return res.json({ message: "Perfil actualizado", user: publicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando perfil" });
  }
};

// POST /api/auth/me/password
export const cambiarMiPassword = async (req, res) => {
  try {
    const id = req.user?.uid;
    const { passwordActual, newPassword } = req.body || {};

    if (!id) return res.status(401).json({ message: "Token invalido" });
    if (!passwordActual || !newPassword) {
      return res.status(400).json({ message: "passwordActual y newPassword son obligatorios" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const ok = await bcrypt.compare(String(passwordActual), user.passwordHash);
    if (!ok) return res.status(400).json({ message: "Password actual incorrecto" });

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    await registrarCambioPassword(req, user);

    return res.json({ ok: true, message: "Password cambiado" });
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
      return res.status(400).json({ message: "rol invÃ¡lido" });
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
      return res.status(400).json({ message: "estado invÃ¡lido" });
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
      planta: String(planta || "PC1").trim() || "PC1",
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
        return res.status(400).json({ message: "estado invÃ¡lido" });
      }
      filter.estado = estadoUp;
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");
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
    if (req.body.activo !== undefined) {
      update.activo = !!req.body.activo;
      update.estado = update.activo ? "ACTIVO" : "BLOQUEADO";
    }
    if (req.body.estado !== undefined) {
      const estadoUp = String(req.body.estado).toUpperCase();
      if (!ESTADOS.includes(estadoUp)) {
        return res.status(400).json({ message: "estado invÃ¡lido" });
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
        return res.status(400).json({ message: "rol invÃ¡lido" });
      }
      update.rol = rolUp;
      update.modulosPermitidos = modulosPorRol(rolUp);
    }

    const u = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    const cambios = cambiosEntre(antes, u.toObject(), [
      "nombre",
      "operadorId",
      "email",
      "correoCorporativo",
      "correoRespaldo",
      "telefono",
      "planta",
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
      return res.status(400).json({ message: "estado invÃ¡lido" });
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
    ).select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");

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
      return res.status(400).json({ message: "rol invÃ¡lido" });
    }

    const u = await User.findByIdAndUpdate(
      id,
      {
        rol: rolUp,
        modulosPermitidos: modulosPorRol(rolUp)
      },
      { new: true }
    ).select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta modulosPermitidos failedLoginAttempts lockUntil lastFailedLogin activo createdAt fechaCreacion");

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

    const u = await User.findByIdAndUpdate(id, { passwordHash }, { new: true })
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado failedLoginAttempts lockUntil lastFailedLogin activo");

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
      .select("_id username operadorId nombre email correoCorporativo correoRespaldo telefono preferenciasAlertas rol estado planta failedLoginAttempts lockUntil lastFailedLogin activo");

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

