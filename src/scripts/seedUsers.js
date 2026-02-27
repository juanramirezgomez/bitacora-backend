import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.js";

const MONGODB_URI = process.env.MONGODB_URI;

const users = [
  // ✅ ADMIN (dueño)
  { username: "admin", nombre: "Administrador", rol: "ADMIN", password: "Admin1234!" },

  // ✅ OPERADORES (4)
  { username: "jramirez", nombre: "Juan Ramirez", rol: "OPERADOR", password: "juanramirez" },
  { username: "hbustamante", nombre: "Hugo Bustamante", rol: "OPERADOR", password: "hugobustamante" },
  { username: "afarias", nombre: "Alejandro Farias", rol: "OPERADOR", password: "alejandrofarias" },
  { username: "hsanzana", nombre: "Hector Sanzana", rol: "OPERADOR", password: "hectorsanzana" },

  // ✅ SUPERVISORES (3)
  { username: "jortega", nombre: "Juan Ortega", rol: "SUPERVISOR", password: "juanortega" },
  { username: "pcastillo", nombre: "Pablo Castillo", rol: "SUPERVISOR", password: "pablocastillo" },
  { username: "irubilar", nombre: "Isabel Rubilar", rol: "SUPERVISOR", password: "isabelrubilar" },
];

async function run() {
  if (!MONGODB_URI) throw new Error("Falta MONGODB_URI en .env");

  await mongoose.connect(MONGODB_URI);
  console.log("✅ Mongo conectado");

  for (const u of users) {
    const exists = await User.findOne({ username: u.username });
    if (exists) {
      console.log(`↩️ ya existe: ${u.username}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 10);

    await User.create({
      username: u.username,
      nombre: u.nombre,
      rol: u.rol,
      passwordHash,
      activo: true,
    });

    console.log(`✅ creado: ${u.username} (${u.rol})`);
  }

  await mongoose.disconnect();
  console.log("✅ seed listo");
}

run().catch((e) => {
  console.error("❌ seed error:", e?.message || e);
  process.exit(1);
});
