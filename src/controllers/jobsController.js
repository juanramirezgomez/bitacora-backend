import {
  generarEscalamiento,
  generarRecordatorios,
  validarChecklistDiario
} from "../services/checklistComplianceService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const ejecutarJob = async ({ req, res, nombre, accion, handler }) => {
  const inicio = Date.now();
  try {
    console.log("JOB_INICIADO", { nombre });
    await registrarEvento({
      req,
      modulo: "JOBS",
      entidad: "RenderCron",
      accion: "JOB_INICIADO",
      observacion: `${nombre} iniciado`
    });

    const resultado = await handler();

    await registrarEvento({
      req,
      modulo: "JOBS",
      entidad: "RenderCron",
      accion: accion || "JOB_FINALIZADO",
      observacion: `${nombre} finalizado en ${Date.now() - inicio}ms`
    });
    await registrarEvento({
      req,
      modulo: "JOBS",
      entidad: "RenderCron",
      accion: "JOB_FINALIZADO",
      observacion: `${nombre} finalizado en ${Date.now() - inicio}ms`
    });

    console.log("JOB_FINALIZADO", { nombre, tiempoMs: Date.now() - inicio });
    return res.json({ ok: true, job: nombre, tiempoMs: Date.now() - inicio, resultado });
  } catch (error) {
    console.error("JOB_ERROR", { nombre, error: error?.message || error });
    await registrarEvento({
      req,
      modulo: "JOBS",
      entidad: "RenderCron",
      accion: "JOB_ERROR",
      resultado: "ERROR",
      observacion: `${nombre}: ${error?.message || error}`
    });
    return res.status(500).json({ ok: false, job: nombre, message: "Error ejecutando job operacional" });
  }
};

export const checklistReminderJob = (req, res) =>
  ejecutarJob({
    req,
    res,
    nombre: "checklist-reminder",
    accion: "CHECKLIST_RECORDATORIO_ENVIADO",
    handler: () => generarRecordatorios({ fecha: new Date(), hora: 8, req })
  });

export const checklistEscalationJob = (req, res) => {
  const nivelParam = String(req.query?.nivel || "").toUpperCase();
  const hora = new Date().getHours();
  const nivel = nivelParam === "CRITICA" || hora >= 18 ? "CRITICA" : "MEDIA";
  return ejecutarJob({
    req,
    res,
    nombre: `checklist-escalation-${nivel.toLowerCase()}`,
    accion: nivel === "CRITICA" ? "CHECKLIST_INCUMPLIMIENTO_CRITICO" : "CHECKLIST_INCUMPLIMIENTO",
    handler: () => generarEscalamiento({ fecha: new Date(), nivel, req })
  });
};

export const dashboardRefreshJob = (req, res) =>
  ejecutarJob({
    req,
    res,
    nombre: "dashboard-refresh",
    handler: () => validarChecklistDiario({ fecha: new Date(), user: null })
  });
