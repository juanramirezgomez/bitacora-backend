import express from "express";
import { 
  descargarReportePdf,
  descargarReporteExcel,
  descargarPdfRango,
  descargarExcelRango
} from "../controllers/reportePdfController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// 🔥 PRIMERO las rutas específicas
router.get("/rango/pdf", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("pdf_caldera"), descargarPdfRango);
router.get("/rango/excel", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("excel_caldera"), descargarExcelRango);

// 🔥 DESPUÉS las dinámicas
router.get("/:bitacoraId/reporte.pdf", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("pdf_caldera"), descargarReportePdf);
router.get("/:bitacoraId/reporte.excel", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("excel_caldera"), descargarReporteExcel);

export default router;
