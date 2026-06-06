import express from "express";
import {
  crearBackupManualController,
  crearBackupProgramadoController,
  descargarBackupController,
  listarBackups,
  obtenerBackupLatest,
  restaurarBackupController
} from "../controllers/systemBackupController.js";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";

const router = express.Router();

router.get(
  "/",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  listarBackups
);

router.get(
  "/latest",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  obtenerBackupLatest
);

router.post(
  "/manual",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  crearBackupManualController
);

router.post(
  "/programado",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  crearBackupProgramadoController
);

router.get(
  "/:id/download",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  descargarBackupController
);

router.post(
  "/:id/restore",
  requireRole("ADMIN"),
  authorizeModule("backups"),
  restaurarBackupController
);

export default router;
