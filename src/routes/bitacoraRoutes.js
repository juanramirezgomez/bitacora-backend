import express from "express";
import {
  iniciarTurno,
  listarBitacoras,
  obtenerBitacora,
  obtenerBitacoraAbierta,
  obtenerTendenciasCombustible,
  obtenerTendenciasHistoricas,
  obtenerTendenciasBitacora,
  eliminarBitacora
} from "../controllers/bitacoraController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// 🔹 IMPORTANTE: rutas específicas primero
router.get("/abierta", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), obtenerBitacoraAbierta);

router.get("/tendencias-historicas", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerTendenciasHistoricas);

router.get("/tendencias-combustible", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerTendenciasCombustible);

router.get("/:bitacoraId/tendencias", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerTendenciasBitacora);

router.post("/iniciar", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), iniciarTurno);

router.get("/", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), listarBitacoras);

router.get("/:bitacoraId", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), obtenerBitacora);

router.delete("/:bitacoraId", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), eliminarBitacora);

export default router;
