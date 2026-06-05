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
import checklistCamionetaRoutes from "./routes/checklistCamionetaRoutes.js";
import bitacoraDiariaRoutes from "./routes/bitacoraDiariaRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import registroDatosRoutes from "./routes/registroDatosRoutes.js";
import inicioSeguroRoutes from "./routes/inicioSeguroRoutes.js";
import operationalAuditRoutes from "./routes/operationalAuditRoutes.js";
import alertasRoutes from "./routes/alertasRoutes.js";
import systemHealthRoutes from "./routes/systemHealthRoutes.js";
import systemBackupRoutes from "./routes/systemBackupRoutes.js";
import executiveReportsRoutes from "./routes/executiveReportsRoutes.js";
import dashboardEjecutivoRoutes from "./routes/dashboardEjecutivoRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import organizationalRoutes from "./routes/organizationalRoutes.js";
import emailConfigRoutes from "./routes/emailConfigRoutes.js";

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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
  res.json({ ok: true, service: "operaciones-litio-api" });
});

app.get("/", (req, res) => {
  res.send("API Superintendencia Operaciones Litio funcionando correctamente");
});

/* =========================================
   RUTAS PúBLICAS
========================================= */

app.use("/api/auth", authRoutes);

/* =========================================
   🔥 RUTAS PROTEGIDAS (JWT GLOBAL)
   Se aplica requireAuth UNA SOLA VEZ
========================================= */

app.use("/api", requireAuth);

app.use("/api/users", usersRoutes);

app.use("/api/checklist-camionetas", checklistCamionetaRoutes);
app.use("/api/bitacoras-diarias", bitacoraDiariaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/alertas", alertasRoutes);
app.use("/api/registro-datos", registroDatosRoutes);
app.use("/api/inicio-seguro", inicioSeguroRoutes);
app.use("/api/auditoria-operacional", operationalAuditRoutes);
app.use("/api/system-health", systemHealthRoutes);
app.use("/api/system-backups", systemBackupRoutes);
app.use("/api/executive-reports", executiveReportsRoutes);
app.use("/api/dashboard-ejecutivo", dashboardEjecutivoRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/organizacion", organizationalRoutes);
app.use("/api", emailConfigRoutes);

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
