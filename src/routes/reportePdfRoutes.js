import express from "express";
import { 
  descargarReportePdf,
  descargarReporteExcel,
  descargarPdfRango,
  descargarExcelRango
} from "../controllers/reportePdfController.js";

const router = express.Router();

// 🔥 PRIMERO las rutas específicas
router.get("/rango/pdf", descargarPdfRango);
router.get("/rango/excel", descargarExcelRango);

// 🔥 DESPUÉS las dinámicas
router.get("/:bitacoraId/reporte.pdf", descargarReportePdf);
router.get("/:bitacoraId/reporte.excel", descargarReporteExcel);

export default router;