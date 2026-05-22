import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 4000;

const logRuntimeConfig = () => {
  console.log("CONFIG RENDER/ENV:", {
    nodeEnv: process.env.NODE_ENV || "development",
    mongoUriExists: Boolean(process.env.MONGODB_URI),
    jwtSecretExists: Boolean(process.env.JWT_SECRET),
    smtpGmailEmail: process.env.SMTP_GMAIL_EMAIL || null,
    smtpGmailPassExists: Boolean(process.env.SMTP_GMAIL_PASSWORD),
    smtpGmailHost: process.env.SMTP_GMAIL_HOST || "smtp.gmail.com",
    twilioSidExists: Boolean(process.env.TWILIO_ACCOUNT_SID),
    twilioFromExists: Boolean(process.env.TWILIO_WHATSAPP_FROM),
    corsOrigins: process.env.CORS_ORIGINS || null
  });
};

async function start() {
  try {
    logRuntimeConfig();
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error iniciando servidor:", err?.message || err);
    process.exit(1);
  }
}

start();
