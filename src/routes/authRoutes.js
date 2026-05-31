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
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// Login normal
router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, actualizarMiPerfil);
router.post("/me/password", requireAuth, cambiarMiPassword);

// ✅ Admin users
router.post("/users", requireAuth, requireAdmin, authorizeModule("usuarios"), crearUsuario);
router.get("/users", requireAuth, requireAdmin, authorizeModule("usuarios"), listarUsuarios);
router.get("/login-audit", requireAuth, requireAdmin, authorizeModule("auditoria_accesos"), listarLoginAudit);
router.get("/users/:id/historial", requireAuth, requireAdmin, authorizeModule("usuarios"), listarHistorialUsuario);
router.patch("/users/:id/estado", requireAuth, requireAdmin, authorizeModule("usuarios"), actualizarEstadoUsuario);
router.patch("/users/:id/rol", requireAuth, requireAdmin, authorizeModule("roles"), actualizarRolUsuario);
router.patch("/users/:id", requireAuth, requireAdmin, authorizeModule("usuarios"), actualizarUsuario);
router.post("/users/:id/reset-password", requireAuth, requireAdmin, authorizeModule("usuarios"), resetPassword);
router.delete("/users/:id", requireAuth, requireAdmin, authorizeModule("usuarios"), eliminarUsuario);

export default router;
