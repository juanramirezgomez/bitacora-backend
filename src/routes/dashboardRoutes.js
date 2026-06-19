import express from "express";
import {
  cerrarAlertaDashboard,
  tomarGestionAlertaDashboard,
  obtenerDashboardAlertas,
} from "../controllers/dashboardAlertasController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

const gestoresAlertas = ["ADMIN", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"];
const iniciadoresAlertas = ["ADMIN", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"];
const lectoresAlertas = [...gestoresAlertas, "SUPERINTENDENTE", "OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"];

router.get(
  "/alertas",
  requireRole(...lectoresAlertas),
  authorizeModule("alertas"),
  obtenerDashboardAlertas
);

router.patch(
  "/alertas/:id/tomar-gestion",
  requireRole(...iniciadoresAlertas),
  authorizeModule("alertas"),
  tomarGestionAlertaDashboard
);

router.patch(
  "/alertas/:id/cerrar",
  requireRole(...gestoresAlertas),
  authorizeModule("alertas"),
  cerrarAlertaDashboard
);

export default router;
