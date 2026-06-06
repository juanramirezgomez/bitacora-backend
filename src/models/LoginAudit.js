import mongoose from "mongoose";

const loginAuditSchema = new mongoose.Schema(
  {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    nombreUsuario: { type: String, default: "" },
    username: { type: String, default: "", index: true },
    email: { type: String, default: "", index: true },
    rol: { type: String, default: "", index: true },
    planta: { type: String, default: "" },
    accion: {
      type: String,
      enum: [
        "LOGIN_EXITOSO",
        "LOGIN_FALLIDO",
        "LOGIN_BLOQUEADO",
        "JWT_ACCESS_DENIED",
        "DESBLOQUEO_AUTOMATICO",
        "LOGOUT",
        "SOLICITUD_RESET_PASSWORD",
        "SOLICITUD_RECUPERACION_APROBADA",
        "PASSWORD_TEMPORAL_GENERADA",
        "RESET_PASSWORD_APROBADO",
        "RESET_PASSWORD_RECHAZADO",
        "RESET_PASSWORD",
        "PASSWORD_CAMBIADA",
        "CAMBIO_PASSWORD"
      ],
      required: true,
      index: true
    },
    resultado: {
      type: String,
      enum: ["OK", "ERROR"],
      required: true,
      index: true
    },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    dispositivo: {
      type: String,
      enum: ["ANDROID", "IOS", "WINDOWS", "MAC", "LINUX", "OTRO"],
      default: "OTRO"
    },
    fecha: { type: Date, default: Date.now, index: true },
    observacion: { type: String, default: "" }
  },
  { timestamps: true }
);

loginAuditSchema.index({ fecha: -1 });
loginAuditSchema.index({ accion: 1, fecha: -1 });

export default mongoose.model("LoginAudit", loginAuditSchema);
