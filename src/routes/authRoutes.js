// src/routes/authRoutes.js
import express from "express";
import {
  register,
  login,
  logout,
  me,
  actualizarMiPerfil,
  cambiarMiPassword,
  crearUsuario,
  listarUsuarios,
  listarLoginAudit,
  actualizarUsuario,
  actualizarEstadoUsuario,
  actualizarRolUsuario,
  listarHistorialUsuario,
  resetPassword,
  eliminarUsuario
} from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authJwt.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Login normal
router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, actualizarMiPerfil);
router.post("/me/password", requireAuth, cambiarMiPassword);

// ✅ Admin users
router.post("/users", requireAuth, requireAdmin, crearUsuario);
router.get("/users", requireAuth, requireAdmin, listarUsuarios);
router.get("/login-audit", requireAuth, requireAdmin, listarLoginAudit);
router.get("/users/:id/historial", requireAuth, requireAdmin, listarHistorialUsuario);
router.patch("/users/:id/estado", requireAuth, requireAdmin, actualizarEstadoUsuario);
router.patch("/users/:id/rol", requireAuth, requireAdmin, actualizarRolUsuario);
router.patch("/users/:id", requireAuth, requireAdmin, actualizarUsuario);
router.post("/users/:id/reset-password", requireAuth, requireAdmin, resetPassword);
router.delete("/users/:id", requireAuth, requireAdmin, eliminarUsuario);

export default router;
