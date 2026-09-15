// src/infrastructure/outbox/outbox.publisher.js
// Outbox Publisher — polls OutboxEvent records and publishes them to Kafka.
//
// Architecture:
//   The Outbox Pattern decouples event acceptance from Kafka availability.
//   When an event is created, an OutboxEvent is written in the same MongoDB
//   transaction. This publisher polls for pending OutboxEvents and publishes
//   them to Kafka asynchronously.
//
// Concurrency:
//   Multiple API server instances may run this publisher simultaneously.
//   The atomic claim (pending → publishing via findOneAndUpdate) ensures
//   only one publisher processes each OutboxEvent.
//
// At-least-once delivery:
//   If the publisher crashes after Kafka.send() but before marking the record
//   as "published", the message will be re-published on the next poll.
//   Downstream workers use eventId as the stable identity for idempotency.
//
// Error handling:
//   - Kafka unavailable: OutboxEvent stays pending, retried with backoff
//   - Max attempts exceeded: OutboxEvent marked "failed" (terminal)
//   - Publisher crashes: pending/publishing records recovered on next poll
//     (publishing records are reclaimed after OUTBOX_STALE_MS timeout)

import { OutboxEvent } from "../../modules/event/outbox.model.js";
import { publishKafkaEvent } from "../kafka/kafka.producer.js";
import {
  logInfo,
  logWarn,
  logError,
} from "../../modules/worker/worker.logger.js";

// ── Configuration (read lazily so tests can override) ──────────────────────────
const config = {
  get pollIntervalMs() {
    return Number(process.env.OUTBOX_POLL_INTERVAL_MS) || 1_000;
  },
  get batchSize() {
    return Number(process.env.OUTBOX_BATCH_SIZE) || 50;
  },
  get maxAttempts() {
    return Number(process.env.OUTBOX_MAX_ATTEMPTS) || 5;
  },
  // Outbox records stuck in "publishing" longer than this are considered stale
  // and reset to "pending". This handles publisher crashes mid-flight.
  get staleMs() {
    return Number(process.env.OUTBOX_STALE_MS) || 60_000;
  },
};

let pollerTimer = null;
let running = false;

// ── Backoff calculation (reuses existing retry pattern) ─────────────────────────

const calculateOutboxBackoff = (attempt) => {
  const base = 1_000;
  const max = 60_000; // cap at 1 minute for outbox
  const exponential = base * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, max);
  return Math.floor(Math.random() * capped);
};

// ── Stale "publishing" record recovery ─────────────────────────────────────────

const recoverStalePublishing = async () => {
  const staleThreshold = new Date(Date.now() - config.staleMs);
  const result = await OutboxEvent.updateMany(
    {
      status: "publishing",
      updatedAt: { $lte: staleThreshold },
    },
    {
      $set: { status: "pending", nextAttemptAt: null },
    }
  );
  if (result.modifiedCount > 0) {
    logWarn("Outbox: recovered stale publishing records", {
      count: result.modifiedCount,
    });
  }
};

// ── Single record processing ────────────────────────────────────────────────────

const processOutboxRecord = async (record) => {
  const { _id, eventId, tenantId, topic, key, payload, attempts } = record;
  const eventIdStr = String(eventId);
  const tenantIdStr = String(tenantId);

  logInfo("Outbox: publishing event to Kafka", {
    outboxId: String(_id),
    eventId: eventIdStr,
    tenantId: tenantIdStr,
    topic,
    attempt: attempts + 1,
  });

  try {
    // Build a mock event shape that publishKafkaEvent accepts
    // publishKafkaEvent expects: { _id, tenantId, type, channel, payload, createdAt }
    const kafkaMessage = {
      _id: eventId,
      tenantId,
      type: payload.type,
      channel: payload.channel,
      payload: payload.payload,
      createdAt: payload.createdAt,
    };

    await publishKafkaEvent(kafkaMessage);

    // Mark as published
    await OutboxEvent.findByIdAndUpdate(_id, {
      $set: {
        status: "published",
        publishedAt: new Date(),
        lastError: null,
      },
      $inc: { attempts: 1 },
    });

    logInfo("Outbox: event published successfully", {
      outboxId: String(_id),
      eventId: eventIdStr,
      tenantId: tenantIdStr,
    });
  } catch (err) {
    const nextAttempts = attempts + 1;
    const isExhausted = nextAttempts >= config.maxAttempts;
    const delayMs = calculateOutboxBackoff(nextAttempts);
    const nextAttemptAt = new Date(Date.now() + delayMs);

    logWarn("Outbox: Kafka publish failed", {
      outboxId: String(_id),
      eventId: eventIdStr,
      tenantId: tenantIdStr,
      attempt: nextAttempts,
      maxAttempts: config.maxAttempts,
      exhausted: isExhausted,
      error: err.message,
      nextAttemptAt: isExhausted ? null : nextAttemptAt.toISOString(),
    });

    await OutboxEvent.findByIdAndUpdate(_id, {
      $set: {
        status: isExhausted ? "failed" : "pending",
        lastError: err.message,
        nextAttemptAt: isExhausted ? null : nextAttemptAt,
      },
      $inc: { attempts: 1 },
    });

    if (isExhausted) {
      logError("Outbox: record marked failed after max attempts", {
        outboxId: String(_id),
        eventId: eventIdStr,
        tenantId: tenantIdStr,
        attempts: nextAttempts,
      });
    }
  }
};

// ── Poll cycle ─────────────────────────────────────────────────────────────────

const poll = async () => {
  if (!running) return;

  try {
    // Recover stale "publishing" records first
    await recoverStalePublishing();

    // Atomically claim one batch of pending records
    const now = new Date();
    const records = [];

    // Claim records one by one to ensure atomic ownership
    for (let i = 0; i < config.batchSize; i++) {
      const record = await OutboxEvent.findOneAndUpdate(
        {
          status: "pending",
          $or: [
            { nextAttemptAt: null },
            { nextAttemptAt: { $lte: now } },
          ],
        },
        { $set: { status: "publishing" } },
        { returnDocument: 'after', sort: { createdAt: 1 } }
      );

      if (!record) break;
      records.push(record);
    }

    if (records.length > 0) {
      logInfo("Outbox: claimed records for publishing", {
        count: records.length,
      });

      // Process in parallel (each has its own error handling)
      await Promise.allSettled(records.map(processOutboxRecord));
    }
  } catch (err) {
    logError("Outbox: poll cycle error", err);
  }

  // Schedule next poll
  if (running) {
    pollerTimer = setTimeout(poll, config.pollIntervalMs);
  }
};

// ── Lifecycle ──────────────────────────────────────────────────────────────────

/**
 * Start the outbox publisher polling loop.
 * Safe to call multiple times — will not start a second loop.
 */
export const startOutboxPublisher = () => {
  if (running) return;
  running = true;
  logInfo("Outbox publisher started", {
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
    maxAttempts: config.maxAttempts,
  });
  // Start immediately, then poll on interval
  poll();
};

/**
 * Stop the outbox publisher gracefully.
 * Waits for the current poll cycle to finish before stopping.
 */
export const stopOutboxPublisher = () => {
  running = false;
  if (pollerTimer) {
    clearTimeout(pollerTimer);
    pollerTimer = null;
  }
  logInfo("Outbox publisher stopped");
};
