import express from "express";
import { obtenerDetalleBitacora } from "../controllers/detalleBitacoraController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// GET /api/bitacoras/:bitacoraId/detalle
router.get("/:bitacoraId/detalle", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerDetalleBitacora);

export default router;
