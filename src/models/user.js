// src/models/user.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    rol: { type: String, enum: ["ADMIN", "OPERADOR", "SUPERVISOR"], required: true },
    passwordHash: { type: String, required: true },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
