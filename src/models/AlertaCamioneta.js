import mongoose from "mongoose";

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];
const ESTADOS = ["ABIERTA", "ASIGNADA", "EN_PROCESO", "RESUELTA", "CERRADA"];

const hallazgoSchema = new mongoose.Schema(
  {
    categoria: { type: String, trim: true, required: true },
    tipo: { type: String, trim: true, default: "" },
    prioridad: { type: String, enum: PRIORIDADES, default: "MEDIA" },
    titulo: { type: String, trim: true, default: "" },
    detalle: { type: String, trim: true, default: "" },
    observacion: { type: String, trim: true, default: "" },
    fechaVencimiento: { type: Date, default: null },
    diasRestantes: { type: Number, default: null }
  },
  { _id: false }
);

const fotoSchema = new mongoose.Schema(
  {
    nombre: { type: String, trim: true, default: "" },
    ruta: { type: String, trim: true, default: "" },
    tipo: { type: String, enum: ["ANTES", "DURANTE", "DESPUES", "GENERAL"], default: "GENERAL" },
    fecha: { type: Date, default: null },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    usuarioNombre: { type: String, trim: true, default: "" }
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
    fechaAsignacion: { type: Date, default: null },
    fechaResolucion: { type: Date, default: null },
    fechaCierre: { type: Date, default: null },
    fechaCompromiso: { type: Date, default: null, index: true },
    fechaUltimoMovimiento: { type: Date, default: Date.now, index: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resueltoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cerradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    responsableId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    responsableNombre: { type: String, trim: true, default: "" },
    responsableRol: { type: String, trim: true, default: "" },
    responsable: { type: String, trim: true, default: "" },
    operador: { type: String, trim: true, default: "" },
    accionCorrectiva: { type: String, trim: true, default: "" },
    solucion: { type: String, trim: true, default: "" },
    comentarioCierre: { type: String, trim: true, default: "" },
    observaciones: { type: String, trim: true, default: "" },
    observacionesChecklist: { type: String, trim: true, default: "" },
    documentacionChecklist: { type: mongoose.Schema.Types.Mixed, default: () => [] },
    hallazgos: { type: [hallazgoSchema], default: [] },
    resumenHallazgos: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    resolucionAutomatica: { type: Boolean, default: false },
    fotos: { type: [fotoSchema], default: [] },
    escalada: { type: Boolean, default: false, index: true },
    nivelEscalamiento: { type: Number, default: 0 },
    fechaEscalamiento: { type: Date, default: null },
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
