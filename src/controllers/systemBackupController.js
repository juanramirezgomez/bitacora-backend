import {
  crearBackupManual,
  obtenerEstadoBackup,
  obtenerHistorialBackups,
  obtenerUltimoBackup
} from "../services/backupService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

export const listarBackups = async (req, res) => {
  try {
    const backups = await obtenerHistorialBackups(200);
    const estado = await obtenerEstadoBackup();

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemBackup",
      accion: "BACKUP_CONSULTADO",
      observacion: "Consulta historial de backups"
    });

    return res.json({
      backups,
      resumen: {
        total: estado.total,
        exitosos: estado.exitosos,
        errores: estado.errores,
        ultimo: estado.ultimo
      }
    });
  } catch (error) {
    console.error("ERROR LISTANDO BACKUPS:", error);
    return res.status(500).json({ message: "Error listando backups" });
  }
};

export const obtenerBackupLatest = async (req, res) => {
  try {
    const ultimo = await obtenerUltimoBackup();

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemBackup",
      entidadId: ultimo?._id,
      accion: "BACKUP_CONSULTADO",
      observacion: "Consulta ultimo backup"
    });

    return res.json({ backup: ultimo });
  } catch (error) {
    console.error("ERROR OBTENIENDO ULTIMO BACKUP:", error);
    return res.status(500).json({ message: "Error obteniendo ultimo backup" });
  }
};

export const crearBackupManualController = async (req, res) => {
  try {
    const backup = await crearBackupManual(req);
    return res.status(201).json({
      message: "Backup manual registrado",
      backup
    });
  } catch (error) {
    console.error("ERROR BACKUP MANUAL:", error);
    return res.status(500).json({ message: "Error registrando backup manual" });
  }
};
