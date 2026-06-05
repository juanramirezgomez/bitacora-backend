import express from "express";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";
import {
  actualizarCamionetaAsignada,
  actualizarOrganizacionUsuario,
  crearCamionetaAsignada,
  listarCamionetasAsignadas,
  obtenerCatalogosOrganizacionales,
  obtenerDashboardOrganizacion,
  obtenerMiAsignacionOperacional
} from "../controllers/organizationalController.js";

const router = express.Router();

router.get("/me", obtenerMiAsignacionOperacional);

router.get("/catalogos", requireRole("ADMIN"), authorizeModule("organizacion"), obtenerCatalogosOrganizacionales);
router.get("/dashboard", requireRole("ADMIN"), authorizeModule("organizacion"), obtenerDashboardOrganizacion);
router.get("/camionetas", requireRole("ADMIN"), authorizeModule("organizacion"), listarCamionetasAsignadas);
router.post("/camionetas", requireRole("ADMIN"), authorizeModule("organizacion"), crearCamionetaAsignada);
router.patch("/camionetas/:id", requireRole("ADMIN"), authorizeModule("organizacion"), actualizarCamionetaAsignada);
router.patch("/usuarios/:id", requireRole("ADMIN"), authorizeModule("organizacion"), actualizarOrganizacionUsuario);

export default router;
