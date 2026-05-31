import express from "express";
import {
  asignarAlerta,
  cerrarAlerta,
  ponerAlertaEnProceso,
  resolverAlerta
} from "../controllers/alertasController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.patch("/:id/asignar", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), authorizeModule("alertas"), asignarAlerta);
router.patch("/:id/en-proceso", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), authorizeModule("alertas"), ponerAlertaEnProceso);
router.patch("/:id/resolver", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), authorizeModule("alertas"), resolverAlerta);
router.patch("/:id/cerrar", requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"), authorizeModule("alertas"), cerrarAlerta);

export default router;
