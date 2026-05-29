import express from "express";
import {
  asignarAlerta,
  cerrarAlerta,
  ponerAlertaEnProceso,
  resolverAlerta
} from "../controllers/alertasController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.patch("/:id/asignar", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), asignarAlerta);
router.patch("/:id/en-proceso", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), ponerAlertaEnProceso);
router.patch("/:id/resolver", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), resolverAlerta);
router.patch("/:id/cerrar", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), cerrarAlerta);

export default router;
