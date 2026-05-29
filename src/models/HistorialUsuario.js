import mongoose from "mongoose";

const historialUsuarioSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    usuarioSnapshot: {
      nombre: { type: String, default: "" },
      email: { type: String, default: "" },
      operadorId: { type: String, default: "" },
      rol: { type: String, default: "" },
      estado: { type: String, default: "" },
      planta: { type: String, default: "" }
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    actorSnapshot: {
      nombre: { type: String, default: "" },
      email: { type: String, default: "" },
      operadorId: { type: String, default: "" },
      rol: { type: String, default: "" }
    },
    accion: {
      type: String,
      enum: [
        "USUARIO_CREADO",
        "USUARIO_ACTUALIZADO",
        "ESTADO_CAMBIADO",
        "ROL_CAMBIADO",
        "PASSWORD_RESETEADA",
        "USUARIO_ELIMINADO"
      ],
      required: true,
      index: true
    },
    cambios: { type: Object, default: {} },
    comentario: { type: String, default: "" },
    fecha: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

historialUsuarioSchema.index({ usuario: 1, fecha: -1 });
historialUsuarioSchema.index({ actor: 1, fecha: -1 });

export default mongoose.model("HistorialUsuario", historialUsuarioSchema);
