import mongoose from "mongoose";

const ESTADOS_CHECKLIST = ["BORRADOR", "FINALIZADO", "REVISADO"];
const ESTADOS_DOCUMENTO = ["VIGENTE", "VENCIDO", "NO_APLICA"];
const ESTADOS_INSPECCION = ["BUENO", "MALO", "NA"];
const ESTADOS_RESPUESTA = ["SI", "NO", "NA"];

const documentoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    fechaVencimiento: { type: Date, default: null },
    estado: { type: String, enum: ESTADOS_DOCUMENTO, default: "NO_APLICA" }
  },
  { _id: false }
);

const itemInspeccionSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    estado: { type: String, enum: ESTADOS_INSPECCION, default: "NA" },
    observacion: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const itemRespuestaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    estado: { type: String, enum: ESTADOS_RESPUESTA, default: "NA" },
    observacion: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const fotoObservacionSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    ruta: { type: String, required: true, trim: true },
    fecha: { type: Date, default: Date.now },
    subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const revisionCarroceriaSchema = new mongoose.Schema(
  {
    abolladura: { type: Boolean, default: false },
    raya: { type: Boolean, default: false },
    picadura: { type: Boolean, default: false },
    observacionesCarroceria: { type: String, trim: true, default: "" },
    imagenMarcada: { type: String, default: "" }
  },
  { _id: false }
);

const checklistCamionetaSchema = new mongoose.Schema(
  {
    planta: { type: String, default: "PC1", trim: true },
    estado: { type: String, enum: ESTADOS_CHECKLIST, default: "BORRADOR" },
    aptaOperacion: { type: Boolean, default: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fechaCreacion: { type: Date, default: Date.now },
    fechaActualizacion: { type: Date, default: Date.now },
    fechaRevision: { type: Date, default: null },
    activo: { type: Boolean, default: true },
    eliminado: { type: Boolean, default: false },

    tipoVehiculo: { type: String, trim: true, default: "" },
    modelo: { type: String, trim: true, default: "" },
    kilometrajeHorometro: { type: String, trim: true, default: "" },
    fechaUltimaMantencion: { type: Date, default: null },
    marca: { type: String, trim: true, default: "" },
    patente: { type: String, trim: true, uppercase: true, default: "" },
    color: { type: String, trim: true, default: "" },
    fechaProximaMantencion: { type: Date, default: null },

    conductorResponsable: { type: String, trim: true, default: "" },
    areaTrabajo: { type: String, trim: true, default: "" },
    fechaInspeccion: { type: Date, default: null },
    fechaProgramada: { type: Date, default: null, index: true },
    fechaRealizacion: { type: Date, default: null, index: true },
    checklistAtrasado: { type: Boolean, default: false, index: true },
    cumplimientoEstado: {
      type: String,
      enum: ["PROGRAMADO", "REALIZADO", "ATRASADO"],
      default: "PROGRAMADO",
      index: true
    },
    horaInspeccion: { type: String, trim: true, default: "" },
    turno: { type: String, enum: ["DIA", "NOCHE", ""], trim: true, default: "" },
    turnoNumero: { type: String, trim: true, default: "" },

    documentacion: { type: [documentoSchema], default: [] },
    aspectosInspeccionar: { type: [itemInspeccionSchema], default: [] },
    estadoCamioneta: { type: [itemInspeccionSchema], default: [] },
    frenosDireccion: { type: [itemInspeccionSchema], default: [] },
    luces: { type: [itemInspeccionSchema], default: [] },
    sistemaAsistenciaConductor: { type: [itemRespuestaSchema], default: [] },
    encuestaFatigaSomnolencia: { type: [itemRespuestaSchema], default: [] },

    abolladura: { type: Boolean, default: false },
    raya: { type: Boolean, default: false },
    picadura: { type: Boolean, default: false },
    observacionesCarroceria: { type: String, trim: true, default: "" },
    imagenReferencialVehiculo: { type: String, default: "" },
    marcasDanio: { type: Array, default: [] },
    revisionCarroceria: { type: revisionCarroceriaSchema, default: () => ({}) },

    observacionesDetectadas: { type: String, trim: true, default: "" },
    observacionesGenerales: { type: String, trim: true, default: "" },
    fotosObservaciones: { type: [fotoObservacionSchema], default: [] },

    firmaConductor: { type: String, default: "" },
    nombreConductor: { type: String, trim: true, default: "" },
    firmaRevisor: { type: String, default: "" },
    nombreRevisor: { type: String, trim: true, default: "" },

    nombreRealizadoPor: { type: String, trim: true, default: "" },
    cargoRealizadoPor: { type: String, trim: true, default: "" },
    fechaRealizadoPor: { type: Date, default: null },
    firmaRealizadoPor: { type: String, default: "" },

    nombreRevisadoPor: { type: String, trim: true, default: "" },
    cargoRevisadoPor: { type: String, trim: true, default: "" },
    fechaRevisadoPor: { type: Date, default: null },
    firmaRevisadoPor: { type: String, default: "" },
    firmaRevision: { type: String, default: "" },
    observacionRevision: { type: String, trim: true, default: "" },

    aptitudOperacion: {
      type: String,
      enum: ["APTA", "NO_APTA"],
      default: "APTA"
    }
  },
  { timestamps: true }
);

checklistCamionetaSchema.index({ patente: 1, fechaInspeccion: -1 });
checklistCamionetaSchema.index({ patente: 1 });
checklistCamionetaSchema.index({ estado: 1 });
checklistCamionetaSchema.index({ fechaInspeccion: -1 });
checklistCamionetaSchema.index({ fechaCreacion: -1 });
checklistCamionetaSchema.index({ creadoPor: 1 });
checklistCamionetaSchema.index({ turno: 1, turnoNumero: 1, fechaInspeccion: -1 });
checklistCamionetaSchema.index({ estado: 1, creadoPor: 1 });
checklistCamionetaSchema.index({ eliminado: 1, estado: 1, fechaInspeccion: -1 });
checklistCamionetaSchema.index({ conductorResponsable: 1, planta: 1, eliminado: 1 });
checklistCamionetaSchema.index({ patente: 1, fechaProgramada: -1, eliminado: 1 });
checklistCamionetaSchema.index({ cumplimientoEstado: 1, fechaProgramada: -1 });

checklistCamionetaSchema.pre("save", function updateDates() {
  this.fechaActualizacion = new Date();
});

export default mongoose.model("ChecklistCamioneta", checklistCamionetaSchema);
export { ESTADOS_CHECKLIST, ESTADOS_DOCUMENTO, ESTADOS_INSPECCION, ESTADOS_RESPUESTA };
