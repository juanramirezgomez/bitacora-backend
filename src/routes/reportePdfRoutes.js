import express from "express";
import { 
  descargarReportePdf,
  descargarReporteExcel,
  descargarPdfRango,
  descargarExcelRango
} from "../controllers/reportePdfController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// 🔥 PRIMERO las rutas específicas
router.get("/rango/pdf", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), descargarPdfRango);
router.get("/rango/excel", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), descargarExcelRango);

// 🔥 DESPUÉS las dinámicas
router.get("/:bitacoraId/reporte.pdf", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), descargarReportePdf);
router.get("/:bitacoraId/reporte.excel", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), descargarReporteExcel);

export default router;
