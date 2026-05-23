import { Resend } from "resend";
import { ALERT_PRIORITIES } from "../config/alertTemplates.js";

const cleanEnv = (value) => String(value || "").trim();

const resendErrorSeguro = (error) => ({
  message: error?.message,
  name: error?.name,
  statusCode: error?.statusCode || error?.status,
  response: error?.response,
  details: error?.details,
  stack: error?.stack
});

const resendClient = () => new Resend(cleanEnv(process.env.RESEND_API_KEY));

const emailFrom = () => cleanEnv(process.env.EMAIL_FROM);

export const emailConfigStatus = () => {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);

  return {
    provider: "resend",
    configured: Boolean(apiKey && emailFrom()),
    resendApiKeyExists: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : null,
    emailFrom: emailFrom()
  };
};

export const emailConfigured = () => emailConfigStatus().configured;

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
  console.log("📧 INICIANDO RESEND", emailConfigStatus());
  console.log("📨 ENVIANDO EMAIL RESEND", { destinatario, subject, from: emailFrom() });

  if (!destinatario) {
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "omitido",
      destino: destinatario,
      motivo: "Destinatario vacio"
    };
  }

  if (!emailConfigured()) {
    console.log("⚠️ Email omitido: faltan variables RESEND_API_KEY o EMAIL_FROM", emailConfigStatus());
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "omitido",
      destino: destinatario,
      motivo: "Faltan RESEND_API_KEY o EMAIL_FROM"
    };
  }

  try {
    const result = await resendClient().emails.send({
      from: emailFrom(),
      to: destinatario,
      subject,
      html,
      text
    });

    if (result?.error) {
      throw result.error;
    }

    const messageId = result?.data?.id || result?.id || "";
    console.log("✅ EMAIL ENVIADO RESEND", { destinatario, messageId });

    return {
      ok: true,
      canal: "resend",
      provider: "resend",
      estado: "enviado",
      destino: destinatario,
      messageId
    };
  } catch (error) {
    console.error("❌ ERROR RESEND", { destinatario, ...resendErrorSeguro(error) });
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "error",
      destino: destinatario,
      motivo: error?.message || "Error Resend",
      error: resendErrorSeguro(error)
    };
  }
};

export const sendEmailMultipleRecipients = async ({ recipients = [], subject, htmlBuilder, textBuilder }) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const html = htmlBuilder(recipient);
      const text = textBuilder(recipient);
      results.push(await sendEmailAlert({ to: recipient.email, subject, html, text }));
    } catch (error) {
      console.error("❌ ERROR RESEND MULTIPLE:", resendErrorSeguro(error));
      results.push({
        canal: "resend",
        provider: "resend",
        estado: "error",
        destino: recipient.email,
        motivo: error.message
      });
    }
  }

  return results;
};

export const verifyEmailProviders = async () => {
  console.log("📧 DIAGNOSTICO RESEND", emailConfigStatus());

  return {
    ok: emailConfigured(),
    provider: "resend",
    status: emailConfigStatus(),
    error: emailConfigured() ? "" : "Faltan RESEND_API_KEY o EMAIL_FROM"
  };
};

export const sendTestEmail = async ({ to = "jota.raaamirez@gmail.com" } = {}) => {
  const subject = "Prueba Resend Render - NOVANDINO";
  const text = [
    "Prueba real de correo Resend desde backend Render.",
    `Fecha: ${new Date().toISOString()}`,
    "NOVANDINO | GESTION OPERACIONAL"
  ].join("\n");
  const html = `<p>Prueba real de correo Resend desde backend Render.</p><p>Fecha: ${new Date().toISOString()}</p><p>NOVANDINO | GESTION OPERACIONAL</p>`;
  return sendEmailAlert({ to, subject, html, text });
};
