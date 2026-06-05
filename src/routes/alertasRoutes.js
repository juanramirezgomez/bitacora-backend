import express from "express";
import {
  adjuntarEvidencia,
  asignarAlerta,
  cerrarAlerta,
  comentarAlerta,
  evaluarEscalamiento,
  obtenerDetalleAlerta,
  ponerAlertaEnProceso,
  resolverAlerta,
  uploadAlertaEvidencias
} from "../controllers/alertasController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

const gestores = ["ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"];
const lectores = [...gestores, "OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"];

router.get("/:id", requireRole(...lectores), authorizeModule("alertas"), obtenerDetalleAlerta);
router.post("/:id/comentarios", requireRole(...lectores), authorizeModule("alertas"), comentarAlerta);
router.post("/:id/evidencias", requireRole(...lectores), authorizeModule("alertas"), uploadAlertaEvidencias.array("evidencias", 6), adjuntarEvidencia);
router.post("/escalamiento/evaluar", requireRole("ADMIN", "SUPERINTENDENTE", "JEFE_PLANTA"), authorizeModule("alertas"), evaluarEscalamiento);
router.patch("/:id/asignar", requireRole(...gestores), authorizeModule("alertas"), asignarAlerta);
router.patch("/:id/en-proceso", requireRole(...gestores), authorizeModule("alertas"), ponerAlertaEnProceso);
router.patch("/:id/resolver", requireRole(...gestores), authorizeModule("alertas"), resolverAlerta);
router.patch("/:id/cerrar", requireRole(...gestores), authorizeModule("alertas"), cerrarAlerta);

export default router;
