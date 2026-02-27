import express from "express";
import {
  crearCierreTurno,
  obtenerCierreTurno
} from "../controllers/CierreTurnoController.js";

const router = express.Router();

router.post("/:bitacoraId/cierre", crearCierreTurno);
router.get("/:bitacoraId/cierre", obtenerCierreTurno);

export default router;
