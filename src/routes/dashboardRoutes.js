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

const gestoresAlertas = ["ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"];
const lectoresAlertas = [...gestoresAlertas, "OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"];

router.get(
  "/alertas",
  requireRole(...lectoresAlertas),
  authorizeModule("alertas"),
  obtenerDashboardAlertas
);

router.patch(
  "/alertas/:id/resolver",
  requireRole(...gestoresAlertas),
  authorizeModule("alertas"),
  resolverAlertaDashboard
);

router.patch(
  "/alertas/:id/gestionar",
  requireRole(...gestoresAlertas),
  authorizeModule("alertas"),
  gestionarAlertaDashboard
);

router.patch(
  "/alertas/:id/cerrar",
  requireRole(...gestoresAlertas),
  authorizeModule("alertas"),
  cerrarAlertaDashboard
);

export default router;
