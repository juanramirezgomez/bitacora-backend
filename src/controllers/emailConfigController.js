import HistorialAlerta from "../models/HistorialAlerta.js";
import { buildTestEmailHtml, emailConfigStatus, sendTestEmail } from "../services/emailService.js";

const serializarHistorial = (doc) => {
  if (!doc) return null;
  const destinatario = Array.isArray(doc.destinatarios) && doc.destinatarios.length ? doc.destinatarios[0] : {};
  return {
    id: doc._id,
    fecha: doc.fecha || doc.createdAt,
    canal: doc.canal,
    estado: doc.estado,
    destinatario: destinatario.email || destinatario.correoCorporativo || destinatario.correoRespaldo || "",
    correoCorporativo: destinatario.correoCorporativo || "",
    correoRespaldo: destinatario.correoRespaldo || "",
    tipo: doc.tipo,
    prioridad: doc.prioridad,
    provider: doc.provider || "resend",
    messageId: doc.messageId || "",
    from: doc.from || "",
    error: doc.error || ""
  };
};

export const obtenerEstadoCorreo = async (req, res) => {
  try {
    const [ultimoEnviado, ultimoError] = await Promise.all([
      HistorialAlerta.findOne({ canal: { $in: ["correo", "correoCorporativo", "correoRespaldo"] }, estado: "enviado" })
        .sort({ fecha: -1, createdAt: -1 })
        .lean(),
      HistorialAlerta.findOne({ canal: { $in: ["correo", "correoCorporativo", "correoRespaldo"] }, estado: "error" })
        .sort({ fecha: -1, createdAt: -1 })
        .lean()
    ]);

    return res.json({
      ok: true,
      resend: emailConfigStatus(),
      ultimoCorreoEnviado: serializarHistorial(ultimoEnviado),
      ultimoError: serializarHistorial(ultimoError),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("ERROR ESTADO CORREO", error);
    return res.status(500).json({ ok: false, message: error?.message || "Error consultando estado de correo" });
  }
};

export const enviarCorreoPrueba = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, enviado: false, message: "Email destino invalido" });
    }

    console.log("?? TEST EMAIL RESEND INICIADO", {
      fecha: new Date().toISOString(),
      destino: email,
      usuario: req.user?.email || req.user?.id
    });

    const result = await sendTestEmail({ to: email });
    console.log("?? TEST EMAIL RESEND RESULTADO", result);

    if (!result?.ok) {
      return res.status(500).json({ ok: false, enviado: false, result });
    }

    return res.json({
      ok: true,
      enviado: true,
      messageId: result.messageId || "",
      from: result.from || "",
      destino: result.destino || email
    });
  } catch (error) {
    console.error("? TEST EMAIL RESEND ERROR:", error);
    return res.status(500).json({
      ok: false,
      enviado: false,
      error: error?.message || "Error enviando correo de prueba"
    });
  }
};

export const obtenerTemplateCorreoPrueba = async (req, res) => {
  try {
    const html = buildTestEmailHtml({ logoMode: "base64" });
    console.log("EMAIL_TEMPLATE_GENERATED", {
      endpoint: "/api/test/email-template",
      logoMode: "base64"
    });
    return res.type("html").send(html);
  } catch (error) {
    console.error("EMAIL_TEMPLATE_DIAGNOSTIC_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Error generando template de correo"
    });
  }
};
