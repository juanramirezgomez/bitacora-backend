import express from "express";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";
import {
  descargarReporteEjecutivoExcel,
  descargarReporteEjecutivoPdf,
  obtenerReporteEjecutivo
} from "../controllers/executiveReportsController.js";

const router = express.Router();
const reportRoles = ["ADMIN", "SUPERINTENDENTE", "SUPERVISION", "SUPERVISOR", "JEFE_PLANTA", "JEFE_TURNO", "ECM"];

router.get(
  "/",
  requireRole(...reportRoles),
  authorizeModule("reportes_ejecutivos"),
  obtenerReporteEjecutivo
);

router.get(
  "/pdf",
  requireRole(...reportRoles),
  authorizeModule("reportes_ejecutivos"),
  descargarReporteEjecutivoPdf
);

router.get(
  "/excel",
  requireRole(...reportRoles),
  authorizeModule("reportes_ejecutivos"),
  descargarReporteEjecutivoExcel
);

export default router;
