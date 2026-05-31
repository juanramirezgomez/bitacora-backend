import mongoose from "mongoose";
import SystemBackup from "../models/SystemBackup.js";
import { registrarEvento } from "./operationalAuditService.js";

const cleanObjectId = (value) => {
  const id = value?._id || value?.id || value?.uid || value?.sub || value;
  return mongoose.Types.ObjectId.isValid(String(id || "")) ? id : null;
};

const usuarioNombre = (user = {}) =>
  user?.nombre || user?.username || user?.operadorId || user?.email || "Usuario";

const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const obtenerTamanoLogico = async () => {
  try {
    const stats = await mongoose.connection?.db?.stats();
    return formatBytes(stats?.dataSize || 0);
  } catch (error) {
    console.error("ERROR OBTENIENDO TAMANO LOGICO BACKUP:", error?.message || error);
    return "No disponible";
  }
};

export const crearBackupManual = async (req) => {
  const fechaInicio = new Date();

  try {
    const tamano = await obtenerTamanoLogico();
    const fechaFin = new Date();
    const duracion = fechaFin.getTime() - fechaInicio.getTime();
    const user = req?.user || {};

    const backup = await SystemBackup.create({
      tipo: "MANUAL",
      estado: "COMPLETADO",
      fechaInicio,
      fechaFin,
      duracion,
      tamano,
      usuarioId: cleanObjectId(user),
      usuarioNombre: usuarioNombre(user),
      observacion: "Backup logico controlado registrado. Preparado para dump real futuro.",
      archivo: "",
      origen: "OPERACIONES_LITIO_BACKUP_LOGICO",
      resultado: "OK",
      creadoPor: cleanObjectId(user)
    });

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemBackup",
      entidadId: backup._id,
      accion: "BACKUP_MANUAL",
      observacion: `Backup manual registrado por ${backup.usuarioNombre}`
    });

    return backup;
  } catch (error) {
    const fechaFin = new Date();
    const user = req?.user || {};
    const backup = await SystemBackup.create({
      tipo: "MANUAL",
      estado: "ERROR",
      fechaInicio,
      fechaFin,
      duracion: fechaFin.getTime() - fechaInicio.getTime(),
      tamano: "0 B",
      usuarioId: cleanObjectId(user),
      usuarioNombre: usuarioNombre(user),
      observacion: error?.message || "Error registrando backup manual",
      archivo: "",
      origen: "OPERACIONES_LITIO_BACKUP_LOGICO",
      resultado: "ERROR",
      creadoPor: cleanObjectId(user)
    });

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemBackup",
      entidadId: backup._id,
      accion: "BACKUP_ERROR",
      resultado: "ERROR",
      observacion: backup.observacion
    });

    throw error;
  }
};

export const obtenerUltimoBackup = () =>
  SystemBackup.findOne({}).sort({ fechaInicio: -1 }).lean();

export const obtenerHistorialBackups = (limit = 100) =>
  SystemBackup.find({}).sort({ fechaInicio: -1 }).limit(limit).lean();

export const obtenerEstadoBackup = async () => {
  const [ultimo, total, exitosos, errores] = await Promise.all([
    obtenerUltimoBackup(),
    SystemBackup.countDocuments({}),
    SystemBackup.countDocuments({ resultado: "OK" }),
    SystemBackup.countDocuments({ resultado: "ERROR" })
  ]);

  return {
    status: ultimo ? ultimo.estado : "NO_CONFIGURADO",
    mensaje: ultimo ? "Backup registrado" : "No configurado",
    ultimo,
    total,
    exitosos,
    errores
  };
};
