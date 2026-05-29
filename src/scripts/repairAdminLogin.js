import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.js";

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) throw new Error("Falta MONGODB_URI en .env");

  await mongoose.connect(MONGODB_URI);

  const passwordHash = await bcrypt.hash("Admin1234!", 10);
  const admin = await User.findOneAndUpdate(
    { username: "admin" },
    {
      $set: {
        username: "admin",
        operadorId: "ADMIN01",
        email: "admin@novandino.local",
        correoCorporativo: "admin@novandino.local",
        nombre: "Juan Admin",
        rol: "ADMIN",
        estado: "ACTIVO",
        activo: true,
        planta: "PC1",
        modulosPermitidos: ["BITACORA_CALDERA", "CHECKLIST_CAMIONETA", "PLANTA_PC1"],
        passwordHash
      },
      $setOnInsert: {
        fechaCreacion: new Date()
      }
    },
    { returnDocument: "after", upsert: true }
  ).select("username operadorId email nombre rol estado activo");

  console.log("ADMIN login reparado:", {
    username: admin.username,
    operadorId: admin.operadorId,
    email: admin.email,
    rol: admin.rol,
    estado: admin.estado,
    activo: admin.activo
  });

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Error reparando ADMIN:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
