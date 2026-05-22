// src/middlewares/requireRole.js
export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = String(req.user?.rol || "").toUpperCase();
    if (!rol) return res.status(401).json({ message: "No autenticado" });
    if (rol === "ADMIN") return next();

    const aliases = {
      OPERADOR: ["OPERADOR", "OPERADOR_CALDERA"],
      OPERADOR_CALDERA: ["OPERADOR_CALDERA", "OPERADOR"],
      SUPERVISOR: ["SUPERVISOR", "SUPERVISION"],
      SUPERVISION: ["SUPERVISION", "SUPERVISOR"]
    };

    const permitidos = rolesPermitidos.flatMap(r => {
      const key = String(r).toUpperCase();
      return aliases[key] || [key];
    });

    const ok = permitidos.includes(rol);
    if (!ok) return res.status(403).json({ message: "No autorizado" });

    next();
  };
};

export const verificarRol = requireRole;
