import mongoose from "mongoose";

const camionetaAsignadaSchema = new mongoose.Schema(
  {
    patente: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    marca: { type: String, trim: true, default: "TOYOTA" },
    modelo: { type: String, trim: true, default: "HILUX" },
    color: { type: String, trim: true, default: "ROJO" },
    area: {
      type: String,
      enum: ["PC1", "PLANTA_AMPLIADA", "CALDERA", "MANTENCION", "LABORATORIO", "ADMINISTRACION", "OTROS"],
      default: "PC1",
      index: true
    },
    turno: { type: String, enum: ["", "39", "44", "ADMINISTRATIVO", "OTROS"], default: "", index: true },
    usuarioResponsable: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    activo: { type: Boolean, default: true, index: true },
    observacion: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

camionetaAsignadaSchema.index({ area: 1, turno: 1, activo: 1 });

export default mongoose.model("CamionetaAsignada", camionetaAsignadaSchema);
