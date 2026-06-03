import LoginAudit from "../models/LoginAudit.js";

const detectarDispositivo = (userAgent = "") => {
  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("android")) return "ANDROID";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "IOS";
  if (ua.includes("windows")) return "WINDOWS";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "MAC";
  if (ua.includes("linux")) return "LINUX";
  return "OTRO";
};

const obtenerIp = (req) => {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0];

  return forwarded || String(req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
};

const datosRequest = (req) => {
  const userAgent = String(req.headers?.["user-agent"] || "");
  return {
    ip: obtenerIp(req),
    userAgent,
    dispositivo: detectarDispositivo(userAgent)
  };
};

const usuarioAudit = (user = {}) => ({
  usuarioId: user?._id || user?.id || user?.uid || null,
  nombreUsuario: user?.nombre || "",
  username: user?.username || user?.operadorId || "",
  email: user?.email || user?.correoCorporativo || "",
  rol: user?.rol || "",
  planta: user?.planta || ""
});

const registrarAudit = async (req, payload) => {
  try {
    console.log("\u{1F510} LOGIN AUDIT", { accion: payload.accion, resultado: payload.resultado });
    return await LoginAudit.create({
      ...payload,
      ...datosRequest(req),
      fecha: new Date()
    });
  } catch (error) {
    console.error("ERROR LOGIN AUDIT:", error?.message || error);
    return null;
  }
};

export const registrarLoginExitoso = async (req, user) => {
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "LOGIN_EXITOSO",
    resultado: "OK",
    observacion: "Inicio de sesion exitoso"
  });
  if (doc) console.log("\u2705 LOGIN REGISTRADO", { usuarioId: String(doc.usuarioId || ""), username: doc.username });
  return doc;
};

export const registrarLoginFallido = async (req, identificador = "", observacion = "Credenciales incorrectas") => {
  const intento = String(identificador || "").trim();
  const doc = await registrarAudit(req, {
    nombreUsuario: "",
    username: intento,
    email: intento.toLowerCase().includes("@") ? intento.toLowerCase() : "",
    accion: "LOGIN_FALLIDO",
    resultado: "ERROR",
    observacion
  });
  if (doc) console.log("\u274C LOGIN FALLIDO REGISTRADO", { username: doc.username, ip: doc.ip });
  return doc;
};

export const registrarLoginBloqueado = async (
  req,
  user,
  observacion = "Usuario bloqueado temporalmente por exceso de intentos fallidos"
) => {
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "LOGIN_BLOQUEADO",
    resultado: "ERROR",
    observacion
  });
  if (doc) console.log("\u{1F512} LOGIN BLOQUEADO REGISTRADO", { username: doc.username, ip: doc.ip });
  return doc;
};

export const registrarDesbloqueoAutomatico = async (req, user) => {
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "DESBLOQUEO_AUTOMATICO",
    resultado: "OK",
    observacion: "Usuario desbloqueado automaticamente al cumplirse el tiempo de bloqueo"
  });
  if (doc) console.log("\u{1F513} DESBLOQUEO AUTOMATICO REGISTRADO", { username: doc.username });
  return doc;
};

export const registrarLogout = async (req) => {
  const doc = await registrarAudit(req, {
    ...usuarioAudit(req.user || {}),
    accion: "LOGOUT",
    resultado: "OK",
    observacion: "Cierre de sesion registrado"
  });
  if (doc) console.log("\u{1F6AA} LOGOUT REGISTRADO", { usuarioId: String(doc.usuarioId || ""), username: doc.username });
  return doc;
};

export const registrarResetPassword = async (req, user) => {
  const admin = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "RESET_PASSWORD",
    resultado: "OK",
    observacion: `Contrasena restablecida por administrador: ${admin}`
  });
  if (doc) console.log("\u{1F504} PASSWORD RESETEADA", { usuarioId: String(doc.usuarioId || ""), admin });
  return doc;
};

export const registrarSolicitudResetPassword = async (req, user, identificador = "") => {
  const payload = user?._id
    ? usuarioAudit(user)
    : {
        nombreUsuario: "",
        username: identificador,
        email: String(identificador || "").toLowerCase().includes("@") ? String(identificador).toLowerCase() : "",
        rol: "",
        planta: ""
      };

  const doc = await registrarAudit(req, {
    ...payload,
    accion: "SOLICITUD_RESET_PASSWORD",
    resultado: "OK",
    observacion: "Solicitud de recuperacion de contrasena creada por el usuario"
  });
  if (doc) console.log("🔄 SOLICITUD RESET PASSWORD REGISTRADA", { username: doc.username });
  return doc;
};

export const registrarResetPasswordAprobado = async (req, user) => {
  const admin = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "RESET_PASSWORD_APROBADO",
    resultado: "OK",
    observacion: `Solicitud de reset aprobada por administrador: ${admin}`
  });
  if (doc) console.log("✅ RESET PASSWORD APROBADO", { usuarioId: String(doc.usuarioId || ""), admin });
  return doc;
};

export const registrarSolicitudRecuperacionAprobada = async (req, user) => {
  const admin = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "SOLICITUD_RECUPERACION_APROBADA",
    resultado: "OK",
    observacion: `Solicitud de recuperacion aprobada por administrador: ${admin}`
  });
  if (doc) console.log("✅ SOLICITUD RECUPERACION APROBADA", { usuarioId: String(doc.usuarioId || ""), admin });
  return doc;
};

export const registrarPasswordTemporalGenerada = async (req, user) => {
  const admin = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "PASSWORD_TEMPORAL_GENERADA",
    resultado: "OK",
    observacion: `Password temporal generado por administrador: ${admin}`
  });
  if (doc) console.log("🔑 PASSWORD TEMPORAL GENERADA", { usuarioId: String(doc.usuarioId || ""), admin });
  return doc;
};

export const registrarResetPasswordRechazado = async (req, user, observacion = "") => {
  const admin = req.user?.nombre || req.user?.username || req.user?.operadorId || "ADMIN";
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "RESET_PASSWORD_RECHAZADO",
    resultado: "ERROR",
    observacion: observacion || `Solicitud de reset rechazada por administrador: ${admin}`
  });
  if (doc) console.log("❌ RESET PASSWORD RECHAZADO", { usuarioId: String(doc.usuarioId || ""), admin });
  return doc;
};

export const registrarCambioPassword = async (req, user) => {
  const doc = await registrarAudit(req, {
    ...usuarioAudit(user),
    accion: "PASSWORD_CAMBIADA",
    resultado: "OK",
    observacion: "Contrasena cambiada por el usuario"
  });
  if (doc) console.log("\u{1F511} PASSWORD CAMBIADA", { usuarioId: String(doc.usuarioId || ""), username: doc.username });
  return doc;
};
