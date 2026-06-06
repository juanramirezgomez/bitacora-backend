import {
  crearBackupManual,
  crearBackupProgramado,
  obtenerArchivoBackup,
  obtenerEstadoBackup,
  obtenerHistorialBackups,
  obtenerUltimoBackup,
  restaurarBackup
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
        ultimo: estado.ultimo,
        retencionMaxima: estado.retencionMaxima,
        herramientas: estado.herramientas,
        mensaje: estado.mensaje
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
      message: "Respaldo real generado correctamente",
      backup
    });
  } catch (error) {
    console.error("ERROR BACKUP MANUAL:", error);
    return res.status(500).json({ message: error?.message || "Error generando respaldo real" });
  }
};

export const crearBackupProgramadoController = async (req, res) => {
  try {
    const backup = await crearBackupProgramado(req);
    return res.status(201).json({ message: "Respaldo programado generado correctamente", backup });
  } catch (error) {
    console.error("ERROR BACKUP PROGRAMADO:", error);
    return res.status(500).json({ message: error?.message || "Error generando respaldo programado" });
  }
};

export const descargarBackupController = async (req, res) => {
  try {
    const { backup, filePath } = await obtenerArchivoBackup(req.params.id);
    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemBackup",
      entidadId: backup._id,
      accion: "BACKUP_DESCARGADO",
      observacion: `Respaldo descargado: ${backup.nombre || backup.archivo}`
    });
    return res.download(filePath, backup.nombre || backup.archivo);
  } catch (error) {
    console.error("ERROR DESCARGANDO BACKUP:", error);
    return res.status(404).json({ message: error?.message || "Respaldo no disponible" });
  }
};

export const restaurarBackupController = async (req, res) => {
  try {
    if (String(req.body?.confirmacion || "") !== "RESTAURAR RESPALDO") {
      return res.status(400).json({
        message: 'Confirmacion requerida. Debe enviar exactamente "RESTAURAR RESPALDO".'
      });
    }
    const backup = await restaurarBackup({ id: req.params.id, req });
    return res.json({ message: "Respaldo restaurado correctamente", backup });
  } catch (error) {
    console.error("ERROR RESTAURANDO BACKUP:", error);
    return res.status(500).json({ message: error?.message || "Error restaurando respaldo" });
  }
};
