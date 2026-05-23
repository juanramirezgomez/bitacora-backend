import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initRealtime } from "./services/realtimeService.js";

const PORT = process.env.PORT || 4000;

const logRuntimeConfig = () => {
  console.log("CONFIG RENDER/ENV:", {
    nodeEnv: process.env.NODE_ENV || "development",
    mongoUriExists: Boolean(process.env.MONGODB_URI),
    jwtSecretExists: Boolean(process.env.JWT_SECRET),
    resendApiKeyExists: Boolean(process.env.RESEND_API_KEY),
    resendApiKeyPrefix: process.env.RESEND_API_KEY ? `${String(process.env.RESEND_API_KEY).slice(0, 8)}...` : null,
    emailFrom: process.env.EMAIL_FROM || null,
    twilioSidExists: Boolean(process.env.TWILIO_ACCOUNT_SID),
    twilioTokenExists: Boolean(process.env.TWILIO_AUTH_TOKEN),
    twilioFromExists: Boolean(process.env.TWILIO_WHATSAPP_FROM),
    corsOrigins: process.env.CORS_ORIGINS || null
  });
};

async function start() {
  try {
    logRuntimeConfig();
    await connectDB();
    const server = http.createServer(app);
    initRealtime(server);
    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error iniciando servidor:", err?.message || err);
    process.exit(1);
  }
}

start();
