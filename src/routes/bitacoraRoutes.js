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
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// 🔹 IMPORTANTE: rutas específicas primero
router.get("/abierta", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("bitacora"), obtenerBitacoraAbierta);

router.get("/tendencias-historicas", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerTendenciasHistoricas);

router.get("/tendencias-combustible", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerTendenciasCombustible);

router.get("/:bitacoraId/tendencias", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerTendenciasBitacora);

router.post("/iniciar", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("inicio_turno"), iniciarTurno);

router.get("/", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), listarBitacoras);

router.get("/:bitacoraId", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), obtenerBitacora);

router.delete("/:bitacoraId", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), authorizeModule("bitacora"), eliminarBitacora);

export default router;
