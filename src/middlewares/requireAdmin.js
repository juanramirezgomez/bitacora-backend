// src/middlewares/requireAdmin.js
export const requireAdmin = (req, res, next) => {
  const rol = String(req.user?.rol || "").toUpperCase();
  if (rol !== "ADMIN") {
    return res.status(403).json({ message: "Acceso denegado: solo ADMIN" });
  }
  next();
};