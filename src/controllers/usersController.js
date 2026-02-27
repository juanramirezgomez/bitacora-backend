// src/controllers/usersController.js
import bcrypt from "bcryptjs";
import User from "../models/user.js";

const sanitizeUser = (u) => ({
  id: u._id,
  username: u.username,
  nombre: u.nombre,
  rol: u.rol,
  activo: u.activo,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt
});

// GET /api/users
export const listUsers = async (req, res) => {
  try {
    const { q = "", rol = "", activo = "" } = req.query;

    const filter = {};

    if (q) {
      filter.$or = [
        { username: { $regex: String(q), $options: "i" } },
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
    const { username, nombre, rol, password } = req.body || {};

    const u = String(username || "").trim().toLowerCase();
    const n = String(nombre || "").trim();
    const r = String(rol || "").trim().toUpperCase();
    const p = String(password || "").trim();

    if (!u || !n || !r || !p) {
      return res.status(400).json({ message: "username, nombre, rol y password son obligatorios" });
    }

    if (!["OPERADOR", "SUPERVISOR"].includes(r)) {
      return res.status(400).json({ message: "rol inválido (solo OPERADOR o SUPERVISOR)" });
    }

    const exists = await User.findOne({ username: u });
    if (exists) return res.status(409).json({ message: "username ya existe" });

    const passwordHash = await bcrypt.hash(p, 10);

    const created = await User.create({
      username: u,
      nombre: n,
      rol: r,
      passwordHash,
      activo: true
    });

    return res.status(201).json(sanitizeUser(created));
  } catch (e) {
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// PUT /api/users/:id  (editar username/nombre/rol)
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, nombre, rol } = req.body || {};

    const update = {};

    if (username !== undefined) {
      const u = String(username || "").trim().toLowerCase();
      if (!u) return res.status(400).json({ message: "username inválido" });

      const exists = await User.findOne({ username: u, _id: { $ne: id } });
      if (exists) return res.status(409).json({ message: "username ya existe" });

      update.username = u;
    }

    if (nombre !== undefined) {
      const n = String(nombre || "").trim();
      if (!n) return res.status(400).json({ message: "nombre inválido" });
      update.nombre = n;
    }

    if (rol !== undefined) {
      const r = String(rol || "").trim().toUpperCase();
      if (!["OPERADOR", "SUPERVISOR"].includes(r)) {
        return res.status(400).json({ message: "rol inválido (solo OPERADOR o SUPERVISOR)" });
      }
      update.rol = r;
    }

    const updated = await User.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json(sanitizeUser(updated));
  } catch (e) {
    return res.status(500).json({ message: "Error editando usuario" });
  }
};

// PATCH /api/users/:id/password  (reset password)
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const p = String(password || "").trim();

    if (!p) return res.status(400).json({ message: "password es obligatorio" });

    const passwordHash = await bcrypt.hash(p, 10);

    const updated = await User.findByIdAndUpdate(id, { passwordHash }, { new: true });
    if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({ message: "Password actualizado", user: sanitizeUser(updated) });
  } catch (e) {
    return res.status(500).json({ message: "Error reseteando password" });
  }
};

// PATCH /api/users/:id/activo  (activar/desactivar)
export const setActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body || {};

    const val = Boolean(activo);

    const updated = await User.findByIdAndUpdate(id, { activo: val }, { new: true });
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

    // evita que el admin se borre a sí mismo
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
