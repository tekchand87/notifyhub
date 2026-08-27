import { Router } from "express";
import { tenantController } from "./tenant.controller.js";
import {updateTenantSchema,updateMemberSchema} from "./tenant.validator.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { requireActiveTenant } from "../../middleware/tenantAccess.middleware.js";
import { USER_ROLES } from "../auth/auth.constants.js";


const router = Router();
router.use(requireAuth);
router.use(requireActiveTenant);
router.get("/",tenantController.getMyTenant);

router.patch("/",requireRole(USER_ROLES.TENANT_ADMIN),validate(updateTenantSchema),
tenantController.updateMyTenant);

router.get("/members",requireRole(USER_ROLES.TENANT_ADMIN),tenantController.listMembers);

router.get("/members/:userId",requireRole(USER_ROLES.TENANT_ADMIN),tenantController.getMember);

router.patch("/members/:userId",requireRole(USER_ROLES.TENANT_ADMIN),validate(updateMemberSchema),
tenantController.updateMember);

export default router;