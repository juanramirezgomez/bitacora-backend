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
    planta: { type: String, trim: true, default: "PC1" },
    area: { type: String, trim: true, default: "PC1", index: true },
    turno: { type: String, trim: true, default: "", index: true },
    cargo: { type: String, trim: true, default: "" },
    licenciaClaseB: { type: Boolean, default: false, index: true },
    fechaVencimientoLicenciaB: { type: Date, default: null },
    // Mixed mantiene compatibilidad con usuarios historicos que tenian licenciaInterna como objeto.
    licenciaInterna: { type: mongoose.Schema.Types.Mixed, default: false, index: true },
    fechaVencimientoLicenciaInterna: { type: Date, default: null },
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
