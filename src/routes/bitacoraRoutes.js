import express from "express";
import {
  iniciarTurno,
  listarBitacoras,
  obtenerBitacora,
  obtenerBitacoraAbierta
} from "../controllers/bitacoraController.js";

const router = express.Router();

// 🔹 IMPORTANTE: rutas específicas primero
router.get("/abierta", obtenerBitacoraAbierta);

router.post("/iniciar", iniciarTurno);

router.get("/", listarBitacoras);

router.get("/:bitacoraId", obtenerBitacora);

export default router;
