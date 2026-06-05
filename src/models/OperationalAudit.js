import mongoose from "mongoose";

const MODULOS = [
  "BITACORA_CALDERA",
  "CHECKLIST_CAMIONETA",
  "REGISTRO_DATOS",
  "USUARIOS",
  "ALERTAS",
  "SISTEMA",
  "REPORTES_EJECUTIVOS",
  "DASHBOARD_EJECUTIVO",
  "JOBS",
  "ORGANIZACION"
];

const ACCIONES = [
  "BITACORA_CREADA",
  "BITACORA_CERRADA",
  "BITACORA_ELIMINADA",
  "CHECKLIST_CREADO",
  "CHECKLIST_FINALIZADO",
  "CHECKLIST_REVISADO",
  "CHECKLIST_ELIMINADO",
  "PDF_DESCARGADO",
  "EXCEL_DESCARGADO",
  "ALERTA_CREADA",
  "ALERTA_ASIGNADA",
  "ALERTA_EN_PROCESO",
  "ALERTA_RESUELTA",
  "ALERTA_CERRADA",
  "CAMBIO_PERMISO",
  "CAMBIO_ROL",
  "ACCESO_DENEGADO",
  "ACCESO_PANEL_SALUD",
  "BACKUP_MANUAL",
  "BACKUP_CONSULTADO",
  "BACKUP_ERROR",
  "REPORTE_EJECUTIVO_GENERADO",
  "REPORTE_EJECUTIVO_DESCARGADO",
  "DASHBOARD_EJECUTIVO_CONSULTADO",
  "DASHBOARD_EJECUTIVO_DESCARGADO",
  "JOB_INICIADO",
  "JOB_FINALIZADO",
  "JOB_ERROR",
  "CHECKLIST_RECORDATORIO_ENVIADO",
  "CHECKLIST_INCUMPLIMIENTO",
  "CHECKLIST_INCUMPLIMIENTO_CRITICO",
  "USUARIO_APROBADO",
  "USUARIO_BLOQUEADO",
  "USUARIO_ELIMINADO",
  "USUARIO_CAMBIO_ROL",
  "USUARIO_RESET_PASSWORD",
  "USUARIO_ASIGNADO_AREA",
  "USUARIO_ASIGNADO_TURNO",
  "USUARIO_HABILITADO_CONDUCTOR",
  "USUARIO_DESHABILITADO_CONDUCTOR",
  "CAMIONETA_ASIGNADA",
  "CAMIONETA_DESASIGNADA",
  "LICENCIA_POR_VENCER",
  "LICENCIA_VENCIDA"
];

const operationalAuditSchema = new mongoose.Schema(
  {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    nombreUsuario: { type: String, default: "" },
    username: { type: String, default: "", index: true },
    email: { type: String, default: "", index: true },
    rol: { type: String, default: "", index: true },
    planta: { type: String, default: "" },
    modulo: { type: String, enum: MODULOS, required: true, index: true },
    entidad: { type: String, default: "", index: true },
    entidadId: { type: mongoose.Schema.Types.ObjectId, index: true },
    accion: { type: String, enum: ACCIONES, required: true, index: true },
    resultado: { type: String, enum: ["OK", "ERROR"], required: true, index: true },
    observacion: { type: String, default: "" },
    fecha: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

operationalAuditSchema.index({ fecha: -1 });
operationalAuditSchema.index({ modulo: 1, accion: 1, fecha: -1 });
operationalAuditSchema.index({ entidad: 1, entidadId: 1, fecha: -1 });

export default mongoose.model("OperationalAudit", operationalAuditSchema);
