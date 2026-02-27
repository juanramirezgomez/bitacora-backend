import express from "express";
import { obtenerDetalleBitacora } from "../controllers/detalleBitacoraController.js";

const router = express.Router();

// GET /api/bitacoras/:bitacoraId/detalle
router.get("/:bitacoraId/detalle", obtenerDetalleBitacora);

export default router;
