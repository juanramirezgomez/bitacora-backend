import express from "express";
import {
  cerrarAlertaDashboard,
  gestionarAlertaDashboard,
  obtenerDashboardAlertas,
  resolverAlertaDashboard
} from "../controllers/dashboardAlertasController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.get(
  "/alertas",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_PLANTA"),
  obtenerDashboardAlertas
);

router.patch(
  "/alertas/:id/resolver",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  resolverAlertaDashboard
);

router.patch(
  "/alertas/:id/gestionar",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  gestionarAlertaDashboard
);

router.patch(
  "/alertas/:id/cerrar",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  cerrarAlertaDashboard
);

export default router;
