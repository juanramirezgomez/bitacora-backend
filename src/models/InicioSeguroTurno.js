import mongoose from "mongoose";

const inicioSeguroTurnoSchema = new mongoose.Schema(
  {
    operador: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    operadorNombre: { type: String, trim: true, required: true },
    operadorId: { type: String, trim: true, uppercase: true, required: true },
    rol: { type: String, trim: true, default: "" },
    planta: { type: String, trim: true, default: "PC1" },
    turno: { type: String, enum: ["DIA", "NOCHE"], required: true },
    fechaTurno: { type: String, required: true },
    fecha: { type: Date, default: Date.now },
    respuestas: {
      estadoAnimo: { type: String, trim: true, required: true },
      descanso: { type: String, trim: true, required: true },
      condicionFisica: { type: String, trim: true, required: true },
      concentracionMental: { type: String, trim: true, required: true }
    },
    confirmaApto: { type: Boolean, required: true },
    alertaPreventiva: { type: Boolean, default: false }
  },
  { timestamps: true }
);

inicioSeguroTurnoSchema.index({ operador: 1, turno: 1, fechaTurno: 1 }, { unique: true });
inicioSeguroTurnoSchema.index({ operadorId: 1, createdAt: -1 });

export default mongoose.model("InicioSeguroTurno", inicioSeguroTurnoSchema);
