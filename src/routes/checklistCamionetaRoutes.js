import express from "express";
import {
  actualizarChecklistCamioneta,
  crearChecklistCamioneta,
  diagnosticoAlertasChecklistCamionetaController,
  descargarChecklistCamionetaExcel,
  descargarChecklistCamionetaPdf,
  eliminarChecklistCamioneta,
  enviarAlertasChecklistCamionetaController,
  finalizarChecklistCamioneta,
  listarChecklistCamionetas,
  obtenerAlertasChecklistCamionetaController,
  obtenerAlertasVencimientosChecklistCamionetaController,
  obtenerCumplimientoChecklistCamionetaController,
  obtenerChecklistCamioneta,
  revisarChecklistCamioneta,
  subirFotoChecklistCamioneta,
  uploadChecklistCamioneta
} from "../controllers/checklistCamionetaController.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.use(authorizeModule("checklist_camioneta"));

router.post("/", crearChecklistCamioneta);
router.get("/", listarChecklistCamionetas);
router.post("/upload", uploadChecklistCamioneta.single("foto"), subirFotoChecklistCamioneta);
router.get("/alertas-vencimientos", obtenerAlertasVencimientosChecklistCamionetaController);
router.get("/alertas", obtenerAlertasChecklistCamionetaController);
router.post("/alertas/enviar", enviarAlertasChecklistCamionetaController);
router.post("/alertas/diagnostico", diagnosticoAlertasChecklistCamionetaController);
router.get("/cumplimiento", obtenerCumplimientoChecklistCamionetaController);
router.get("/:id/pdf", authorizeModule("pdf"), descargarChecklistCamionetaPdf);
router.get("/:id/excel", authorizeModule("excel"), descargarChecklistCamionetaExcel);
router.get("/:id", obtenerChecklistCamioneta);
router.patch("/:id/finalizar", finalizarChecklistCamioneta);
router.patch("/:id/revisar", revisarChecklistCamioneta);
router.patch("/:id", actualizarChecklistCamioneta);
router.delete("/:id", eliminarChecklistCamioneta);

export default router;
