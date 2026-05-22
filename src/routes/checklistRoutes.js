import express from "express";
import {
  crearChecklistInicial,
  obtenerChecklistInicial
} from "../controllers/checklistController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// Crear checklist
router.post("/:bitacoraId/checklist-inicial", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), crearChecklistInicial);

// Obtener checklist
router.get("/:bitacoraId/checklist-inicial", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerChecklistInicial);

export default router;
