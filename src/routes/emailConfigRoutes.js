import express from "express";
import { enviarCorreoPrueba, obtenerEstadoCorreo } from "../controllers/emailConfigController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.get("/email/status", requireRole("ADMIN"), obtenerEstadoCorreo);
router.post("/test/email", requireRole("ADMIN"), enviarCorreoPrueba);
router.get("/test-email", requireRole("ADMIN"), async (req, res, next) => {
  req.body = { email: String(req.query.email || "jota.raaamirez@gmail.com") };
  return enviarCorreoPrueba(req, res, next);
});

export default router;