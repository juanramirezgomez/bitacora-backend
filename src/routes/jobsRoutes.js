import express from "express";
import { requireRole } from "../middlewares/requireRole.js";
import { authorizeModule } from "../middlewares/authorizeModule.js";
import {
  checklistEscalationJob,
  checklistReminderJob,
  dashboardRefreshJob
} from "../controllers/jobsController.js";

const router = express.Router();

router.get("/checklist-reminder", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), checklistReminderJob);
router.post("/checklist-reminder", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), checklistReminderJob);

router.get("/checklist-escalation", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), checklistEscalationJob);
router.post("/checklist-escalation", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), checklistEscalationJob);

router.get("/dashboard-refresh", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), dashboardRefreshJob);
router.post("/dashboard-refresh", requireRole("ADMIN"), authorizeModule("dashboard_ejecutivo"), dashboardRefreshJob);

export default router;
