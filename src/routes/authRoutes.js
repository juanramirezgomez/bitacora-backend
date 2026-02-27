// src/routes/authRoutes.js
import express from "express";
import {
  login,
  me,
  crearUsuario,
  listarUsuarios,
  actualizarUsuario,
  resetPassword
} from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authJwt.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Login normal
router.post("/login", login);
router.get("/me", requireAuth, me);

// ✅ Admin users
router.post("/users", requireAuth, requireAdmin, crearUsuario);
router.get("/users", requireAuth, requireAdmin, listarUsuarios);
router.patch("/users/:id", requireAuth, requireAdmin, actualizarUsuario);
router.post("/users/:id/reset-password", requireAuth, requireAdmin, resetPassword);

export default router;
