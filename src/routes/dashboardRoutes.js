import express from "express";
import { obtenerDashboardAlertas, resolverAlertaDashboard } from "../controllers/dashboardAlertasController.js";
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

export default router;
