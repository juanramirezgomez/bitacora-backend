import express from "express";
import {
  actualizarChecklistCamioneta,
  crearChecklistCamioneta,
  descargarChecklistCamionetaExcel,
  descargarChecklistCamionetaPdf,
  eliminarChecklistCamioneta,
  enviarAlertasChecklistCamionetaController,
  finalizarChecklistCamioneta,
  listarChecklistCamionetas,
  obtenerAlertasChecklistCamionetaController,
  obtenerAlertasVencimientosChecklistCamionetaController,
  obtenerChecklistCamioneta,
  revisarChecklistCamioneta,
  subirFotoChecklistCamioneta,
  uploadChecklistCamioneta
} from "../controllers/checklistCamionetaController.js";

const router = express.Router();

router.post("/", crearChecklistCamioneta);
router.get("/", listarChecklistCamionetas);
router.post("/upload", uploadChecklistCamioneta.single("foto"), subirFotoChecklistCamioneta);
router.get("/alertas-vencimientos", obtenerAlertasVencimientosChecklistCamionetaController);
router.get("/alertas", obtenerAlertasChecklistCamionetaController);
router.post("/alertas/enviar", enviarAlertasChecklistCamionetaController);
router.get("/:id/pdf", descargarChecklistCamionetaPdf);
router.get("/:id/excel", descargarChecklistCamionetaExcel);
router.get("/:id", obtenerChecklistCamioneta);
router.patch("/:id/finalizar", finalizarChecklistCamioneta);
router.patch("/:id/revisar", revisarChecklistCamioneta);
router.patch("/:id", actualizarChecklistCamioneta);
router.delete("/:id", eliminarChecklistCamioneta);

export default router;
