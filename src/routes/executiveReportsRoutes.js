import express from "express";
import { requireRole } from "../middlewares/authJwt.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";
import {
  descargarReporteEjecutivoPdf,
  obtenerReporteEjecutivo
} from "../controllers/executiveReportsController.js";

const router = express.Router();

router.get(
  "/",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("reportes_ejecutivos"),
  obtenerReporteEjecutivo
);

router.get(
  "/pdf",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("reportes_ejecutivos"),
  descargarReporteEjecutivoPdf
);

export default router;
