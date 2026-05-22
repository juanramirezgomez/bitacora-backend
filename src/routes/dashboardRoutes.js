import express from "express";
import { obtenerDashboardAlertas } from "../controllers/dashboardAlertasController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.get(
  "/alertas",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_PLANTA"),
  obtenerDashboardAlertas
);

export default router;
