import express from "express";
import {
  crearCierreTurno,
  obtenerCierreTurno
} from "../controllers/CierreTurnoController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.post("/:bitacoraId/cierre", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("cierre_turno"), crearCierreTurno);
router.get("/:bitacoraId/cierre", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerCierreTurno);

export default router;
