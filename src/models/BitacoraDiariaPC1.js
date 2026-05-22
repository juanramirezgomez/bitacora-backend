import mongoose from "mongoose";

const AREAS_PC1 = ["PLANTA_ANTIGUA", "PLANTA_AMPLIADA", "CENTRIFUGA"];
const TURNOS = ["DIA", "NOCHE"];
const ESTADOS_BITACORA_DIARIA = ["ABIERTA", "CERRADA"];
const TIPOS_NOVEDAD = ["NORMAL", "INCIDENTE", "MANTENCION", "SEGURIDAD", "OPERACION"];

const archivoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    ruta: { type: String, required: true, trim: true },
    tipo: { type: String, trim: true, default: "" },
    fecha: { type: Date, default: Date.now },
    subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const novedadSchema = new mongoose.Schema(
  {
    hora: { type: String, required: true, trim: true },
    texto: { type: String, required: true, trim: true },
    tipo: { type: String, enum: TIPOS_NOVEDAD, default: "NORMAL" },
    evidenciasFotos: { type: [archivoSchema], default: [] },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fechaRegistro: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

const bitacoraDiariaPC1Schema = new mongoose.Schema(
  {
    planta: { type: String, default: "PC1", trim: true },
    area: { type: String, enum: AREAS_PC1, required: true },
    fecha: { type: Date, required: true },
    turno: { type: String, enum: TURNOS, required: true },
    turnoNumero: { type: String, required: true, trim: true },
    operador: { type: String, required: true, trim: true },
    operadorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    supervisor: { type: String, trim: true, default: "" },
    estado: { type: String, enum: ESTADOS_BITACORA_DIARIA, default: "ABIERTA" },
    novedades: { type: [novedadSchema], default: [] },
    archivosAdjuntos: { type: [archivoSchema], default: [] },
    fechaCreacion: { type: Date, default: Date.now },
    fechaActualizacion: { type: Date, default: Date.now },
    fechaCierre: { type: Date, default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cerradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    activo: { type: Boolean, default: true },
    eliminado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

bitacoraDiariaPC1Schema.index({ fecha: -1, area: 1, turno: 1, estado: 1 });
bitacoraDiariaPC1Schema.index({ creadoPor: 1, estado: 1, eliminado: 1 });
bitacoraDiariaPC1Schema.index({ operador: 1, planta: 1, eliminado: 1 });

bitacoraDiariaPC1Schema.pre("save", function updateDates() {
  this.fechaActualizacion = new Date();
});

export default mongoose.model("BitacoraDiariaPC1", bitacoraDiariaPC1Schema);
export { AREAS_PC1, TURNOS, ESTADOS_BITACORA_DIARIA, TIPOS_NOVEDAD };
