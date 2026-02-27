// src/routes/usersRoutes.js
import express from "express";
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  setActivo,
  deleteUser
} from "../controllers/usersController.js";

import { requireAuth } from "../middlewares/authJwt.js";

const router = express.Router();

// ✅ middleware simple: solo ADMIN
const requireAdmin = (req, res, next) => {
  const rol = String(req.user?.rol || "").toUpperCase();
  if (rol !== "ADMIN") {
    return res.status(403).json({ message: "Solo ADMIN puede gestionar usuarios" });
  }
  next();
};

// ✅ Todo /api/users requiere JWT + ADMIN
router.use(requireAuth, requireAdmin);

// GET /api/users?q=&rol=&activo=
router.get("/", listUsers);

// POST /api/users
router.post("/", createUser);

// PUT /api/users/:id
router.put("/:id", updateUser);

// PATCH /api/users/:id/password
router.patch("/:id/password", resetPassword);

// PATCH /api/users/:id/activo
router.patch("/:id/activo", setActivo);

// DELETE /api/users/:id
router.delete("/:id", deleteUser);

export default router;
