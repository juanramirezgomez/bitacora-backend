import express from "express";
import {
  actualizarBitacoraDiaria,
  actualizarNovedad,
  agregarNovedad,
  cerrarBitacoraDiaria,
  crearBitacoraDiaria,
  descargarBitacoraDiariaPdf,
  eliminarBitacoraDiaria,
  eliminarNovedad,
  listarBitacorasDiarias,
  obtenerBitacoraDiaria,
  subirArchivoBitacoraDiaria,
  uploadBitacoraDiaria
} from "../controllers/bitacoraDiariaController.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.use(authorizeModule("libro_diario"));

router.post("/", crearBitacoraDiaria);
router.get("/", listarBitacorasDiarias);
router.post("/upload", uploadBitacoraDiaria.array("archivos", 10), subirArchivoBitacoraDiaria);
router.get("/:id/pdf", authorizeModule("pdf"), descargarBitacoraDiariaPdf);
router.get("/:id", obtenerBitacoraDiaria);
router.patch("/:id", actualizarBitacoraDiaria);
router.post("/:id/novedades", agregarNovedad);
router.patch("/:id/novedades/:novedadId", actualizarNovedad);
router.delete("/:id/novedades/:novedadId", eliminarNovedad);
router.patch("/:id/cerrar", cerrarBitacoraDiaria);
router.delete("/:id", eliminarBitacoraDiaria);

export default router;
