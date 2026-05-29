import express from "express";
import OperationalAudit from "../models/OperationalAudit.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const registros = await OperationalAudit.find({})
      .sort({ fecha: -1 })
      .limit(500)
      .lean();

    return res.json({ registros });
  } catch (error) {
    return res.status(500).json({ message: "Error listando auditoria operacional" });
  }
});

export default router;
