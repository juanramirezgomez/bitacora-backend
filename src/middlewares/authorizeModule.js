import { normalizarModulo, tienePermiso } from "../config/permisos.js";
import { registrarEvento } from "../services/operationalAuditService.js";

export const authorizeModule = (modulo) => {
  return async (req, res, next) => {
    const rol = String(req.user?.rol || "").toUpperCase();
    const moduloNormalizado = normalizarModulo(modulo);

    if (!rol) {
      return res.status(401).json({ message: "No autenticado" });
    }

    if (tienePermiso(rol, moduloNormalizado)) {
      return next();
    }

    console.warn("ACCESO DENEGADO MODULO", {
      usuario: req.user?.email || req.user?.username || req.user?.id,
      rol,
      modulo: moduloNormalizado
    });

    await registrarEvento({
      req,
      modulo: "SISTEMA",
      entidad: "Permisos",
      accion: "ACCESO_DENEGADO",
      resultado: "ERROR",
      observacion: `Acceso denegado al modulo ${moduloNormalizado}`
    });

    return res.status(403).json({ message: "Sin permisos" });
  };
};

export default authorizeModule;
