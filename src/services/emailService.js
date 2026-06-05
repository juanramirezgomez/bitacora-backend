import { Resend } from "resend";
import { ALERT_PRIORITIES } from "../config/alertTemplates.js";

const cleanEnv = (value) => String(value || "").trim();
const DEFAULT_FROM = "Operaciones Litio <alertas@auraprime.cl>";

const resendErrorSeguro = (error) => ({
  message: error?.message,
  name: error?.name,
  statusCode: error?.statusCode || error?.status,
  response: error?.response,
  details: error?.details,
  command: error?.command,
  stack: error?.stack
});

const resendClient = () => new Resend(cleanEnv(process.env.RESEND_API_KEY));

export const emailFrom = () => cleanEnv(process.env.EMAIL_FROM) || DEFAULT_FROM;

export const emailConfigStatus = () => {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  const from = emailFrom();

  return {
    provider: "resend",
    configured: Boolean(apiKey && from),
    domainVerified: from.includes("@auraprime.cl"),
    resendApiKeyExists: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : null,
    emailFrom: from
  };
};

export const emailConfigured = () => emailConfigStatus().configured;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export const buildAlertEmailHtml = ({ alerta, destinatario }) => {
  const priority = ALERT_PRIORITIES[alerta.prioridad] || ALERT_PRIORITIES.ALTA;
  const anomalies = (alerta.anomalias || [alerta.mensaje])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
  <div style="background:#07111f;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d7d8e8;box-shadow:0 18px 45px rgba(0,0,0,.22);">
      <div style="background:linear-gradient(135deg,#461D77,#253B8E);color:#fff;padding:22px 24px;">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#d7d8e8;">OPERACIONES LITIO</div>
        <h1 style="margin:7px 0 4px;font-size:22px;line-height:1.15;">PLATAFORMA DE GESTION OPERACIONAL</h1>
        <p style="margin:0;font-size:13px;color:#f7f3ea;">Centro de alertas operacionales - Planta ${escapeHtml(alerta.planta || "PC1")}</p>
      </div>
      <div style="padding:22px 24px;">
        <div style="display:inline-block;background:${priority.color};color:#fff;padding:7px 11px;border-radius:7px;font-weight:bold;font-size:12px;">
          Prioridad ${escapeHtml(priority.label || alerta.prioridad || "ALTA")}
        </div>
        <h2 style="font-size:19px;margin:18px 0 8px;color:#111827;">${escapeHtml(alerta.titulo || alerta.tipo || "Alerta operacional")}</h2>
        <p style="font-size:14px;line-height:1.55;color:#334155;">Hola ${escapeHtml(destinatario?.nombre || "equipo")}, se detecto una condicion que requiere revision operacional.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;color:#111827;">
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Patente</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.patente || "-")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Planta</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.planta || "PC1")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Turno</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.turno || alerta.turnoNumero || "-")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Operador</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.operador || "-")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Tipo de alerta</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.tipo || "-")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Estado alerta</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.estadoOperacionAlerta || alerta.estadoAlerta || "ABIERTA")}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb;font-weight:bold;background:#f8fafc;">Fecha checklist</td><td style="padding:9px;border:1px solid #e5e7eb;">${escapeHtml(alerta.fechaTexto || "-")}</td></tr>
        </table>
        <h3 style="font-size:15px;margin:16px 0 8px;color:#111827;">Condiciones detectadas</h3>
        <ul style="font-size:14px;line-height:1.6;padding-left:20px;color:#334155;">${anomalies}</ul>
        <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">
          AURA PRIME | OPERACIONES LITIO
        </div>
      </div>
    </div>
  </div>`;
};

export const buildTestEmailHtml = () => `
  <div style="background:#07111f;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d7d8e8;">
      <div style="background:linear-gradient(135deg,#461D77,#253B8E);color:#fff;padding:22px 24px;">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#d7d8e8;">OPERACIONES LITIO</div>
        <h1 style="margin:7px 0 4px;font-size:22px;line-height:1.15;">PRUEBA SISTEMA ALERTAS OPERACIONES LITIO</h1>
        <p style="margin:0;font-size:13px;color:#f7f3ea;">Correo enviado desde Resend con dominio auraprime.cl</p>
      </div>
      <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.55;">
        <p>Esta es una prueba real del sistema de correos operacionales.</p>
        <p><strong>Fecha:</strong> ${new Date().toISOString()}</p>
        <p><strong>Remitente:</strong> ${escapeHtml(emailFrom())}</p>
        <p style="margin-top:22px;color:#64748b;font-size:12px;">AURA PRIME | OPERACIONES LITIO</p>
      </div>
    </div>
  </div>`;

export const sendEmailAlert = async ({ to, subject, html, text, metadata = {} }) => {
  const destinatarioOriginal = cleanEnv(to).toLowerCase();
  const destinatario = destinatarioOriginal;
  const fecha = new Date().toISOString();

  console.log("\uD83D\uDCE7 INICIANDO RESEND", emailConfigStatus());
  console.log("\uD83D\uDCE8 ENVIANDO EMAIL RESEND", {
    fecha,
    destinatario,
    correoCorporativo: metadata.correoCorporativo || "",
    correoRespaldo: metadata.correoRespaldo || "",
    subject,
    from: emailFrom()
  });

  if (!destinatario) {
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "omitido",
      destino: destinatario,
      destinoOriginal: destinatarioOriginal,
      motivo: "Destinatario vacio"
    };
  }

  if (!emailConfigured()) {
    console.log("Email omitido: faltan variables RESEND_API_KEY o EMAIL_FROM", emailConfigStatus());
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "omitido",
      destino: destinatario,
      destinoOriginal: destinatarioOriginal,
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
    console.log("\u2705 EMAIL ENVIADO RESEND", { fecha, destinatario, messageId, estado: "enviado" });

    return {
      ok: true,
      canal: "resend",
      provider: "resend",
      estado: "enviado",
      destino: destinatario,
      destinoOriginal: destinatarioOriginal,
      messageId,
      from: emailFrom()
    };
  } catch (error) {
    console.error("\u274C ERROR RESEND", { fecha, destinatario, ...resendErrorSeguro(error) });
    return {
      ok: false,
      canal: "resend",
      provider: "resend",
      estado: "error",
      destino: destinatario,
      destinoOriginal: destinatarioOriginal,
      motivo: error?.message || "Error Resend",
      error: resendErrorSeguro(error),
      from: emailFrom()
    };
  }
};

export const sendEmailMultipleRecipients = async ({ recipients = [], subject, htmlBuilder, textBuilder }) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      const html = htmlBuilder(recipient);
      const text = textBuilder(recipient);
      results.push(await sendEmailAlert({
        to: recipient.email,
        subject,
        html,
        text,
        metadata: recipient
      }));
    } catch (error) {
      console.error("\u274C ERROR RESEND MULTIPLE:", resendErrorSeguro(error));
      results.push({
        canal: "resend",
        provider: "resend",
        estado: "error",
        destino: recipient.email,
        motivo: error.message,
        error: resendErrorSeguro(error)
      });
    }
  }

  return results;
};

export const verifyEmailProviders = async () => {
  console.log("\uD83D\uDCE7 DIAGNOSTICO RESEND", emailConfigStatus());

  return {
    ok: emailConfigured(),
    provider: "resend",
    status: emailConfigStatus(),
    error: emailConfigured() ? "" : "Faltan RESEND_API_KEY o EMAIL_FROM"
  };
};

export const sendTestEmail = async ({ to = "jota.raaamirez@gmail.com" } = {}) => {
  const subject = "PRUEBA SISTEMA ALERTAS OPERACIONES LITIO";
  const text = [
    "PRUEBA SISTEMA ALERTAS OPERACIONES LITIO",
    "Correo enviado desde Resend con dominio auraprime.cl.",
    `Fecha: ${new Date().toISOString()}`,
    `Remitente: ${emailFrom()}`,
    "",
    "AURA PRIME | OPERACIONES LITIO"
  ].join("\n");
  return sendEmailAlert({ to, subject, html: buildTestEmailHtml(), text });
};