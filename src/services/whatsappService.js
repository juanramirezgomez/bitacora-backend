import twilio from "twilio";

export const whatsappConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);

export const whatsappConfigStatus = () => ({
  configured: whatsappConfigured(),
  twilioSidExists: Boolean(process.env.TWILIO_ACCOUNT_SID),
  twilioTokenExists: Boolean(process.env.TWILIO_AUTH_TOKEN),
  twilioFrom: process.env.TWILIO_WHATSAPP_FROM || null
});

const getClient = () =>
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, {
    timeout: 15000
  });

const limpiarTelefono = (telefono) =>
  String(telefono || "").trim().replace(/^whatsapp:/i, "");

const esLimiteSandbox = (error) => {
  const texto = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return texto.includes("daily") || texto.includes("limit") || texto.includes("63038");
};

const twilioErrorSeguro = (error) => ({
  message: error?.message,
  code: error?.code,
  status: error?.status,
  moreInfo: error?.moreInfo,
  details: error?.details
});

export const enviarWhatsApp = async ({ telefono, mensaje }) => {
  const telefonoDestino = limpiarTelefono(telefono);

  try {
    console.log(whatsappConfigured() ? "✅ TWILIO OK" : "❌ TWILIO ERROR", whatsappConfigStatus());
    console.log("📲 ENVIANDO WHATSAPP", {
      to: telefonoDestino,
      from: process.env.TWILIO_WHATSAPP_FROM
    });

    if (!whatsappConfigured()) {
      console.log("⚠️ WhatsApp omitido: faltan variables Twilio Sandbox");
      return {
        ok: false,
        estado: "omitido",
        error: "Faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_WHATSAPP_FROM",
        destino: telefonoDestino
      };
    }

    // Twilio Sandbox: envio simple con body/from/to. No usar contentSid/templates/Meta API style en pruebas.
    const response = await getClient().messages.create({
      body: mensaje,
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${telefonoDestino}`
    });

    console.log("✅ WHATSAPP ENVIADO", response.sid);

    return {
      ok: true,
      estado: "enviado",
      sid: response.sid,
      destino: telefonoDestino
    };
  } catch (error) {
    if (esLimiteSandbox(error)) {
      console.warn("⚠️ LIMITE SANDBOX TWILIO ALCANZADO:", error.message);
    }

    console.error("❌ ERROR WHATSAPP:", error.message);
    console.error("❌ DETALLE WHATSAPP:", twilioErrorSeguro(error));
    return {
      ok: false,
      estado: "error",
      error: error.message,
      destino: telefonoDestino
    };
  }
};

export const sendWhatsAppAlert = async ({ to, body }) => {
  const result = await enviarWhatsApp({ telefono: to, mensaje: body });

  if (result.estado === "omitido") {
    return { canal: "whatsapp", estado: "omitido", motivo: result.error, destino: result.destino };
  }

  if (!result.ok) {
    return { canal: "whatsapp", estado: "error", motivo: result.error, destino: result.destino };
  }

  return { canal: "whatsapp", estado: "enviado", destino: result.destino, sid: result.sid };
};

export const sendWhatsAppMultipleRecipients = async ({ recipients = [], bodyBuilder }) => {
  const results = [];

  for (const recipient of recipients) {
    try {
      results.push(await sendWhatsAppAlert({ to: recipient.telefono, body: bodyBuilder(recipient) }));
    } catch (error) {
      console.error("❌ ERROR WHATSAPP MULTIPLE:", error.message);
      console.error("❌ DETALLE WHATSAPP MULTIPLE:", twilioErrorSeguro(error));
      results.push({ canal: "whatsapp", estado: "error", destino: recipient.telefono, motivo: error.message });
    }
  }

  return results;
};
