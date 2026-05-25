import mongoose from "mongoose";

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];
const ESTADOS = ["ABIERTA", "EN_PROCESO", "RESUELTA", "CERRADA"];

const fotoSchema = new mongoose.Schema(
  {
    nombre: { type: String, trim: true, default: "" },
    ruta: { type: String, trim: true, default: "" },
    fecha: { type: Date, default: null }
  },
  { _id: false }
);

const alertaCamionetaSchema = new mongoose.Schema(
  {
    patente: { type: String, trim: true, uppercase: true, index: true, default: "" },
    checklistId: { type: mongoose.Schema.Types.ObjectId, ref: "ChecklistCamioneta", required: true, index: true },
    tipo: { type: String, trim: true, required: true, index: true },
    descripcion: { type: String, trim: true, required: true },
    prioridad: { type: String, enum: PRIORIDADES, default: "MEDIA", index: true },
    estado: { type: String, enum: ESTADOS, default: "ABIERTA", index: true },
    fechaCreacion: { type: Date, default: Date.now, index: true },
    fechaResolucion: { type: Date, default: null },
    fechaCierre: { type: Date, default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resueltoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cerradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    responsable: { type: String, trim: true, default: "" },
    operador: { type: String, trim: true, default: "" },
    solucion: { type: String, trim: true, default: "" },
    observaciones: { type: String, trim: true, default: "" },
    fotos: { type: [fotoSchema], default: [] },
    activo: { type: Boolean, default: true },
    origen: { type: String, trim: true, default: "CHECKLIST_CAMIONETA" },
    dedupeKey: { type: String, trim: true, required: true, unique: true }
  },
  { timestamps: true }
);

alertaCamionetaSchema.index({ estado: 1, prioridad: 1, fechaCreacion: -1 });
alertaCamionetaSchema.index({ patente: 1, estado: 1, fechaCreacion: -1 });
alertaCamionetaSchema.index({ checklistId: 1, estado: 1 });

export default mongoose.model("AlertaCamioneta", alertaCamionetaSchema);
export { PRIORIDADES, ESTADOS };
