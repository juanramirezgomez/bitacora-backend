import express from "express";
import { recalcularAptitudChecklists } from "../controllers/adminChecklistAuditController.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.post("/recalcular-aptitud-checklists", requireRole("ADMIN"), recalcularAptitudChecklists);

export default router;
