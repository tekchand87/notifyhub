import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireActiveTenant } from "../../middleware/tenantAccess.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { USER_ROLES } from "../auth/auth.contants.js";
import { listOutbox, replayOutbox } from "./outbox.controller.js";

const router = Router();

// These diagnostics and replay operations are tenant-admin-only. The service
// also includes tenantId in every query, preventing IDOR across tenants.
router.use(requireAuth, requireActiveTenant, requireRole(USER_ROLES.TENANT_ADMIN));
router.get("/", listOutbox);
router.post("/:outboxId/replay", replayOutbox);

export default router;
