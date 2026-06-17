import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user.js";
import { registrarJwtAccessDenied } from "../services/loginAuditService.js";

const USER_AUTH_SELECT = [
  "_id",
  "nombre",
  "username",
  "operadorId",
  "email",
  "correoCorporativo",
  "correoRespaldo",
  "telefono",
  "preferenciasAlertas",
  "rol",
  "estado",
  "activo",
  "planta",
  "area",
  "turno",
  "turnoAsignado",
  "cargo",
  "licenciaClaseB",
  "fechaVencimientoLicenciaB",
  "licenciaInterna",
  "fechaVencimientoLicenciaInterna",
  "debeCambiarPassword",
  "modulosPermitidos"
].join(" ");

const usuarioRequest = (user) => {
  const id = String(user._id);
  return {
    id,
    _id: user._id,
    uid: id,
    sub: id,
    nombre: user.nombre || "",
    username: user.username || "",
    operadorId: user.operadorId || "",
    email: user.email || user.correoCorporativo || "",
    correo: user.correoCorporativo || user.email || "",
    correoCorporativo: user.correoCorporativo || user.email || "",
    correoRespaldo: user.correoRespaldo || "",
    telefono: user.telefono || "",
    preferenciasAlertas: user.preferenciasAlertas || {},
    rol: user.rol,
    estado: user.estado,
    activo: user.activo !== false,
    planta: user.planta || "",
    area: user.area || user.planta || "",
    turno: user.turno || "",
    turnoAsignado: user.turnoAsignado || "Ambos",
    cargo: user.cargo || "",
    licenciaClaseB: user.licenciaClaseB === true,
    fechaVencimientoLicenciaB: user.fechaVencimientoLicenciaB || null,
    licenciaInterna: user.licenciaInterna,
    fechaVencimientoLicenciaInterna: user.fechaVencimientoLicenciaInterna || null,
    debeCambiarPassword: user.debeCambiarPassword === true,
    modulosPermitidos: user.modulosPermitidos || []
  };
};

const negarAccesoUsuario = async (req, res, tokenUser, observacion) => {
  await registrarJwtAccessDenied(req, tokenUser, observacion);
  return res.status(401).json({ message: "Usuario inactivo o eliminado" });
};

export const requireAuth = async (req, res, next) => {
  try {
    // Algunas rutas aplican requireAuth nuevamente despues del middleware global.
    if (req.authUserValidated === true && req.user) return next();

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Token requerido" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Falta JWT_SECRET" });

    const payload = jwt.verify(token, secret);
    const userId = payload?.uid || payload?.id || payload?._id || payload?.sub;

    if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      return negarAccesoUsuario(req, res, payload, "Token valido sin identificador de usuario vigente");
    }

    const user = await User.findById(userId).select(USER_AUTH_SELECT).lean();
    if (!user) {
      return negarAccesoUsuario(req, res, payload, "Token valido asociado a usuario inexistente o eliminado");
    }

    const estado = String(user.estado || "").trim().toUpperCase();
    if (estado !== "ACTIVO" || user.activo === false) {
      return negarAccesoUsuario(req, res, user, `Usuario inactivo. Estado actual: ${estado || "SIN_ESTADO"}`);
    }

    req.user = usuarioRequest(user);
    req.authUserValidated = true;
    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expirado" });
    }
    if (error?.name === "JsonWebTokenError" || error?.name === "NotBeforeError") {
      return res.status(401).json({ message: "Token invalido" });
    }
    console.error("ERROR VALIDANDO USUARIO JWT:", error?.message || error);
    return res.status(500).json({ message: "Error validando sesion" });
  }
};

export const verificarToken = requireAuth;
