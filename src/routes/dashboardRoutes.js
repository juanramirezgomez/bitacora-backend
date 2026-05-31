import express from "express";
import {
  cerrarAlertaDashboard,
  gestionarAlertaDashboard,
  obtenerDashboardAlertas,
  resolverAlertaDashboard
} from "../controllers/dashboardAlertasController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.get(
  "/alertas",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_PLANTA"),
  authorizeModule("alertas"),
  obtenerDashboardAlertas
);

router.patch(
  "/alertas/:id/resolver",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("alertas"),
  resolverAlertaDashboard
);

router.patch(
  "/alertas/:id/gestionar",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("alertas"),
  gestionarAlertaDashboard
);

router.patch(
  "/alertas/:id/cerrar",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("alertas"),
  cerrarAlertaDashboard
);

export default router;
