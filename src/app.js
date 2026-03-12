import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import { corsOptions } from "./config/cors.js";

import authRoutes from "./routes/authRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";

import { requireAuth } from "./middlewares/authJwt.js";

import bitacoraRoutes from "./routes/bitacoraRoutes.js";
import checklistRoutes from "./routes/checklistRoutes.js";
import registroOperacionRoutes from "./routes/registroOperacionRoutes.js";
import detalleBitacoraRoutes from "./routes/detalleBitacoraRoutes.js";
import cierreTurnoRoutes from "./routes/cierreTurnoRoutes.js";
import reportePdfRoutes from "./routes/reportePdfRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.disable("etag");

/* =========================================
   CONFIGURACIÓN BASE
========================================= */

if (String(process.env.TRUST_PROXY || "").toLowerCase() === "true") {
  app.set("trust proxy", 1);
}

/* =========================================
   MIDDLEWARES
========================================= */

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev")
  );
}

app.use(cors(corsOptions()));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* =========================================
   STATIC
========================================= */

app.use("/uploads", express.static(path.join(__dirname, "uploads")));



/* =========================================
   HEALTH & ROOT
========================================= */

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "bitacora-caldera-api" });
});

app.get("/", (req, res) => {
  res.send("🚂🔥 API Bitácora funcionando correctamente");
});

/* =========================================
   RUTAS PÚBLICAS
========================================= */

app.use("/api/auth", authRoutes);

/* =========================================
   🔥 RUTAS PROTEGIDAS (JWT GLOBAL)
   Se aplica requireAuth UNA SOLA VEZ
========================================= */

app.use("/api", requireAuth);

app.use("/api/users", usersRoutes);


app.use("/api/bitacoras", checklistRoutes);
app.use("/api/bitacoras", registroOperacionRoutes);
app.use("/api/bitacoras", detalleBitacoraRoutes);
app.use("/api/bitacoras", cierreTurnoRoutes);
app.use("/api/bitacoras", reportePdfRoutes);

app.use("/api/bitacoras", bitacoraRoutes);

/* =========================================
   404
========================================= */

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

/* =========================================
   ERROR GLOBAL
========================================= */

app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);
  res.status(500).json({ message: "Error interno del servidor" });
});

export default app;