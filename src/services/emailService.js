import { Resend } from "resend";
import { ALERT_PRIORITIES } from "../config/alertTemplates.js";

const cleanEnv = (value) => String(value || "").trim();
const DEFAULT_FROM = "Operaciones Litio <alertas@auraprime.cl>";
const DEFAULT_APP_URL = "https://auraprime.cl";

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

export const publicAppUrl = () => cleanEnv(process.env.PUBLIC_APP_URL) || DEFAULT_APP_URL;

export const emailLogoUrl = () =>
  cleanEnv(process.env.EMAIL_LOGO_URL) || `${publicAppUrl()}/assets/logo-novandino.png`;

export const emailConfigStatus = () => {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  const from = emailFrom();

  return {
    provider: "resend",
    configured: Boolean(apiKey && from),
    domainVerified: from.includes("@auraprime.cl"),
    resendApiKeyExists: Boolean(apiKey),
    resendApiKeyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : null,
    emailFrom: from,
    logoUrl: emailLogoUrl(),
    appUrl: publicAppUrl()
  };
};

export const emailConfigured = () => emailConfigStatus().configured;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatoFecha = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const normalizarEstado = (estado = "ABIERTA") =>
  String(estado || "ABIERTA").trim().toUpperCase().replace(/_/g, " ");

const priorityData = (prioridad = "ALTA") => {
  const key = String(prioridad || "ALTA").trim().toUpperCase();
  if (key === "CRITICA") return { color: "#B91C1C", label: "Critica" };
  if (key === "ALTA") return { color: "#DC2626", label: "Alta" };
  if (key === "MEDIA") return { color: "#F59E0B", label: "Media" };
  if (key === "BAJA") return { color: "#2563EB", label: "Baja" };
  const base = ALERT_PRIORITIES[key] || ALERT_PRIORITIES.ALTA || { color: "#EA580C", label: "Alta" };
  return {
    color: base.color,
    label: base.label || key
  };
};

const tableRow = (label, value) => `
  <tr>
    <td style="padding:10px 12px;border:1px solid #D9DEE8;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#1F2937;width:34%;">
      ${escapeHtml(label)}
    </td>
    <td style="padding:10px 12px;border:1px solid #D9DEE8;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">
      ${escapeHtml(value || "-")}
    </td>
  </tr>`;

