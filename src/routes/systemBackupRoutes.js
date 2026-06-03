import express from "express";
import {
  crearBackupManualController,
  listarBackups,
  obtenerBackupLatest
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

export default router;
