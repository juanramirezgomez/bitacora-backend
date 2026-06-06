import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { crearBackupProgramado } from "../services/backupService.js";

dotenv.config();

try {
  await connectDB();
  const backup = await crearBackupProgramado();
  console.log("BACKUP_PROGRAMADO_FINALIZADO", {
    id: String(backup._id),
    archivo: backup.archivo,
    tamano: backup.tamano
  });
  await mongoose.disconnect();
  process.exit(0);
} catch (error) {
  console.error("BACKUP_PROGRAMADO_ERROR", error?.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
