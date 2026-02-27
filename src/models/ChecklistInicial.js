import mongoose from "mongoose";

const checklistInicialSchema = new mongoose.Schema(
  {
    bitacoraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bitacora",
      required: true,
      index: true
    },

    calderaHurst: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    bombaAlimentacionAgua: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    bombaPetroleo: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    nivelAguaTuboNivel: {
      type: String,
      enum: ["BAJO", "NORMAL", "LLENO"],
      required: true
    },

    purgaSuperficie: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    bombaDosificadoraQuimicos: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    trenGas: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    ablandadores: {
      type: String,
      enum: ["EN_SERVICIO", "FUERA_DE_SERVICIO"],
      required: true
    },

    observacionesIniciales: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

export default mongoose.model("ChecklistInicial", checklistInicialSchema);
