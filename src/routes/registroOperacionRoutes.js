import express from "express";
import {
  crearRegistroOperacion,
  listarRegistroOperacion,
  eliminarRegistroOperacion,
  editarRegistroOperacion
} from "../controllers/registroOperacionController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// Crear
router.post("/:bitacoraId/registro-operacion", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), crearRegistroOperacion);

// Listar
router.get("/:bitacoraId/registro-operacion", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_CALDERA", "OPERADOR"), listarRegistroOperacion);

// Editar
router.put("/:bitacoraId/registro-operacion/:id", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), editarRegistroOperacion);

// Eliminar
router.delete("/:bitacoraId/registro-operacion/:id", requireRole("ADMIN", "OPERADOR_CALDERA", "OPERADOR"), eliminarRegistroOperacion);

export default router;
