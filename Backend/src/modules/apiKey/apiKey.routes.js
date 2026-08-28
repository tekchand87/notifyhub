import {Routes} from "express"

// validator
import {createApiKeySchema} from "./apiKey.validator.js"

// middleware
import  {requireAuth} from "../../middleware/auth.middleware.js"
import {requireRole} from "../../middleware/role.middleware.js"
import {requireActiveTenant} from "../../middleware/tenantAccess.middleware.js"
import {validate} from "../../middleware/validate.middleware.js"

// roles 
import {USER_ROLES} from "../auth/auth.contants.js"

// controller
import {createApiKey,listApiKeys,getApiKey,revokeApiKey} from "./apiKey.controller.js"

const router = Routes();


// authentication 
router.use(requireAuth);
router.use(requireActiveTenant);

router.post("/",requireRole(USER_ROLES.TENANT_ADMIN),validate(createApiKeySchema),createApiKey);

router.get("/",requireRole(USER_ROLES.TENANT_ADMIN),listApiKeys);

router.get("/:apiKeyId",requireRole(USER_ROLES.TENANT_ADMIN),getApiKey);

router.get("/:apiKeyId/revoke",requireRole(USER_ROLES.TENANT_ADMIN),revokeApiKey);

export default router;