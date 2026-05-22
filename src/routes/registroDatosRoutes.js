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
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.use(requireRole("ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR_PLANTA"));

router.post("/", crearRegistroDatos);
router.get("/", listarRegistroDatos);
router.get("/realtime", obtenerRegistroDatosRealtime);
router.get("/dashboard", obtenerDashboardRegistroDatos);
router.get("/export/pdf", exportarRegistroDatosPdf);
router.get("/export/excel", exportarRegistroDatosExcel);
router.get("/:id", obtenerRegistroDatos);

export default router;
