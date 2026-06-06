import mongoose from "mongoose";

const systemBackupSchema = new mongoose.Schema(
  {
    nombre: { type: String, trim: true, default: "", index: true },
    tipo: {
      type: String,
      enum: ["MANUAL", "PROGRAMADO"],
      required: true,
      index: true
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "EN_PROCESO", "COMPLETADO", "ERROR"],
      required: true,
      index: true
    },
    fechaInicio: { type: Date, required: true, index: true },
    fechaFin: { type: Date, default: null },
    duracion: { type: Number, default: 0 },
    tamano: { type: String, default: "" },
    tamanoBytes: { type: Number, default: 0 },
    hashSha256: { type: String, default: "" },
    validado: { type: Boolean, default: false },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    usuarioNombre: { type: String, default: "" },
    observacion: { type: String, default: "" },
    archivo: { type: String, default: "" },
    origen: { type: String, default: "OPERACIONES_LITIO" },
    resultado: {
      type: String,
      enum: ["PENDIENTE", "OK", "ERROR"],
      required: true,
      index: true
    },
    ultimaRestauracion: { type: Date, default: null },
    restauradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    restauradoPorNombre: { type: String, default: "" },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

systemBackupSchema.index({ fechaInicio: -1 });
systemBackupSchema.index({ estado: 1, resultado: 1, fechaInicio: -1 });

export default mongoose.model("SystemBackup", systemBackupSchema);
