import nodemailer from "nodemailer";
import { ALERT_PRIORITIES } from "../config/alertTemplates.js";

const boolEnv = (value) => String(value || "false").trim().toLowerCase() === "true";
const cleanEnv = (value) => String(value || "").trim();
const gmailPassword = () => String(process.env.SMTP_GMAIL_PASSWORD || "").replace(/\s+/g, "");
const verifiedProviders = new Map();

const smtpErrorSeguro = (error) => ({
  message: error?.message,
  code: error?.code,
  response: error?.response,
  responseCode: error?.responseCode,
  command: error?.command,
  stack: error?.stack
});

const cleanFrom = (value, fallbackEmail) => {
  const raw = cleanEnv(value);
  if (!raw) return fallbackEmail;
  if (raw.includes("<") && raw.includes(">")) return raw;

  const mailtoMatch = raw.match(/\[([^\]]+)\]\(mailto:([^)]+)\)/i);
  if (mailtoMatch) {
    return `NOVANDINO | GESTION OPERACIONAL <${mailtoMatch[2].trim()}>`;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return raw;
  if (fallbackEmail) return `${raw} <${fallbackEmail}>`;
  return raw;
};

const providerConfigs = () => {
  const gmailEmail = cleanEnv(process.env.SMTP_GMAIL_EMAIL);
  const microsoftEmail = cleanEnv(process.env.SMTP_EMAIL);

  return [
    {
      key: "gmail",
      label: "Gmail SMTP principal",
      host: cleanEnv(process.env.SMTP_GMAIL_HOST) || "smtp.gmail.com",
      port: Number(process.env.SMTP_GMAIL_PORT || 587),
      secure: boolEnv(process.env.SMTP_GMAIL_SECURE),
      user: gmailEmail,
      pass: gmailPassword(),
      from: cleanFrom(process.env.SMTP_GMAIL_FROM, gmailEmail)
    },
    {
      key: "microsoft365",
      label: "Microsoft 365 SMTP respaldo",
      host: cleanEnv(process.env.SMTP_HOST) || "smtp.office365.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: boolEnv(process.env.SMTP_SECURE),
      user: microsoftEmail,
      pass: cleanEnv(process.env.SMTP_PASSWORD),
      from: cleanFrom(process.env.SMTP_FROM, microsoftEmail)
    }
  ];
};

const usableProviders = () =>
  providerConfigs().filter((provider) =>
    Boolean(provider.host && provider.port && provider.user && provider.pass)
  );

export const emailConfigured = () => usableProviders().length > 0;

export const emailConfigStatus = () => ({
  gmail: Boolean(cleanEnv(process.env.SMTP_GMAIL_HOST) && cleanEnv(process.env.SMTP_GMAIL_EMAIL) && gmailPassword()),
  microsoft365: Boolean(cleanEnv(process.env.SMTP_HOST) && cleanEnv(process.env.SMTP_EMAIL) && cleanEnv(process.env.SMTP_PASSWORD)),
  principal: usableProviders()[0]?.key || null,
  smtpGmailHost: cleanEnv(process.env.SMTP_GMAIL_HOST) || "smtp.gmail.com",
  smtpGmailPort: Number(process.env.SMTP_GMAIL_PORT || 587),
  smtpGmailSecure: boolEnv(process.env.SMTP_GMAIL_SECURE),
  smtpGmailEmail: cleanEnv(process.env.SMTP_GMAIL_EMAIL) || null,
  smtpGmailPasswordExists: Boolean(gmailPassword()),
  smtpGmailPasswordLength: gmailPassword().length,
  smtpGmailFromExists: Boolean(cleanEnv(process.env.SMTP_GMAIL_FROM)),
  microsoftEmail: cleanEnv(process.env.SMTP_EMAIL) || null,
  microsoftPasswordExists: Boolean(cleanEnv(process.env.SMTP_PASSWORD))
});

