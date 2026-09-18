// src/modules/event/event.controller.js
import * as eventService from "./event.service.js";
import { incrementMetric } from "../../infrastructure/observability/metrics.js";

export const createEvent = async (req, res, next) => {
  try {
    const result = await eventService.publishEvent(
      req.tenantId,
      req.body,
      {
        // Pass the idempotency record ID so the service can mark it complete
        // after a successful transaction. null if no key was provided.
        idempotencyRecordId: req.idempotencyRecord?._id ?? null,
      }
    );
    incrementMetric("events_ingested_total", { channel: req.body.channel });

    return res.status(202).json({
      success: true,
      message: "Event accepted",
      data: result,
    });
  } catch (error) {
    incrementMetric("events_failed_total", { operation: "ingest" });
    next(error);
  }
};

export const listEvents = async (req, res, next) => {
  try {
    const result = await eventService.listEvents(
      req.user.tenantId,
      req.query
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getEvent = async (req, res, next) => {
  try {
    const result = await eventService.getEvent(
      req.user.tenantId,
      req.params.eventId
    );

    return res.status(200).json({
      success: true,
      data: { event: result },
    });
  } catch (error) {
    next(error);
  }
};
