import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import mongoose from "mongoose";
import SystemBackup from "../models/SystemBackup.js";
import { registrarEvento } from "./operationalAuditService.js";

const RETENCION_MAXIMA = 30;
const TIMEOUT_MS = Number(process.env.BACKUP_COMMAND_TIMEOUT_MS || 30 * 60 * 1000);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "storage", "backups"));
let operacionEnCurso = false;
let herramientasCache = { fecha: 0, valor: null };

const cleanObjectId = (value) => {
  const id = value?._id || value?.id || value?.uid || value?.sub || value;
  return mongoose.Types.ObjectId.isValid(String(id || "")) ? id : null;
};

const usuarioNombre = (user = {}) =>
  user?.nombre || user?.username || user?.operadorId || user?.email || "Sistema";

const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const nombreArchivo = (fecha = new Date()) => {
  const stamp = fecha.toISOString().replace(/[:.]/g, "-");
  return `operaciones-litio-${stamp}.archive.gz`;
};

const rutaSegura = (archivo = "") => {
  const resolved = path.resolve(BACKUP_DIR, path.basename(String(archivo || "")));
  if (!resolved.startsWith(`${BACKUP_DIR}${path.sep}`)) {
    throw new Error("Ruta de respaldo no permitida");
  }
  return resolved;
};

const mongoUri = () => {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI no configurado");
  return uri;
};

const redactarSecretos = (value = "") => {
  let message = String(value || "");
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (uri) message = message.split(uri).join("[MONGODB_URI]");
  return message;
};

