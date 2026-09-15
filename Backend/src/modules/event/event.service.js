// src/modules/event/event.service.js
// Core event service — handles event creation, listing, and retrieval.
//
// Event creation flow (publishEvent):
//   1. Validate tenantId
//   2. Idempotency: if req carries an idempotencyRecord, the slot is already claimed
//   3. Open MongoDB transaction (requires replica set — see docker-compose.yml)
//   4. Create Event document
//   5. Create OutboxEvent document (same transaction)
//   6. Commit transaction
//   7. Mark idempotency record complete (non-transactional — if this fails,
//      the event was created; the client will get a 503 but the event is safe)
//   8. Return result
//
// The OutboxEvent is picked up asynchronously by the Outbox Publisher and
// published to Kafka. This decouples event acceptance from Kafka availability.
//
// At-least-once guarantee:
//   If the publisher crashes after Kafka.send() succeeds but before marking
//   the OutboxEvent as "published", the message will be published again.
//   Downstream workers use eventId as the stable identity for deduplication.

import mongoose from "mongoose";
import { Event } from "./event.model.js";
import { OutboxEvent } from "./outbox.model.js";
import { AppError } from "../../utils/AppError.js";
import { retryConfig } from "../../config/retry.config.js";
import {
  markIdempotencyComplete,
  deleteIdempotencyRecord,
} from "./idempotency.service.js";

// ─── Event Publishing ─────────────────────────────────────────────────────────

export const publishEvent = async (tenantId, input, options = {}) => {
  // ── 1. Validate tenant context ───────────────────────────────────────────────
  if (!mongoose.isValidObjectId(tenantId)) {
    throw new AppError("Invalid tenant context", 401);
  }

  const topic = process.env.KAFKA_TOPIC;
  if (!topic) {
    throw new AppError("KAFKA_TOPIC is not configured", 500);
  }

  // ── 2. Build event data ───────────────────────────────────────────────────────
  const maxAttempts = retryConfig.maxAttempts;
  const tenantIdStr = String(tenantId);

  // ── 3. MongoDB transaction: Event + OutboxEvent atomically ────────────────────
  // If either write fails, both are rolled back.
  // The OutboxEvent ensures the event will eventually reach Kafka even if
  // the process crashes immediately after this commit.
  const session = await mongoose.startSession();

  let createdEvent;

  try {
    await session.withTransaction(async () => {
      // Create the Event
      const [event] = await Event.create(
        [
          {
            tenantId,
            type: input.type,
            channel: input.channel,
            payload: input.payload,
            maxAttempts,
          },
        ],
        { session }
      );

      createdEvent = event;

      // Create the corresponding OutboxEvent (same transaction)
      // The payload is serialized now to avoid depending on the live document later
      await OutboxEvent.create(
        [
          {
            tenantId,
            eventId: event._id,
            topic,
            key: tenantIdStr,
            payload: {
              eventId: String(event._id),
              tenantId: tenantIdStr,
              type: event.type,
              channel: event.channel,
              payload: event.payload,
              createdAt: event.createdAt,
            },
            maxAttempts,
            nextAttemptAt: null, // immediately eligible
          },
        ],
        { session }
      );
    });
  } catch (err) {
    // Transaction rolled back — no Event and no OutboxEvent in DB.
    // If we claimed an idempotency slot, release it so the client can retry.
    if (options.idempotencyRecordId) {
      await deleteIdempotencyRecord(options.idempotencyRecordId).catch(() => {});
    }
    throw new AppError(
      "Failed to create event. Please retry.",
      503
    );
  } finally {
    await session.endSession();
  }

  // ── 4. Build response ─────────────────────────────────────────────────────────
  const responseBody = {
    success: true,
    message: "Event accepted",
    data: {
      eventId: createdEvent._id,
      status: createdEvent.status,
      createdAt: createdEvent.createdAt,
      outboxPending: true,
    },
  };

  // ── 5. Mark idempotency record complete (best-effort) ─────────────────────────
  // If this fails, the event was already created safely. The idempotency record
  // remains "pending" and will eventually expire via TTL. The client receives
  // a 503, which is correct — they can retry, and the retry will get a 409
  // (in-flight) or, after TTL, create a new event.
  if (options.idempotencyRecordId) {
    await markIdempotencyComplete(
      options.idempotencyRecordId,
      createdEvent._id,
      responseBody
    ).catch(() => {
      // Log but don't fail the request — event was created successfully
    });
  }

  return responseBody.data;
};

// ─── Event Listing ────────────────────────────────────────────────────────────

export const listEvents = async (
  tenantId,
  { page = 1, limit = 20, status, channel } = {}
) => {
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = { tenantId };
  if (status) filter.status = status;
  if (channel) filter.channel = channel;

  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(
        "type channel status attempts maxAttempts createdAt updatedAt deliveredAt failedAt dlqAt"
      )
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),

    Event.countDocuments(filter),
  ]);

  return {
    events,
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages: Math.ceil(total / normalizedLimit),
    },
  };
};

// ─── Single Event Retrieval ───────────────────────────────────────────────────

export const getEvent = async (tenantId, eventId) => {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError("Invalid event id", 400);
  }

  const event = await Event.findOne({ _id: eventId, tenantId })
    .select(
      "type channel payload status attempts maxAttempts lastError nextRetryAt " +
      "createdAt updatedAt deliveredAt failedAt dlqAt processingStartedAt workerId"
    )
    .lean();

  if (!event) {
    throw new AppError("Event not found", 404);
  }

  return event;
};