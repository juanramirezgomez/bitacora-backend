import express from "express";
import {
  crearChecklistInicial,
  obtenerChecklistInicial
} from "../controllers/checklistController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// Crear checklist
router.post("/:bitacoraId/checklist-inicial", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("bitacora"), crearChecklistInicial);

// Obtener checklist
router.get("/:bitacoraId/checklist-inicial", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerChecklistInicial);

export default router;
