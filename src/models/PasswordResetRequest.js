import mongoose from "mongoose";

const passwordResetRequestSchema = new mongoose.Schema(
  {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    nombreUsuario: { type: String, default: "" },
    username: { type: String, default: "", index: true },
    email: { type: String, default: "", index: true },
    operadorId: { type: String, default: "", index: true },
    rol: { type: String, default: "" },
    planta: { type: String, default: "" },
    estado: {
      type: String,
      enum: ["PENDIENTE", "APROBADO", "RECHAZADO"],
      default: "PENDIENTE",
      index: true
    },
    solicitadoEn: { type: Date, default: Date.now, index: true },
    resueltoEn: { type: Date, default: null },
    resueltoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resueltoPorNombre: { type: String, default: "" },
    observacion: { type: String, default: "" }
  },
  { timestamps: true }
);

passwordResetRequestSchema.index({ estado: 1, solicitadoEn: -1 });

export default mongoose.model("PasswordResetRequest", passwordResetRequestSchema);
