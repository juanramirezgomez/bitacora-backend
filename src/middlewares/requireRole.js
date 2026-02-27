// src/middlewares/requireRole.js
export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = String(req.user?.rol || "").toUpperCase();
    if (!rol) return res.status(401).json({ message: "No autenticado" });

    const ok = rolesPermitidos.map(r => String(r).toUpperCase()).includes(rol);
    if (!ok) return res.status(403).json({ message: "No autorizado" });

    next();
  };
};