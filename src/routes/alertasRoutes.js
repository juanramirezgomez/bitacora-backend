import express from "express";
import {
  adjuntarEvidencia,
  cerrarAlerta,
  comentarAlerta,
  evaluarEscalamiento,
  obtenerDetalleAlerta,
  tomarGestionAlerta,
  uploadAlertaEvidencias
} from "../controllers/alertasController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

const supervisores = ["ADMIN", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"];
const resolutores = [...supervisores, "SUPERINTENDENTE"];
const lectores = [...resolutores, "OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"];

router.get("/:id", requireRole(...lectores), authorizeModule("alertas"), obtenerDetalleAlerta);
router.post("/:id/comentarios", requireRole(...lectores), authorizeModule("alertas"), comentarAlerta);
router.post("/:id/evidencias", requireRole(...lectores), authorizeModule("alertas"), uploadAlertaEvidencias.array("evidencias", 6), adjuntarEvidencia);
router.post("/escalamiento/evaluar", requireRole("ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA"), authorizeModule("alertas"), evaluarEscalamiento);
router.patch("/:id/tomar-gestion", requireRole(...resolutores), authorizeModule("alertas"), tomarGestionAlerta);
router.patch("/:id/cerrar", requireRole(...resolutores), authorizeModule("alertas"), cerrarAlerta);

export default router;
