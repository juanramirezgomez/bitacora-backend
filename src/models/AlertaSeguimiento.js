import mongoose from "mongoose";

const evidenciaSchema = new mongoose.Schema(
  {
    nombre: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    tipo: { type: String, enum: ["ANTES", "DURANTE", "DESPUES", "GENERAL"], default: "GENERAL" },
    fecha: { type: Date, default: Date.now },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    usuarioNombre: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const alertaSeguimientoSchema = new mongoose.Schema(
  {
    alertaId: { type: mongoose.Schema.Types.ObjectId, ref: "AlertaCamioneta", required: true, index: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    nombreUsuario: { type: String, trim: true, default: "" },
    rol: { type: String, trim: true, default: "" },
    comentario: { type: String, trim: true, default: "" },
    evidencias: { type: [evidenciaSchema], default: [] },
    tipoEvento: {
      type: String,
      enum: ["COMENTARIO", "EVIDENCIA", "CAMBIO_ESTADO", "ASIGNACION", "ESCALAMIENTO", "RESOLUCION_AUTOMATICA"],
      default: "COMENTARIO",
      index: true
    },
    estadoAnterior: { type: String, trim: true, default: "" },
    estadoNuevo: { type: String, trim: true, default: "" },
    fecha: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

alertaSeguimientoSchema.index({ alertaId: 1, fecha: -1 });

export default mongoose.model("AlertaSeguimiento", alertaSeguimientoSchema);