const createTransporter = (provider) => nodemailer.createTransport({
  ...(provider.key === "gmail" ? { service: "gmail" } : {}),
  host: provider.host,
  port: provider.port,
  secure: provider.secure,
  requireTLS: !provider.secure,
  auth: {
    user: provider.user,
    pass: provider.pass
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000
});

const verifyTransporterOnce = async (provider, transporter) => {
  if (verifiedProviders.get(provider.key)) return true;

  try {
    await transporter.verify();
    verifiedProviders.set(provider.key, true);
    console.log(provider.key === "gmail" ? "✅ SMTP VERIFICADO GMAIL" : "✅ SMTP VERIFICADO MICROSOFT", {
      host: provider.host,
      user: provider.user
    });
    return true;
  } catch (error) {
    console.error(provider.key === "gmail" ? "❌ SMTP ERROR GMAIL" : "❌ SMTP ERROR MICROSOFT", smtpErrorSeguro(error));
    throw error;
  }
};

// FUTURO:
// soporte Microsoft Graph API corporativo. Microsoft 365 queda preparado como respaldo SMTP y futura migracion Graph.

export const buildAlertEmailHtml = ({ alerta, destinatario }) => {
  const priority = ALERT_PRIORITIES[alerta.prioridad] || ALERT_PRIORITIES.ALTA;
  const anomalies = (alerta.anomalias || [alerta.mensaje])
    .map((item) => `<li>${String(item)}</li>`)
    .join("");

  return `
  <div style="background:#07111f;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d7d8e8;">
      <div style="background:#461D77;color:#fff;padding:18px 22px;">
        <h1 style="margin:0;font-size:20px;">Alerta Checklist Camioneta</h1>
        <p style="margin:6px 0 0;font-size:13px;">Superintendencia Operaciones Litio - Planta PC1</p>
      </div>
      <div style="padding:22px;">
        <div style="display:inline-block;background:${priority.color};color:#fff;padding:6px 10px;border-radius:6px;font-weight:bold;font-size:12px;">
          Prioridad ${priority.label}
        </div>
        <h2 style="font-size:18px;margin:18px 0 8px;">${alerta.titulo}</h2>
        <p style="font-size:14px;line-height:1.5;">Hola ${destinatario.nombre || "equipo"}, se detecto una condicion que requiere revision operacional.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Patente</td><td style="padding:8px;border:1px solid #e5e7eb;">${alerta.patente || "-"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Operador</td><td style="padding:8px;border:1px solid #e5e7eb;">${alerta.operador || "-"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Fecha checklist</td><td style="padding:8px;border:1px solid #e5e7eb;">${alerta.fechaTexto || "-"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Tipo alerta</td><td style="padding:8px;border:1px solid #e5e7eb;">${alerta.tipo}</td></tr>
        </table>
        <h3 style="font-size:15px;margin:14px 0 8px;">Anomalias detectadas</h3>
        <ul style="font-size:14px;line-height:1.6;padding-left:20px;">${anomalies}</ul>
        <p style="font-size:12px;color:#64748b;margin-top:22px;">
          NOVANDINO | GESTION OPERACIONAL
        </p>
      </div>
    </div>
  </div>`;
};

export const sendEmailAlert = async ({ to, subject, html, text }) => {
  const destinatario = cleanEnv(to).toLowerCase();
  console.log("📧 INICIANDO EMAIL SERVICE", emailConfigStatus());
  console.log("SMTP EMAIL:", cleanEnv(process.env.SMTP_GMAIL_EMAIL) || null);
  console.log("SMTP PASS EXISTS:", Boolean(gmailPassword()));
  console.log("📧 ENVIANDO EMAIL", { destinatario, subject });

  if (!destinatario) {
    return { ok: false, canal: "email", estado: "omitido", destino: destinatario, motivo: "Destinatario vacio" };
  }

  const providers = usableProviders();
  if (!providers.length) {
    console.log("⚠️ Correo omitido: faltan variables SMTP Gmail y Microsoft 365", emailConfigStatus());
    return {
      ok: false,
      canal: "email",
      estado: "omitido",
      destino: destinatario,
      motivo: "Faltan SMTP_GMAIL_* o SMTP_*"
    };
  }

  const errores = [];

  for (const provider of providers) {
    try {
      console.log("📧 Transporter activo:", {
        canal: provider.key,
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        user: provider.user
      });

      const transporter = createTransporter(provider);
      await verifyTransporterOnce(provider, transporter);
      const info = await transporter.sendMail({
        from: provider.from || provider.user,
        to: destinatario,
        subject,
        html,
        text
      });

      console.log("✅ EMAIL ENVIADO", {
        canal: provider.key,
        destinatario,
        messageId: info.messageId
      });

      return {
        ok: true,
        canal: provider.key,
        provider: provider.key,
        estado: "enviado",
        destino: destinatario,
        messageId: info.messageId
      };
    } catch (error) {
      console.error("❌ SMTP ERROR", { canal: provider.key, destinatario, ...smtpErrorSeguro(error) });
      errores.push(`${provider.key}: ${error.message}`);
    }
  }

  return {
    ok: false,
    canal: providers[0]?.key || "email",
    provider: providers[0]?.key || "email",
    estado: "error",
    destino: destinatario,
    motivo: errores.join(" | ") || "Error SMTP desconocido"
  };
};

export const sendEmailMultipleRecipients = async ({ recipients = [], subject, htmlBuilder, textBuilder }) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const html = htmlBuilder(recipient);
      const text = textBuilder(recipient);
      results.push(await sendEmailAlert({ to: recipient.email, subject, html, text }));
    } catch (error) {
      console.error("❌ ERROR SMTP MULTIPLE:", smtpErrorSeguro(error));
      results.push({ canal: "email", estado: "error", destino: recipient.email, motivo: error.message });
    }
  }

  return results;
};

export const verifyEmailProviders = async () => {
  console.log("📧 DIAGNOSTICO SMTP", emailConfigStatus());
  const providers = usableProviders();
  const results = [];

  if (!providers.length) {
    return {
      ok: false,
      status: emailConfigStatus(),
      providers: [],
      error: "No hay proveedores SMTP configurados"
    };
  }

  for (const provider of providers) {
    try {
      const transporter = createTransporter(provider);
      await transporter.verify();
      console.log("✅ SMTP VERIFICADO", { provider: provider.key, host: provider.host, user: provider.user });
      results.push({ provider: provider.key, ok: true, host: provider.host, user: provider.user });
    } catch (error) {
      console.error("❌ SMTP ERROR", { provider: provider.key, ...smtpErrorSeguro(error) });
      results.push({ provider: provider.key, ok: false, host: provider.host, user: provider.user, error: smtpErrorSeguro(error) });
    }
  }

  return {
    ok: results.some((item) => item.ok),
    status: emailConfigStatus(),
    providers: results
  };
};

export const sendTestEmail = async ({ to = "jota.raaamirez@gmail.com" } = {}) => {
  const subject = "Prueba SMTP Render - NOVANDINO";
  const text = [
    "Prueba real de correo SMTP desde backend Render.",
    `Fecha: ${new Date().toISOString()}`,
    "NOVANDINO | GESTION OPERACIONAL"
  ].join("\n");
  const html = `<p>Prueba real de correo SMTP desde backend Render.</p><p>Fecha: ${new Date().toISOString()}</p><p>NOVANDINO | GESTION OPERACIONAL</p>`;
  return sendEmailAlert({ to, subject, html, text });
};
