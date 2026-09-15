// src/modules/event/event.routes.js
import { Router } from "express";

import * as eventController from "./event.controller.js";
import { createEventSchema } from "./event.validator.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireApiKey } from "../../middleware/apiKeyauth.middleware.js";
import { requireApiKeyScope } from "../../middleware/requireApiKeyScope.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { eventPublishLimiter } from "../../middleware/rateLimit.middleware.js";
import { idempotencyMiddleware } from "../../middleware/idempotency.middleware.js";
import { EVENT_WRITE_SCOPE } from "./event.constants.js";

const router = Router();

/*
  External application
  Publish Event — rate limited per API key (60/min)

  Middleware chain:
    1. requireApiKey      — validates API key, sets req.tenantId
    2. requireApiKeyScope — checks events:write scope
    3. eventPublishLimiter — rate limit (60/min per API key)
    4. validate           — Zod schema validation on request body
    5. idempotencyMiddleware — optional idempotency check (Idempotency-Key header)
    6. createEvent        — controller

  Note: idempotencyMiddleware is placed AFTER validate so it only runs on
  syntactically valid requests. This prevents caching validation errors.
*/
router.post(
  "/",
  requireApiKey,
  requireApiKeyScope(EVENT_WRITE_SCOPE),
  eventPublishLimiter,
  validate(createEventSchema),
  idempotencyMiddleware,
  eventController.createEvent
);

/*
  Tenant admin
  List Events
*/
router.get("/", requireAuth, eventController.listEvents);

/*
  Tenant admin
  Get one Event
*/
router.get("/:eventId", requireAuth, eventController.getEvent);

export default router;
