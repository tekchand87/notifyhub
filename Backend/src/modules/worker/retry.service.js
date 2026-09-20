// src/modules/worker/retry.service.js
// Retry and DLQ logic for the NotifyHub worker pipeline.
//
// Retry design:
//   - Exponential backoff with full jitter to prevent thundering herd
//   - State is persisted in MongoDB (survives worker restart)
//   - Retry scheduling is atomic: findOneAndUpdate with status guard
//   - DLQ transition updates MongoDB durably. Kafka mode also best-effort
//     publishes the existing Kafka DLQ record; SQS mode relies on queue redrive
//     for queue failures and does not manually publish to an SQS DLQ.

import { retryConfig } from "../../config/retry.config.js";
import { createEventBroker } from "../../infrastructure/event-broker/index.js";
import {
  markEventRetryWait,
  markEventDLQ,
} from "./worker.event.service.js";
import {
  logRetryScheduled,
  logRetryExhausted,
  logDLQTransition,
  logDLQPublishFailed,
} from "./worker.logger.js";

// ─── Error classification ─────────────────────────────────────────────────────

/**
 * Classify an error as retryable or not.
 *
 * Retryable:
 *   - Network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET)
 *   - Timeout (AbortError)
 *   - HTTP 408, 425, 429, 5xx via WebhookDeliveryError.retryable
 *
 * Non-retryable:
 *   - Invalid payload / parse errors
 *   - Malformed webhook URL
 *   - HTTP 400, 401, 403 (auth failures that won't be fixed by retry)
 *   - WebhookDeliveryError with retryable=false
 *   - Missing tenant / misconfiguration errors
 */
export const isRetryable = (error) => {
  // Webhook handler explicitly marks retryability
  if (error?.retryable === true) return true;
  if (error?.retryable === false) return false;

  // Network-level errors from Node.js fetch / net
  if (error?.name === "AbortError") return true;

  const code = error?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  // Non-retryable: parsing errors, validation errors
  if (
    error?.message?.includes("invalid JSON") ||
    error?.message?.includes("Invalid webhook URL") ||
    error?.message?.includes("no webhookUrl configured") ||
    error?.message?.includes("Tenant not found")
  ) {
    return false;
  }

  // Default to retryable for unknown errors to avoid premature failure
  return true;
};

// ─── Backoff calculation ──────────────────────────────────────────────────────

/**
 * Calculate the next retry delay using exponential backoff with full jitter.
 *
 * Formula: actualDelay = random(0, min(base * 2^(attempt-1), maxDelay))
 *
 * This is the "full jitter" strategy from AWS Architecture Blog, which
 * prevents thundering-herd when many workers retry simultaneously.
 *
 * @param {number} attempt - 1-based attempt number (1 = first retry)
 * @returns {number} delay in milliseconds
 */
export const calculateBackoffDelay = (attempt) => {
  const { baseDelayMs, maxDelayMs } = retryConfig;
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: random value in [0, capped]
  return Math.floor(Math.random() * capped);
};

// ─── State transitions ────────────────────────────────────────────────────────

/**
 * Schedule a retry for a failed event.
 * Updates Event status to retry_wait and sets nextRetryAt.
 * State survives worker restart because it is persisted in MongoDB.
 *
 * @param {string} eventId
 * @param {string} tenantId
 * @param {number} currentAttempts - How many attempts have been made so far
 * @param {Error} error - The error that caused the failure
 * @returns {Promise<Date>} nextRetryAt
 */
export const scheduleRetry = async (eventId, tenantId, currentAttempts, error) => {
  const nextAttempt = currentAttempts + 1;
  const delayMs = calculateBackoffDelay(nextAttempt);
  const nextRetryAt = new Date(Date.now() + delayMs);

  const updated = await markEventRetryWait(eventId, nextRetryAt, currentAttempts + 1, error.message);
  if (!updated) {
    throw new Error("Durable event transition did not apply: processing -> retry_wait");
  }

  logRetryScheduled({
    eventId,
    tenantId,
    attempt: nextAttempt,
    nextRetryAt: nextRetryAt.toISOString(),
    delayMs,
    reason: error.message,
  });

  return nextRetryAt;
};

/**
 * Move an event to DLQ after all retry attempts are exhausted.
 * 1. Publish DLQ record to Kafka (best-effort — failure is logged, not thrown)
 * 2. Update event status to "dlq" in MongoDB (always done)
 *
 * @param {string} eventId
 * @param {string} tenantId
 * @param {string} channel
 * @param {number} attempts - Total attempts made
 * @param {Error} lastError
 * @param {string} [originalTopic]
 */
export const moveToDLQ = async (eventId, tenantId, channel, attempts, lastError, originalTopic) => {
  const reason = lastError?.message ?? "max attempts exceeded";

  logRetryExhausted({ eventId, tenantId, attempts, reason });

  // 1. Update DB status to dlq. This MongoDB terminal state is the durable
  // outcome needed before the Kafka source record can be acknowledged.
  const updated = await markEventDLQ(eventId, lastError?.message ?? reason);
  if (!updated) {
    throw new Error("Durable event transition did not apply: processing -> dlq");
  }

  // 2. Publish the application-level DLQ record when the selected broker
  // supports it. SQS queue-level failures are handled by visibility timeout
  // and redrive policy, so the SQS adapter intentionally returns a no-op.
  const broker = await createEventBroker();
  const dlqResult = await broker.publishDlq?.({
    eventId,
    tenantId,
    channel,
    attempts,
    reason,
    lastError: lastError?.message ?? null,
    originalTopic,
  }) || { ok: false, error: "Selected broker has no application-level DLQ publisher" };

  if (!dlqResult.ok) {
    logDLQPublishFailed({ eventId, tenantId, error: new Error(dlqResult.error) });
  }

  logDLQTransition({
    eventId,
    tenantId,
    deliveryId: null,
    attempts,
    reason,
  });
};