const ejecutarComando = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: process.env
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Tiempo agotado ejecutando ${path.basename(command)}`));
    }, TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const message = error?.code === "ENOENT"
        ? `${path.basename(command)} no esta instalado o no esta disponible en PATH`
        : error?.message;
      reject(new Error(message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ code, stderr: stderr.trim() });
      return reject(new Error(redactarSecretos(`${path.basename(command)} finalizo con codigo ${code}: ${stderr.trim()}`)));
    });
  });

const calcularHash = async (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const validarArchivo = async (filePath) => {
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("El archivo de respaldo no existe o esta vacio");
  }
  return {
    tamanoBytes: stats.size,
    tamano: formatBytes(stats.size),
    hashSha256: await calcularHash(filePath)
  };
};

const auditar = (req, backup, accion, resultado = "OK", observacion = "") =>
  registrarEvento({
    req,
    modulo: "SISTEMA",
    entidad: "SystemBackup",
    entidadId: backup?._id,
    accion,
    resultado,
    observacion
  });

const aplicarRetencion = async () => {
  const antiguos = await SystemBackup.find({ estado: "COMPLETADO", resultado: "OK" })
    .sort({ fechaInicio: -1 })
    .skip(RETENCION_MAXIMA)
    .select("_id archivo")
    .lean();

  for (const backup of antiguos) {
    try {
      if (backup.archivo) await fs.promises.rm(rutaSegura(backup.archivo), { force: true });
      await SystemBackup.deleteOne({ _id: backup._id });
    } catch (error) {
      console.error("BACKUP_RETENCION_ERROR:", error?.message || error);
    }
  }
};

export const crearBackup = async ({ req = null, tipo = "MANUAL" } = {}) => {
  if (operacionEnCurso) throw new Error("Ya existe una operacion de respaldo o restauracion en curso");
  operacionEnCurso = true;

  const fechaInicio = new Date();
  const user = req?.user || {};
  const archivo = nombreArchivo(fechaInicio);
  const filePath = rutaSegura(archivo);
  let backup = null;

  try {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    backup = await SystemBackup.create({
      nombre: archivo,
      tipo,
      estado: "EN_PROCESO",
      fechaInicio,
      usuarioId: cleanObjectId(user),
      usuarioNombre: usuarioNombre(user),
      observacion: "Respaldo MongoDB real iniciado",
      archivo,
      origen: "MONGODUMP_ARCHIVE_GZIP",
      resultado: "PENDIENTE",
      creadoPor: cleanObjectId(user)
    });
    await auditar(req, backup, "BACKUP_INICIADO", "OK", `Respaldo ${tipo} iniciado`);

    const command = process.env.MONGODUMP_PATH || "mongodump";
    await ejecutarComando(command, [`--uri=${mongoUri()}`, `--archive=${filePath}`, "--gzip"]);
    const validacion = await validarArchivo(filePath);
    const fechaFin = new Date();

    Object.assign(backup, {
      estado: "COMPLETADO",
      fechaFin,
      duracion: fechaFin.getTime() - fechaInicio.getTime(),
      ...validacion,
      validado: true,
      resultado: "OK",
      observacion: "Respaldo MongoDB generado y validado correctamente"
    });
    await backup.save();
    await auditar(req, backup, "BACKUP_FINALIZADO", "OK", `${archivo} (${validacion.tamano})`);
    await aplicarRetencion();
    return backup;
  } catch (error) {
    await fs.promises.rm(filePath, { force: true }).catch(() => {});
    const fechaFin = new Date();
    if (backup) {
      Object.assign(backup, {
        estado: "ERROR",
        fechaFin,
        duracion: fechaFin.getTime() - fechaInicio.getTime(),
        tamano: "0 B",
        tamanoBytes: 0,
        validado: false,
        resultado: "ERROR",
        observacion: error?.message || "Error generando respaldo MongoDB"
      });
      await backup.save();
    } else {
      backup = await SystemBackup.create({
        nombre: archivo,
        tipo,
        estado: "ERROR",
        fechaInicio,
        fechaFin,
        duracion: fechaFin.getTime() - fechaInicio.getTime(),
        tamano: "0 B",
        usuarioId: cleanObjectId(user),
        usuarioNombre: usuarioNombre(user),
        observacion: error?.message || "Error generando respaldo MongoDB",
        archivo: "",
        origen: "MONGODUMP_ARCHIVE_GZIP",
        resultado: "ERROR",
        creadoPor: cleanObjectId(user)
      });
    }
    await auditar(req, backup, "BACKUP_ERROR", "ERROR", backup.observacion);
    throw error;
  } finally {
    operacionEnCurso = false;
  }
};

export const crearBackupManual = (req) => crearBackup({ req, tipo: "MANUAL" });
export const crearBackupProgramado = (req = null) => crearBackup({ req, tipo: "PROGRAMADO" });

export const obtenerArchivoBackup = async (id) => {
  const backup = await SystemBackup.findById(id).lean();
  if (!backup || backup.estado !== "COMPLETADO" || backup.resultado !== "OK" || !backup.archivo) {
    throw new Error("Respaldo no disponible para descarga");
  }
  const filePath = rutaSegura(backup.archivo);
  const validacion = await validarArchivo(filePath);
  if (backup.hashSha256 && backup.hashSha256 !== validacion.hashSha256) {
    throw new Error("La integridad del respaldo no coincide");
  }
  return { backup, filePath };
};

export const restaurarBackup = async ({ id, req }) => {
  if (operacionEnCurso) throw new Error("Ya existe una operacion de respaldo o restauracion en curso");
  operacionEnCurso = true;
  try {
    const { backup, filePath } = await obtenerArchivoBackup(id);
    const command = process.env.MONGORESTORE_PATH || "mongorestore";
    await ejecutarComando(command, [`--uri=${mongoUri()}`, `--archive=${filePath}`, "--gzip", "--drop"]);

    const user = req?.user || {};
    const actualizado = await SystemBackup.findByIdAndUpdate(
      backup._id,
      {
        $set: {
          nombre: backup.nombre || backup.archivo,
          tipo: backup.tipo,
          estado: "COMPLETADO",
          fechaInicio: backup.fechaInicio,
          fechaFin: backup.fechaFin,
          duracion: backup.duracion,
          tamano: backup.tamano,
          tamanoBytes: backup.tamanoBytes,
          hashSha256: backup.hashSha256,
          validado: true,
          archivo: backup.archivo,
          origen: backup.origen,
          resultado: "OK",
          observacion: "Respaldo restaurado y validado correctamente",
          ultimaRestauracion: new Date(),
          restauradoPor: cleanObjectId(user),
          restauradoPorNombre: usuarioNombre(user)
        }
      },
      { new: true, upsert: true }
    );
    await auditar(req, actualizado, "BACKUP_RESTAURADO", "OK", `Respaldo restaurado: ${backup.nombre || backup.archivo}`);
    return actualizado;
  } catch (error) {
    await auditar(req, { _id: id }, "BACKUP_ERROR", "ERROR", `Error restaurando respaldo: ${error?.message || error}`);
    throw error;
  } finally {
    operacionEnCurso = false;
  }
};

export const obtenerUltimoBackup = () =>
  SystemBackup.findOne({}).sort({ fechaInicio: -1 }).lean();

export const obtenerHistorialBackups = (limit = 100) =>
  SystemBackup.find({}).sort({ fechaInicio: -1 }).limit(Math.min(Number(limit) || 100, 200)).lean();

const herramientaDisponible = async (command) => {
  try {
    await ejecutarComando(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
};

const obtenerHerramientas = async () => {
  if (herramientasCache.valor && Date.now() - herramientasCache.fecha < 5 * 60 * 1000) {
    return herramientasCache.valor;
  }
  const [mongodumpDisponible, mongorestoreDisponible] = await Promise.all([
    herramientaDisponible(process.env.MONGODUMP_PATH || "mongodump"),
    herramientaDisponible(process.env.MONGORESTORE_PATH || "mongorestore")
  ]);
  herramientasCache = {
    fecha: Date.now(),
    valor: { mongodump: mongodumpDisponible, mongorestore: mongorestoreDisponible }
  };
  return herramientasCache.valor;
};

export const obtenerEstadoBackup = async () => {
  const [ultimo, total, exitosos, errores, herramientas] = await Promise.all([
    obtenerUltimoBackup(),
    SystemBackup.countDocuments({}),
    SystemBackup.countDocuments({ resultado: "OK", estado: "COMPLETADO" }),
    SystemBackup.countDocuments({ resultado: "ERROR" }),
    obtenerHerramientas()
  ]);
  return {
    status: ultimo ? ultimo.estado : "NO_CONFIGURADO",
    mensaje: herramientas.mongodump && herramientas.mongorestore
      ? "Herramientas de respaldo real disponibles"
      : "MongoDB Database Tools no disponibles",
    ultimo,
    total,
    exitosos,
    errores,
    retencionMaxima: RETENCION_MAXIMA,
    herramientas
  };
};

export const BACKUP_STORAGE_DIR = BACKUP_DIR;
