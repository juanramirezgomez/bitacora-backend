// src/middlewares/requireRole.js
export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    const rol = String(req.user?.rol || "").toUpperCase();
    if (!rol) return res.status(401).json({ message: "No autenticado" });
    if (rol === "ADMIN") return next();

    const aliases = {
      OPERADOR: ["OPERADOR", "OPERADOR_PLANTA", "OPERADOR_LIDER"],
      OPERADOR_PLANTA: ["OPERADOR_PLANTA", "OPERADOR", "OPERADOR_LIDER"],
      OPERADOR_LIDER: ["OPERADOR_LIDER", "OPERADOR_PLANTA", "OPERADOR"],
      OPERADOR_CALDERA: ["OPERADOR_CALDERA"],
      SUPERVISOR: ["SUPERVISOR", "SUPERVISION", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"],
      SUPERVISION: ["SUPERVISION", "SUPERVISOR", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM"],
      SUPERINTENDENTE: ["SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"],
      JEFE_PLANTA: ["JEFE_PLANTA", "SUPERINTENDENTE", "JEFE_TURNO", "ECM", "SUPERVISION", "SUPERVISOR"],
      JEFE_TURNO: ["JEFE_TURNO", "SUPERINTENDENTE", "JEFE_PLANTA", "ECM", "SUPERVISION", "SUPERVISOR"],
      ECM: ["ECM", "SUPERINTENDENTE", "JEFE_PLANTA", "JEFE_TURNO", "SUPERVISION", "SUPERVISOR"]
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
