import express from "express";
import {
  crearRegistroOperacion,
  listarRegistroOperacion,
  eliminarRegistroOperacion,
  editarRegistroOperacion
} from "../controllers/registroOperacionController.js";

const router = express.Router();

// Crear
router.post("/:bitacoraId/registro-operacion", crearRegistroOperacion);

// Listar
router.get("/:bitacoraId/registro-operacion", listarRegistroOperacion);

// Editar
router.put("/:bitacoraId/registro-operacion/:id", editarRegistroOperacion);

// Eliminar
router.delete("/:bitacoraId/registro-operacion/:id", eliminarRegistroOperacion);

export default router;
