import express from "express";
import {
  crearRegistroDatos,
  exportarRegistroDatosExcel,
  exportarRegistroDatosPdf,
  listarRegistroDatos,
  obtenerDashboardRegistroDatos,
  obtenerRegistroDatos,
  obtenerRegistroDatosRealtime
} from "../controllers/registroDatosController.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.use(authorizeModule("registro_datos"));

router.post("/", crearRegistroDatos);
router.get("/", listarRegistroDatos);
router.get("/realtime", obtenerRegistroDatosRealtime);
router.get("/dashboard", obtenerDashboardRegistroDatos);
router.get("/export/pdf", authorizeModule("pdf"), exportarRegistroDatosPdf);
router.get("/export/excel", authorizeModule("excel"), exportarRegistroDatosExcel);
router.get("/:id", obtenerRegistroDatos);

export default router;
