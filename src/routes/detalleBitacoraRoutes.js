import express from "express";
import { obtenerDetalleBitacora } from "../controllers/detalleBitacoraController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// GET /api/bitacoras/:bitacoraId/detalle
router.get("/:bitacoraId/detalle", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerDetalleBitacora);

export default router;
