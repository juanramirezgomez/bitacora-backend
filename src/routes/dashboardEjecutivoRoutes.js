import express from "express";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";
import {
  descargarDashboardEjecutivoExcel,
  descargarDashboardEjecutivoPdf,
  obtenerDashboardEjecutivo
} from "../controllers/dashboardEjecutivoController.js";

const router = express.Router();

const ROLES_DASHBOARD_EJECUTIVO = ["ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"];

router.get(
  "/",
  requireRole(...ROLES_DASHBOARD_EJECUTIVO),
  authorizeModule("dashboard_ejecutivo"),
  obtenerDashboardEjecutivo
);

router.get(
  "/pdf",
  requireRole(...ROLES_DASHBOARD_EJECUTIVO),
  authorizeModule("dashboard_ejecutivo"),
  descargarDashboardEjecutivoPdf
);

router.get(
  "/excel",
  requireRole(...ROLES_DASHBOARD_EJECUTIVO),
  authorizeModule("dashboard_ejecutivo"),
  descargarDashboardEjecutivoExcel
);

export default router;
