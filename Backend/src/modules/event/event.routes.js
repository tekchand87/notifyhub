import { Router } from "express";

import * as eventController from "./event.controller.js";

import {createEventSchema} from "./event.validator.js";

import { validate } from "../../middleware/validate.middleware.js";

import {requireApiKey} from "../../middleware/apiKeyauth.middleware.js";

import {requireApiKeyScope} from "../../middleware/requireApiKeyScope.middleware.js";

import {requireAuth} from "../../middleware/auth.middleware.js";

import {EVENT_WRITE_SCOPE} from "./event.constants.js";


const router = Router();


/*
  External application
  Publish Event
*/
router.post(
  "/",
  requireApiKey,
  requireApiKeyScope(
    EVENT_WRITE_SCOPE
  ),
  validate(createEventSchema),
  eventController.publishEvent
);


/*
  Tenant admin
  List Events
*/
router.get(
  "/",
  requireAuth,
  eventController.listEvents
);


/*
  Tenant admin
  Get one Event
*/
router.get(
  "/:eventId",
  requireAuth,
  eventController.getEvent
);


export default router;