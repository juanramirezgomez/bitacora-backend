import mongoose from "mongoose";

const bitacoraSchema = new mongoose.Schema(
  {
    operador: {
      type: String,
      required: true,
    },

    turno: {
      type: String,
      required: true,
    },

    turnoNumero: {
      type: String,
      required: true,
    },

    estado: {
      type: String,
      enum: ["ABIERTA", "CERRADA"],
      default: "ABIERTA",
    },

    fechaInicio: {
      type: Date,
      default: Date.now,
    },

    fechaCierre: {
      type: Date,
    },

    // 🔥 NUEVOS CAMPOS PDF
    pdfGenerado: {
      type: Boolean,
      default: false,
    },

    pdfPath: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Bitacora", bitacoraSchema);
