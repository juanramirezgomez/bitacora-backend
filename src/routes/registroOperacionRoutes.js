import express from "express";
import {
  crearRegistroOperacion,
  listarRegistroOperacion,
  eliminarRegistroOperacion,
  editarRegistroOperacion
} from "../controllers/registroOperacionController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

// Crear
router.post("/:bitacoraId/registro-operacion", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("bitacora"), crearRegistroOperacion);

// Listar
router.get("/:bitacoraId/registro-operacion", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("historial_bitacora"), listarRegistroOperacion);

// Editar
router.put("/:bitacoraId/registro-operacion/:id", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("bitacora"), editarRegistroOperacion);

// Eliminar
router.delete("/:bitacoraId/registro-operacion/:id", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), authorizeModule("bitacora"), eliminarRegistroOperacion);

export default router;
