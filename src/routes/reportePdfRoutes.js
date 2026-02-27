import express from "express";
import { 
  descargarReportePdf,
  descargarReporteExcel
} from "../controllers/reportePdfController.js";

const router = express.Router();

// PDF
router.get("/:bitacoraId/reporte.pdf", descargarReportePdf);

// 🔥 EXCEL (NUEVO)
router.get("/:bitacoraId/reporte.excel", descargarReporteExcel);

export default router;