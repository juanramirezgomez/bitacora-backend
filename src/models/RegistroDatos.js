import mongoose from "mongoose";

const TURNOS = ["TURNO_A", "TURNO_B"];
const HORARIOS_TURNO = {
  TURNO_A: ["09:00", "13:00", "17:00"],
  TURNO_B: ["21:00", "01:00", "05:00"]
};

const VARIABLES_REGISTRO_DATOS = [
  "Salmuera a TK R2",
  "BB-033/35 (Alim FB)",
  "BBA-018",
  "BBA vacio",
  "Lavado de tela",
  "Agua de sello",
  "Lavado queue",
  "BBA-207 Krogh",
  "BBA-11 Krogh",
  "BBA-014 Krogh",
  "BBA-054",
  "Sumidero",
  "Flujometro PAM",
  "CT-080",
  "CT-010",
  "TK-70 a TK-69",
  "TK-70 a TK-R2",
  "TK-001"
];

const evidenciaOcrSchema = new mongoose.Schema(
  {
    variable: { type: String, trim: true, default: "" },
    imagen: { type: String, default: "" },
    textoDetectado: { type: String, trim: true, default: "" },
    fecha: { type: Date, default: Date.now }
  },
  { _id: false }
);

const lecturaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    valor: { type: Number, required: true, min: 0 },
    diferencia: { type: Number, default: 0 },
    valorAnterior: { type: Number, default: null },
    observacion: { type: String, trim: true, default: "" },
    alertaPreparada: {
      activa: { type: Boolean, default: false },
      tipo: { type: String, trim: true, default: "" },
      mensaje: { type: String, trim: true, default: "" }
    }
  },
  { _id: false }
);

const registroDatosSchema = new mongoose.Schema(
  {
    planta: { type: String, trim: true, default: "PAM_AMPLIADA" },
    fecha: { type: Date, required: true },
    fechaKey: { type: String, required: true, trim: true },
    fechaHora: { type: Date, required: true },
    turno: { type: String, enum: TURNOS, required: true },
    hora: { type: String, required: true, trim: true },
    operador: { type: String, trim: true, default: "" },
    operadorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lecturas: { type: [lecturaSchema], default: [] },
    evidenciasOcr: { type: [evidenciaOcrSchema], default: [] },
    observacionesGenerales: { type: String, trim: true, default: "" },
    origen: { type: String, enum: ["MANUAL", "OCR", "MIXTO"], default: "MANUAL" },
    estado: { type: String, enum: ["REGISTRADO", "OBSERVADO"], default: "REGISTRADO" },
    activo: { type: Boolean, default: true },
    eliminado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

registroDatosSchema.index({ fechaKey: 1, turno: 1, hora: 1 }, { unique: true });
registroDatosSchema.index({ fechaHora: -1 });
registroDatosSchema.index({ turno: 1, fechaHora: -1 });
registroDatosSchema.index({ operadorId: 1, fechaHora: -1 });
registroDatosSchema.index({ "lecturas.nombre": 1, fechaHora: -1 });
registroDatosSchema.index({ eliminado: 1, fechaHora: -1 });

export default mongoose.model("RegistroDatos", registroDatosSchema);
export { TURNOS, HORARIOS_TURNO, VARIABLES_REGISTRO_DATOS };
