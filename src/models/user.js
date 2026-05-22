// src/models/user.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, sparse: true, trim: true },
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
    modulosPermitidos: { type: [String], default: [] },
    passwordHash: { type: String, required: true },
    activo: { type: Boolean, default: true },
    fechaCreacion: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
