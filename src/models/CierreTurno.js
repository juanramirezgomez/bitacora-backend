import mongoose from "mongoose";

const cierreTurnoSchema = new mongoose.Schema(
  {
    bitacoraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bitacora",
      required: true,
      index: true,
      unique: true, // ✅ 1 cierre por bitácora
    },

    recepcionCombustible: { type: String, enum: ["SI", "NO"], required: true },
    litrosCombustible: { type: Number }, // requerido si recepcionCombustible=SI

    tk28EnServicio: { type: String, enum: ["SI", "NO"], required: true },
    tk28Porcentaje: { type: Number }, // requerido si tk28EnServicio=SI

    comentariosFinales: { type: String, default: "" },

    // firma en base64 (dataURL) para PDF
    firmaBase64: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("CierreTurno", cierreTurnoSchema);
