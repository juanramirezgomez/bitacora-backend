import mongoose from "mongoose";

const parametroSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    unidad: { type: String, required: true },
    value: { type: Number, required: true }
  },
  { _id: false }
);

const registroOperacionSchema = new mongoose.Schema(
  {
    bitacoraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bitacora",
      required: true,
      index: true
    },

    hora: { type: String, required: true },

    parametros: {
      type: [parametroSchema],
      required: true
    },

    purgaDeFondo: {
      type: String,
      enum: ["SI", "NO"],
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("RegistroOperacion", registroOperacionSchema);
