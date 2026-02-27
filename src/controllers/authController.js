// src/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en .env");

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    { uid: user._id.toString(), rol: user.rol, nombre: user.nombre, username: user.username },
    secret,
    { expiresIn }
  );
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: "username y password son obligatorios" });
    }

    const user = await User.findOne({ username: String(username).trim() });
    if (!user || !user.activo) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (e) {
    return res.status(500).json({ message: "Error en login" });
  }
};

// GET /api/auth/me
export const me = async (req, res) => {
  return res.json({ user: req.user });
};

// ================================
// ✅ ADMIN: crear usuario
// POST /api/auth/users
export const crearUsuario = async (req, res) => {
  try {
    const { username, nombre, rol, password } = req.body || {};

    if (!username || !nombre || !rol || !password) {
      return res.status(400).json({ message: "username, nombre, rol y password son obligatorios" });
    }

    const rolUp = String(rol).toUpperCase();
    if (!["OPERADOR", "SUPERVISOR", "ADMIN"].includes(rolUp)) {
      return res.status(400).json({ message: "rol inválido" });
    }

    const exists = await User.findOne({ username: String(username).trim() });
    if (exists) return res.status(409).json({ message: "username ya existe" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const nuevo = await User.create({
      username: String(username).trim(),
      nombre: String(nombre).trim(),
      rol: rolUp,
      passwordHash,
      activo: true
    });

    return res.status(201).json({
      message: "Usuario creado",
      user: {
        id: nuevo._id,
        username: nuevo.username,
        nombre: nuevo.nombre,
        rol: nuevo.rol,
        activo: nuevo.activo
      }
    });
  } catch (e) {
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// ✅ ADMIN: listar usuarios
// GET /api/auth/users
export const listarUsuarios = async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select("_id username nombre rol activo createdAt");
    return res.json(users);
  } catch (e) {
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// ✅ ADMIN: activar/desactivar o cambiar rol/nombre
// PATCH /api/auth/users/:id
export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const update = {};
    if (req.body.nombre !== undefined) update.nombre = String(req.body.nombre).trim();
    if (req.body.activo !== undefined) update.activo = !!req.body.activo;

    if (req.body.rol !== undefined) {
      const rolUp = String(req.body.rol).toUpperCase();
      if (!["OPERADOR", "SUPERVISOR", "ADMIN"].includes(rolUp)) {
        return res.status(400).json({ message: "rol inválido" });
      }
      update.rol = rolUp;
    }

    const u = await User.findByIdAndUpdate(id, update, { new: true })
      .select("_id username nombre rol activo createdAt");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Usuario actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error actualizando usuario" });
  }
};

// ✅ ADMIN: reset password
// POST /api/auth/users/:id/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};

    if (!newPassword) return res.status(400).json({ message: "newPassword es obligatorio" });

    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    const u = await User.findByIdAndUpdate(id, { passwordHash }, { new: true })
      .select("_id username nombre rol activo");

    if (!u) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Password actualizado", user: u });
  } catch (e) {
    return res.status(500).json({ message: "Error reseteando password" });
  }
};
