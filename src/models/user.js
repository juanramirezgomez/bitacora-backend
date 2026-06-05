// src/models/user.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, sparse: true, trim: true },
    operadorId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9]{3,12}$/
    },
    nombre: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    correoCorporativo: { type: String, trim: true, lowercase: true, default: "" },
    correoRespaldo: { type: String, trim: true, lowercase: true, default: "" },
    telefono: { type: String, trim: true, default: "" },
    preferenciasAlertas: {
      whatsapp: { type: Boolean, default: true },
      correoCorporativo: { type: Boolean, default: true },
      correoRespaldo: { type: Boolean, default: true },
      soloCriticas: { type: Boolean, default: false }
    },
    rol: {
      type: String,
      enum: [
        "ADMIN",
        "SUPERINTENDENTE",
        "JEFE_PLANTA",
        "JEFE_TURNO",
        "ECM",
        "OPERADOR_LIDER",
        "OPERADOR",
        "SUPERVISOR",
        "OPERADOR_CALDERA",
        "OPERADOR_PLANTA",
        "SUPERVISION"
      ],
      required: true
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "ACTIVO", "BLOQUEADO", "INACTIVO"],
      default: "ACTIVO"
    },
    planta: { type: String, default: "PC1" },
    area: { type: String, enum: ["PC1", "PLANTA_AMPLIADA", "CALDERA", "MANTENCION", "LABORATORIO", "ADMINISTRACION", "OTROS"], default: "PC1", index: true },
    turno: { type: String, enum: ["", "39", "44", "ADMINISTRATIVO", "OTROS"], default: "", index: true },
    cargo: { type: String, trim: true, default: "" },
    jefaturaDirecta: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    conductorAutorizado: { type: Boolean, default: false, index: true },
    licenciaInterna: {
      numero: { type: String, trim: true, default: "" },
      fechaVencimiento: { type: Date, default: null },
      estado: { type: String, enum: ["VIGENTE", "POR_VENCER", "VENCIDA", "NO_REGISTRADA"], default: "NO_REGISTRADA" }
    },
    licenciaInternaVigente: { type: Boolean, default: false, index: true },
    fechaVencimientoLicenciaInterna: { type: Date, default: null },
    habilitadoChecklistCamioneta: { type: Boolean, default: false, index: true },
    camionetaAsignada: { type: mongoose.Schema.Types.ObjectId, ref: "CamionetaAsignada", default: null },
    modulosPermitidos: { type: [String], default: [] },
    passwordHash: { type: String, required: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastFailedLogin: { type: Date, default: null },
    debeCambiarPassword: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
    fechaCreacion: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

userSchema.index({ lockUntil: 1 });

export default mongoose.model("User", userSchema);
