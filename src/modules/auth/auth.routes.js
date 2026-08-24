import {Router} from "express"

import * as authController from "./auth.controller.js"

import {registerSchema,loginSchema,changePasswordSchema} from "./auth.validator.js"

import {validate} from "../../middleware/validate.middleware.js"
import {requireAuth} from "../../middleware/auth.middleware.js"

const router = Router();

router.post("/register",validate(registerSchema),authController.login);

router.post("login",validate(loginSchema),authController.login);

router.get("/me",requireAuth,authController.getMe);

router.post("/change-password",requireAuth,validate(changePasswordSchema),authController.changePassword);

export default router;