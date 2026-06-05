import mongoose from "mongoose";
import LoginAudit from "../models/LoginAudit.js";
import HistorialAlerta from "../models/HistorialAlerta.js";
import OperationalAudit from "../models/OperationalAudit.js";
import { registrarEvento } from "../services/operationalAuditService.js";
import { obtenerEstadoBackup } from "../services/backupService.js";

const EMAIL_CHANNELS = ["correo", "correoCorporativo", "correoRespaldo", "EMAIL_CORPORATIVO", "EMAIL_RESPALDO"];
const WHATSAPP_CHANNELS = ["whatsapp", "WHATSAPP"];

const formatUptime = (seconds = 0) => {
  const total = Math.floor(Number(seconds) || 0);
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);

  if (dias > 0) return `${dias} dias ${horas} horas`;
  if (horas > 0) return `${horas} horas ${minutos} minutos`;
  return `${minutos} minutos`;
};

const destinatarioPrincipal = (registro) => {
  const destinatario = registro?.destinatarios?.[0] || {};
  return destinatario.email
    || destinatario.correoCorporativo
    || destinatario.correoRespaldo
    || destinatario.telefono
    || "";
};

const alertaResumen = (registro) => {
  if (!registro) return null;
  return {
    fecha: registro.fecha || registro.createdAt || null,
    destinatario: destinatarioPrincipal(registro),
    estado: registro.estado || "",
    tipo: registro.tipo || "",
    error: registro.error || ""
  };
};

export const obtenerSystemHealth = async (req, res) => {
  try {
    const ahora = new Date();
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const mongoDb = mongoose.connection?.db;

    const [
      ultimoLoginExitoso,
      ultimoLoginFallido,
      ultimoCorreoEnviado,
      ultimoCorreoFallido,
      ultimoWhatsappEnviado,
      ultimoWhatsappFallido,
      totalEventosAuditoria24h,
      totalAccesos24h,
      totalErroresAuditoria24h,
      totalErroresLogin24h,
      ultimoReporteEjecutivo,
      estadoBackup
    ] = await Promise.all([
      LoginAudit.findOne({ accion: "LOGIN_EXITOSO", resultado: "OK" }).sort({ fecha: -1 }).lean(),
      LoginAudit.findOne({ accion: "LOGIN_FALLIDO", resultado: "ERROR" }).sort({ fecha: -1 }).lean(),
      HistorialAlerta.findOne({ canal: { $in: EMAIL_CHANNELS }, estado: "enviado" }).sort({ fecha: -1, createdAt: -1 }).lean(),
      HistorialAlerta.findOne({ canal: { $in: EMAIL_CHANNELS }, estado: "error" }).sort({ fecha: -1, createdAt: -1 }).lean(),
      HistorialAlerta.findOne({ canal: { $in: WHATSAPP_CHANNELS }, estado: "enviado" }).sort({ fecha: -1, createdAt: -1 }).lean(),
      HistorialAlerta.findOne({ canal: { $in: WHATSAPP_CHANNELS }, estado: "error" }).sort({ fecha: -1, createdAt: -1 }).lean(),
      OperationalAudit.countDocuments({ fecha: { $gte: hace24h } }),
      LoginAudit.countDocuments({ fecha: { $gte: hace24h } }),
      OperationalAudit.countDocuments({ fecha: { $gte: hace24h }, resultado: "ERROR" }),
      LoginAudit.countDocuments({ fecha: { $gte: hace24h }, resultado: "ERROR" }),
      OperationalAudit.findOne({
        accion: { $in: ["REPORTE_EJECUTIVO_GENERADO", "REPORTE_EJECUTIVO_DESCARGADO"] }
      }).sort({ fecha: -1 }).lean(),
      obtenerEstadoBackup()
    ]);

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "SystemHealth",
      accion: "ACCESO_PANEL_SALUD",
      observacion: "Consulta panel de salud del sistema"
    });

    return res.json({
      backend: {
        status: "ONLINE",
        uptime: formatUptime(process.uptime()),
        uptimeSeconds: Math.floor(process.uptime()),
        version: process.version,
        environment: process.env.NODE_ENV || "development"
      },
      mongodb: {
        status: mongoose.connection.readyState === 1 ? "ONLINE" : "OFFLINE",
        database: mongoDb?.databaseName || "",
        host: mongoose.connection?.host || ""
      },
      loginAudit: {
        status: "ONLINE",
        ultimoLoginExitoso: ultimoLoginExitoso ? {
          fecha: ultimoLoginExitoso.fecha,
          usuario: ultimoLoginExitoso.nombreUsuario || ultimoLoginExitoso.username || ultimoLoginExitoso.email || "",
          email: ultimoLoginExitoso.email || ""
        } : null,
        ultimoLoginFallido: ultimoLoginFallido ? {
          fecha: ultimoLoginFallido.fecha,
          usuario: ultimoLoginFallido.username || ultimoLoginFallido.email || "",
          observacion: ultimoLoginFallido.observacion || ""
        } : null
      },
      email: {
        status: ultimoCorreoFallido && !ultimoCorreoEnviado ? "ERROR" : "ONLINE",
        ultimoEnviado: alertaResumen(ultimoCorreoEnviado),
        ultimoFallido: alertaResumen(ultimoCorreoFallido)
      },
      whatsapp: {
        status: ultimoWhatsappFallido && !ultimoWhatsappEnviado ? "ERROR" : "ONLINE",
        ultimoEnviado: alertaResumen(ultimoWhatsappEnviado),
        ultimoFallido: alertaResumen(ultimoWhatsappFallido)
      },
      backups: {
        status: estadoBackup.status,
        mensaje: estadoBackup.mensaje,
        ultimo: estadoBackup.ultimo,
        total: estadoBackup.total,
        exitosos: estadoBackup.exitosos,
        errores: estadoBackup.errores
      },
      reportesEjecutivos: {
        ultimo: ultimoReporteEjecutivo ? {
          fecha: ultimoReporteEjecutivo.fecha,
          accion: ultimoReporteEjecutivo.accion,
          usuario: ultimoReporteEjecutivo.nombreUsuario || ultimoReporteEjecutivo.username || "",
          observacion: ultimoReporteEjecutivo.observacion || ""
        } : null
      },
      auditoria: {
        status: "ONLINE",
        eventos24h: totalEventosAuditoria24h,
        accesos24h: totalAccesos24h,
        errores24h: totalErroresAuditoria24h + totalErroresLogin24h
      },
      timestamp: ahora.toISOString()
    });
  } catch (error) {
    console.error("ERROR SYSTEM HEALTH:", error);
    return res.status(500).json({ message: "Error obteniendo salud del sistema" });
  }
};
