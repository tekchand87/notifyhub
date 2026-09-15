// src/modules/worker/worker.event.service.js
// Atomic Event status transition functions for the notification worker.
//
// Design principles:
//   1. Every transition uses findOneAndUpdate with a status guard — not find() then update().
//      This prevents two workers from processing the same event simultaneously.
//   2. State machine transitions are validated by assertValidTransition() before
//      the DB operation. Invalid transitions (e.g. delivered→queued) are rejected.
//   3. Worker lease fields are set atomically during processing claim.
//      The stale-lease recovery function resets events whose lease has expired.
//   4. Lifecycle timestamps (deliveredAt, failedAt, dlqAt) are set as events
//      reach terminal states. These support analytics and debugging.

import mongoose from "mongoose";
import { Event } from "../event/event.model.js";
import { EVENT_STATUS } from "../event/event.constants.js";
import { assertValidTransition } from "../event/event.transitions.js";
import { logInfo, logWarn } from "./worker.logger.js";

// ── Default lease duration ─────────────────────────────────────────────────────
const getLeaseMs = () =>
  Number(process.env.PROCESSING_LEASE_MS) || 300_000; // 5 minutes

// ── queued/retry_wait → processing ────────────────────────────────────────────
/**
 * Atomically claim an event for processing.
 * Sets lease fields so the stale-lease recovery poller can detect crashed workers.
 *
 * @param {string} eventId
 * @param {string} workerId - Unique worker instance identifier
 * @param {number} [leaseMs] - Override the default lease duration
 * @returns {Promise<object|null>} Updated event or null if claim failed
 */
export const markEventProcessing = async (eventId, workerId, leaseMs) => {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new Error(`Invalid eventId: ${eventId}`);
  }

  const leaseDuration = leaseMs ?? getLeaseMs();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDuration);

  return Event.findOneAndUpdate(
    {
      _id: eventId,
      // Accept freshly queued events OR events returning from retry_wait
      status: { $in: [EVENT_STATUS.QUEUED, EVENT_STATUS.RETRY_WAIT] },
    },
    {
      $set: {
        status: EVENT_STATUS.PROCESSING,
        processingStartedAt: now,
        leaseExpiresAt,
        workerId: workerId || null,
      },
    },
    { returnDocument: 'after' }
  );
};

// ── processing → delivered ─────────────────────────────────────────────────────
export const markEventDelivered = async (eventId) => {
  assertValidTransition(EVENT_STATUS.PROCESSING, EVENT_STATUS.DELIVERED);

  return Event.findOneAndUpdate(
    { _id: eventId, status: EVENT_STATUS.PROCESSING },
    {
      $set: {
        status: EVENT_STATUS.DELIVERED,
        nextRetryAt: null,
        lastError: null,
        leaseExpiresAt: null,
        workerId: null,
        deliveredAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
};

// ── processing → failed (permanent, non-retryable) ────────────────────────────
export const markEventFailed = async (eventId, errorMessage = null) => {
  assertValidTransition(EVENT_STATUS.PROCESSING, EVENT_STATUS.FAILED);

  return Event.findOneAndUpdate(
    { _id: eventId, status: EVENT_STATUS.PROCESSING },
    {
      $set: {
        status: EVENT_STATUS.FAILED,
        leaseExpiresAt: null,
        workerId: null,
        failedAt: new Date(),
        ...(errorMessage ? { lastError: errorMessage } : {}),
      },
    },
    { returnDocument: 'after' }
  );
};

// ── processing → retry_wait ───────────────────────────────────────────────────
/**
 * Atomically move an event from processing to retry_wait.
 * Increments the attempt counter and records when the next retry is due.
 * State survives worker restarts because nextRetryAt is persisted in MongoDB.
 *
 * @param {string} eventId
 * @param {Date} nextRetryAt
 * @param {number} attempts - New total attempts count
 * @param {string} [lastError]
 */
export const markEventRetryWait = async (eventId, nextRetryAt, attempts, lastError = null) => {
  assertValidTransition(EVENT_STATUS.PROCESSING, EVENT_STATUS.RETRY_WAIT);

  return Event.findOneAndUpdate(
    { _id: eventId, status: EVENT_STATUS.PROCESSING },
    {
      $set: {
        status: EVENT_STATUS.RETRY_WAIT,
        nextRetryAt,
        attempts,
        leaseExpiresAt: null,
        workerId: null,
        ...(lastError ? { lastError } : {}),
      },
    },
    { returnDocument: 'after' }
  );
};

// ── processing/retry_wait → dlq ───────────────────────────────────────────────
export const markEventDLQ = async (eventId, lastError = null) => {
  // DLQ can be reached from processing (non-retryable at max attempts)
  // We don't call assertValidTransition here because the "from" state
  // is unknown at this point — the caller knows it's processing.
  // The status guard in the DB query is the safety net.

  return Event.findOneAndUpdate(
    {
      _id: eventId,
      status: { $in: [EVENT_STATUS.PROCESSING, EVENT_STATUS.RETRY_WAIT] },
    },
    {
      $set: {
        status: EVENT_STATUS.DLQ,
        nextRetryAt: null,
        leaseExpiresAt: null,
        workerId: null,
        dlqAt: new Date(),
        ...(lastError ? { lastError } : {}),
      },
    },
    { returnDocument: 'after' }
  );
};

// ── Retry poller query ─────────────────────────────────────────────────────────
/**
 * Find retry_wait events that are due for retry.
 * Limited to 50 per poll to avoid overwhelming the system.
 * The caller atomically claims each event via markEventProcessing.
 */
export const getRetryReadyEvents = async () => {
  return Event.find({
    status: EVENT_STATUS.RETRY_WAIT,
    nextRetryAt: { $lte: new Date() },
  })
    .select("_id tenantId type channel payload attempts maxAttempts")
    .limit(50)
    .lean();
};

// ── Stale-lease recovery ──────────────────────────────────────────────────────
/**
 * Find events that are stuck in "processing" with an expired lease.
 * These events were claimed by a worker that crashed before completion.
 * Atomically reset them to "queued" so they can be reclaimed by any worker.
 *
 * This is safe to call from multiple worker instances simultaneously.
 * The atomic findOneAndUpdate ensures only one worker resets each stale event.
 *
 * @param {number} [limit=20] - Maximum events to recover per call
 * @returns {Promise<number>} Number of events recovered
 */
export const recoverStaleLeasedEvents = async (limit = 20) => {
  const now = new Date();
  let recovered = 0;

  for (let i = 0; i < limit; i++) {
    const result = await Event.findOneAndUpdate(
      {
        status: EVENT_STATUS.PROCESSING,
        leaseExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: EVENT_STATUS.QUEUED,
          processingStartedAt: null,
          leaseExpiresAt: null,
          workerId: null,
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) break;

    recovered++;
    logWarn("Worker: stale lease recovered — event requeued", {
      eventId: String(result._id),
      tenantId: String(result.tenantId),
      previousWorkerId: result.workerId,
      attempts: result.attempts,
    });
  }

  if (recovered > 0) {
    logInfo("Stale lease recovery complete", { recovered });
  }

  return recovered;
};
