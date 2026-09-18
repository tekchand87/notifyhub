// src/modules/worker/worker.logger.js
// Structured logger for the Worker pipeline.
//
// Keeps all console calls centralised so:
//  - log shape is consistent across the codebase
//  - switching to a real logger (winston, pino) later only requires editing this file
//  - sensitive data (passwords, email body) is never accidentally logged

const isProduction = process.env.NODE_ENV === "production";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const timestamp = () => new Date().toISOString();

const write = (level, message, meta = {}) => {
  const entry = {
    ts: timestamp(),
    level,
    service: "notifyhub-worker",
    message,
    ...meta,
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log general informational events.
 * @param {string} message
 * @param {object} [meta]
 */
export const logInfo = (message, meta = {}) => {
  write("info", message, meta);
};

/**
 * Log warnings (non-fatal, unexpected situations).
 * @param {string} message
 * @param {object} [meta]
 */
export const logWarn = (message, meta = {}) => {
  write("warn", message, meta);
};

/**
 * Log errors. Automatically extracts message and stack from Error objects.
 * Never logs SMTP passwords or email body content.
 * @param {string} message
 * @param {Error|object} [errorOrMeta]
 */
export const logError = (message, errorOrMeta = {}) => {
  let meta = {};

  if (errorOrMeta instanceof Error) {
    meta = {
      error: errorOrMeta.message,
      // Stack traces are only useful in non-production environments
      ...(isProduction ? {} : { stack: errorOrMeta.stack }),
    };
  } else {
    meta = errorOrMeta;
  }

  write("error", message, meta);
};

// ─── Domain-specific helpers (keep call sites clean) ─────────────────────────

/**
 * Logged when a Kafka message arrives and is parsed.
 */
export const logEventReceived = ({ eventId, tenantId, type, channel, topic, partition, offset }) => {
  logInfo("Event received", { eventId, tenantId, type, channel, topic, partition, offset });
};

/**
 * Logged when an event is skipped because it is no longer in 'queued' state.
 */
export const logEventSkipped = (eventId, reason = "event is not queued") => {
  logWarn("Event skipped", { eventId, reason });
};

/**
 * Logged after a successful delivery and MongoDB state update.
 */
export const logEventDelivered = ({ eventId, channel, result }) => {
  // Deliberately omit result.accepted addresses in production to limit PII in logs
  const safeResult = isProduction
    ? { messageId: result?.messageId }
    : result;

  logInfo("Event delivered successfully", { eventId, channel, result: safeResult });
};

/**
 * Logged when dispatch or delivery recording fails.
 */
export const logEventFailed = ({ eventId, channel, error }) => {
  logError("Event processing failed", {
    eventId,
    channel,
    error: error instanceof Error ? error.message : String(error),
  });
};

/**
 * Logged when a Delivery record is written to MongoDB.
 */
export const logDeliveryRecorded = ({ eventId, channel, status, attemptNumber }) => {
  logInfo("Delivery attempt recorded", { eventId, channel, status, attemptNumber });
};

/**
 * Logged on worker startup.
 */
export const logWorkerStarted = (meta = {}) => {
  logInfo("NotifyHub Worker is running", meta);
};

/**
 * Logged when a shutdown signal is received.
 */
export const logShutdownStarted = (signal) => {
  logInfo("Shutdown signal received", { signal });
};

/**
 * Logged after all connections are cleanly closed.
 */
export const logShutdownComplete = () => {
  logInfo("Worker shutdown complete");
};

// ─── Retry / DLQ helpers ─────────────────────────────────────────────────────

/**
 * Logged when a failed delivery is scheduled for retry.
 * @param {{ eventId, attempt, nextRetryAt, delayMs, reason }} params
 */
export const logRetryScheduled = ({ eventId, tenantId, attempt, nextRetryAt, delayMs, reason }) => {
  logInfo("Retry scheduled", { eventId, tenantId, attempt, nextRetryAt, delayMs, reason });
};

/**
 * Logged when max attempts are reached and the event moves to DLQ.
 * @param {{ eventId, tenantId, attempts, reason }} params
 */
export const logRetryExhausted = ({ eventId, tenantId, attempts, reason }) => {
  logWarn("Max retry attempts reached — moving to DLQ", { eventId, tenantId, attempts, reason });
};

/**
 * Logged when an event is successfully transitioned to DLQ.
 * @param {{ eventId, tenantId, deliveryId, attempts, reason }} params
 */
export const logDLQTransition = ({ eventId, tenantId, deliveryId, attempts, reason }) => {
  logWarn("Event moved to DLQ", { eventId, tenantId, deliveryId, attempts, reason });
};

/**
 * Logged when a DLQ Kafka publish fails (non-fatal — DLQ failure must not crash the worker).
 */
export const logDLQPublishFailed = ({ eventId, tenantId, error }) => {
  logError("DLQ Kafka publish failed (DB status is still dlq)", {
    eventId,
    tenantId,
    error: error instanceof Error ? error.message : String(error),
  });
};

// ─── Webhook delivery helpers ─────────────────────────────────────────────────

/**
 * Logged before each webhook HTTP POST attempt.
 * NEVER log the webhookSecret, Authorization header, or full URL with credentials.
 * @param {{ eventId, tenantId, attempt, webhookUrlHost }} params
 */
export const logWebhookAttempt = ({ eventId, tenantId, attempt, webhookUrlHost }) => {
  logInfo("Webhook delivery attempt", { eventId, tenantId, attempt, webhookUrlHost });
};

/**
 * Logged after a successful webhook delivery (2xx response received).
 * @param {{ eventId, tenantId, attempt, statusCode, durationMs }} params
 */
export const logWebhookSuccess = ({ eventId, tenantId, attempt, statusCode, durationMs }) => {
  logInfo("Webhook delivered successfully", { eventId, tenantId, attempt, statusCode, durationMs });
};

/**
 * Logged when a webhook delivery attempt fails.
 * @param {{ eventId, tenantId, attempt, statusCode, durationMs, retryable, reason }} params
 */
export const logWebhookFailed = ({ eventId, tenantId, attempt, statusCode, durationMs, retryable, reason }) => {
  logWarn("Webhook delivery failed", { eventId, tenantId, attempt, statusCode, durationMs, retryable, reason });
};

// ─── Retry polling loop helpers ───────────────────────────────────────────────

/**
 * Logged when the retry poll loop picks up events ready for retry.
 */
export const logRetryPollerPickup = ({ count }) => {
  if (count > 0) {
    logInfo("Retry poller: picked up events for retry", { count });
  }
};

/**
 * Logged when the retry poller encounters an unexpected error.
 */
export const logRetryPollerError = (error) => {
  logError("Retry poller error", error);
};
