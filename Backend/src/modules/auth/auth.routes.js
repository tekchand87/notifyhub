import {Router} from "express"

import * as authController from "./auth.controller.js"

import {registerSchema,loginSchema,changePasswordSchema} from "./auth.validator.js"

import {validate} from "../../middleware/validate.middleware.js"
import {requireAuth} from "../../middleware/auth.middleware.js"
import { authLimiter } from "../../middleware/rateLimit.middleware.js"

const router = Router();

// Apply strict rate limiting to auth endpoints to prevent brute-force attacks
router.post("/register", authLimiter, validate(registerSchema), authController.register);

router.post("/login", authLimiter, validate(loginSchema), authController.login);

router.get("/me",requireAuth,authController.getMe);

router.post("/change-password",requireAuth,validate(changePasswordSchema),authController.changePassword);

export default router;
