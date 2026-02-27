
import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Token requerido" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Falta JWT_SECRET" });

    const payload = jwt.verify(token, secret);
    req.user = payload; // { uid, rol, nombre, username, iat, exp }
    next();
  } catch (e) {
    return res.status(401).json({ message: "Token inválido" });
  }
};