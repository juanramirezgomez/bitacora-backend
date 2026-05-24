import express from "express";
import { requireAuth } from "../middlewares/authJwt.js";
import { estadoInicioSeguro, registrarInicioSeguro } from "../controllers/inicioSeguroController.js";

const router = express.Router();

router.get("/estado", requireAuth, estadoInicioSeguro);
router.post("/", requireAuth, registrarInicioSeguro);

export default router;
