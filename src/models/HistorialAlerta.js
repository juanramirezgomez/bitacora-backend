import mongoose from "mongoose";

const destinatarioSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    nombre: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    correoCorporativo: { type: String, trim: true, lowercase: true, default: "" },
    correoRespaldo: { type: String, trim: true, lowercase: true, default: "" },
    telefono: { type: String, trim: true, default: "" },
    rol: { type: String, trim: true, default: "" },
    estadoUsuario: { type: String, trim: true, default: "" },
    motivo: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const historialAlertaSchema = new mongoose.Schema(
  {
    tipo: { type: String, required: true, trim: true },
    prioridad: { type: String, required: true, trim: true },
    mensaje: { type: String, required: true, trim: true },
    destinatarios: { type: [destinatarioSchema], default: [] },
    canal: {
      type: String,
      enum: [
        "correo",
        "correoCorporativo",
        "correoRespaldo",
        "whatsapp",
        "EMAIL_CORPORATIVO",
        "EMAIL_RESPALDO",
        "WHATSAPP"
      ],
      required: true
    },
    estado: { type: String, enum: ["enviado", "omitido", "error"], required: true },
    estadoOperacional: { type: String, enum: ["ABIERTA", "RESUELTA"], default: "ABIERTA" },
    provider: { type: String, trim: true, default: "" },
    messageId: { type: String, trim: true, default: "" },
    from: { type: String, trim: true, default: "" },
    resueltaPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    responsableResolucion: { type: String, trim: true, default: "" },
    observacionResolucion: { type: String, trim: true, default: "" },
    fechaResolucion: { type: Date, default: null },
    error: { type: String, trim: true, default: "" },
    checklistId: { type: mongoose.Schema.Types.ObjectId, ref: "ChecklistCamioneta", default: null },
    patente: { type: String, trim: true, uppercase: true, default: "" },
    operador: { type: String, trim: true, default: "" },
    turnoChecklist: { type: String, trim: true, default: "" },
    usuariosNotificados: { type: [destinatarioSchema], default: [] },
    canalUtilizado: { type: String, trim: true, default: "" },
    fecha: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

historialAlertaSchema.index({ checklistId: 1, tipo: 1, canal: 1, createdAt: -1 });
historialAlertaSchema.index({ estado: 1, prioridad: 1, createdAt: -1 });
historialAlertaSchema.index({ estadoOperacional: 1, prioridad: 1, createdAt: -1 });
historialAlertaSchema.index({ patente: 1, createdAt: -1 });
historialAlertaSchema.index({ turnoChecklist: 1, createdAt: -1 });

export default mongoose.model("HistorialAlerta", historialAlertaSchema);
