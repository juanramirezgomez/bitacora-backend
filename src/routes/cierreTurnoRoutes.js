import express from "express";
import {
  crearCierreTurno,
  obtenerCierreTurno
} from "../controllers/CierreTurnoController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.post("/:bitacoraId/cierre", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), crearCierreTurno);
router.get("/:bitacoraId/cierre", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerCierreTurno);

export default router;
