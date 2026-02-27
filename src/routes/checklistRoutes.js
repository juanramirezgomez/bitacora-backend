import express from "express";
import {
  crearChecklistInicial,
  obtenerChecklistInicial
} from "../controllers/checklistController.js";

const router = express.Router();

// Crear checklist
router.post("/:bitacoraId/checklist-inicial", crearChecklistInicial);

// Obtener checklist
router.get("/:bitacoraId/checklist-inicial", obtenerChecklistInicial);

export default router;
