import express from "express";
import { obtenerSystemHealth } from "../controllers/systemHealthController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.get(
  "/",
  requireRole("ADMIN", "SUPERVISION", "SUPERVISOR"),
  authorizeModule("system_health"),
  obtenerSystemHealth
);

export default router;