const buildCorporateEmailLayout = ({ title, subtitle, preheader = "", bodyHtml }) => `
<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#EEF2F7;">
    <div style="display:none;max-height:0;overflow:hidden;color:#EEF2F7;font-size:1px;line-height:1px;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#EEF2F7;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="720" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:720px;background:#FFFFFF;border-collapse:collapse;border:1px solid #D9DEE8;">
            <tr>
              <td align="center" style="background:#461D77;padding:24px 22px 18px 22px;">
                <img src="${escapeHtml(emailLogoUrl())}" width="170" alt="Novandino" style="display:block;border:0;outline:none;text-decoration:none;width:170px;max-width:60%;height:auto;margin:0 auto 16px auto;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#FFFFFF;">
                  OPERACIONES LITIO
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#FFFFFF;margin-top:6px;">
                  ${escapeHtml(title)}
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#FFFFFF;margin-top:6px;">
                  ${escapeHtml(subtitle || "Sistema de Alertas Operacionales")}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 20px 24px;background:#FFFFFF;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;background:#F8FAFC;border-top:1px solid #D9DEE8;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#475569;text-align:center;">
                      <strong>AURA PRIME | OPERACIONES LITIO</strong><br>
                      <a href="${escapeHtml(publicAppUrl())}" style="color:#461D77;text-decoration:none;">${escapeHtml(publicAppUrl())}</a><br>
                      Sistema Digital de Gestion Operacional<br>
                      Correo automatico generado por la plataforma. No responder directamente este mensaje.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const buildAlertEmailHtml = ({ alerta, destinatario }) => {
  const priority = priorityData(alerta.prioridad);
  const anomalies = (alerta.anomalias || [alerta.mensaje || alerta.descripcion])
    .filter(Boolean)
    .map((item) => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">
          ${escapeHtml(item)}
        </td>
      </tr>`)
    .join("");

  const estado = normalizarEstado(alerta.estadoOperacionAlerta || alerta.estadoAlerta || alerta.estado || "ABIERTA");
  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#334155;padding-bottom:16px;">
          Hola ${escapeHtml(destinatario?.nombre || "equipo")}, se detecto una condicion operacional que requiere revision y seguimiento.
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:16px;">
          <span style="display:inline-block;background:${priority.color};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;padding:8px 12px;text-transform:uppercase;">
            PRIORIDAD ${escapeHtml(priority.label)}
          </span>
          <span style="display:inline-block;background:#E5E7EB;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;padding:8px 12px;text-transform:uppercase;margin-left:6px;">
            ${escapeHtml(estado)}
          </span>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-bottom:18px;">
      ${tableRow("Tipo de alerta", alerta.tipo || alerta.titulo || "Alerta operacional")}
      ${tableRow("Patente", alerta.patente || "-")}
      ${tableRow("Area / Planta", alerta.area || alerta.planta || "PC1")}
      ${tableRow("Operador", alerta.operador || "-")}
      ${tableRow("Turno", [alerta.turno, alerta.turnoNumero].filter(Boolean).join(" ") || "-")}
      ${tableRow("Fecha", alerta.fechaTexto || formatoFecha(alerta.fecha || new Date()))}
      ${tableRow("Prioridad", priority.label)}
      ${tableRow("Estado alerta", estado)}
      ${tableRow("Observaciones", alerta.observaciones || alerta.mensaje || alerta.descripcion || "-")}
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #D9DEE8;">
      <tr>
        <td style="padding:10px 12px;background:#111827;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;">
          Anomalias detectadas
        </td>
      </tr>
      ${anomalies || `
      <tr>
        <td style="padding:9px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">
          Sin detalle adicional registrado.
        </td>
      </tr>`}
    </table>`;

  return buildCorporateEmailLayout({
    title: "Sistema de Alertas Operacionales",
    subtitle: "Alerta operacional registrada",
    preheader: `${alerta.patente || "Vehiculo"} - ${alerta.tipo || "Alerta operacional"}`,
    bodyHtml
  });
};

export const buildPasswordTemporalEmailHtml = ({ user, passwordTemporal }) => {
  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#334155;padding-bottom:16px;">
          Administracion aprobo la solicitud de recuperacion de contrasena. Usa la contrasena temporal para iniciar sesion y luego crea una nueva contrasena personal.
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-bottom:18px;">
      ${tableRow("Usuario", user?.username || user?.email || "-")}
      ${tableRow("Nombre", user?.nombre || "-")}
      ${tableRow("Fecha solicitud", formatoFecha(new Date()))}
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-bottom:18px;">
      <tr>
        <td align="center" style="padding:18px;background:#F3F4F6;border:1px solid #D9DEE8;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;color:#475569;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">Contrasena temporal</div>
          <div style="font-size:26px;line-height:32px;font-weight:bold;letter-spacing:1px;color:#111827;">${escapeHtml(passwordTemporal)}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#334155;">
          <strong>Instrucciones:</strong><br>
          1. Ingresa con tu correo o ID operador y la contrasena temporal.<br>
          2. El sistema solicitara cambiarla antes de entrar al Home.<br>
          3. No compartas esta contrasena. Si no solicitaste este cambio, informa a administracion.
        </td>
      </tr>
    </table>`;

  return buildCorporateEmailLayout({
    title: "Recuperacion de contrasena",
    subtitle: "Seguridad corporativa operacional",
    preheader: "Contrasena temporal generada para Operaciones Litio",
    bodyHtml
  });
};

export const buildTestEmailHtml = () => {
  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#334155;padding-bottom:16px;">
          Esta es una prueba real del sistema de correos operacionales usando Resend y el dominio auraprime.cl.
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
      ${tableRow("Fecha", formatoFecha(new Date()))}
      ${tableRow("Remitente", emailFrom())}
      ${tableRow("Proveedor", "Resend API")}
      ${tableRow("Dominio", "auraprime.cl")}
    </table>`;

  return buildCorporateEmailLayout({
    title: "PRUEBA SISTEMA ALERTAS OPERACIONES LITIO",
    subtitle: "Validacion de correo corporativo",
    preheader: "Correo de prueba enviado desde Resend",
    bodyHtml
  });
};

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
    "AURA PRIME | OPERACIONES LITIO",
    publicAppUrl()
  ].join("\n");
  return sendEmailAlert({ to, subject, html: buildTestEmailHtml(), text });
};
