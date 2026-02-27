export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = String(req.user?.rol || "").toUpperCase();
    if (!rol) return res.status(401).json({ message: "No autenticado" });

    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ message: "No autorizado por rol" });
    }
    next();
  };
};
