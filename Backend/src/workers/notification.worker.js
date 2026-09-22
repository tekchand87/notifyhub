// src/workers/notification.worker.js
// Entry point for the Worker process.
// Startup order: environment → MongoDB → selected event broker → worker loop + pollers

import "dotenv/config";
import os from "os";
import crypto from "crypto";
import mongoose from "mongoose";
import { redactMongoError, redactMongoUri, validateMongoUri } from "../config/mongo-uri.js";

import { createEventBroker } from "../infrastructure/event-broker/index.js";

import { startWorker, stopWorker } from "../modules/worker/worker.service.js";
import { getWorkerConcurrency, mapWithConcurrency } from "../modules/worker/worker.concurrency.js";
import {
  getRetryReadyEvents,
  markEventProcessing,
  markEventDelivered,
  recoverStaleLeasedEvents,
} from "../modules/worker/worker.event.service.js";
import { dispatchNotification } from "../modules/worker/worker.dispatcher.js";
import { scheduleRetry, moveToDLQ, isRetryable } from "../modules/worker/retry.service.js";
import { Delivery } from "../modules/event/delivery.model.js";
import { retryConfig } from "../config/retry.config.js";

import {
  logInfo,
  logError,
  logWarn,
  logShutdownStarted,
  logShutdownComplete,
  logRetryPollerPickup,
  logRetryPollerError,
  logEventDelivered,
  logEventFailed,
  logDeliveryRecorded,
} from "../modules/worker/worker.logger.js";

// ─── Worker Instance Identity ─────────────────────────────────────────────────
// A unique ID for this worker process instance.
// Used in lease fields so operations teams can identify which worker holds each event.
// Format: hostname:pid:randomHex — human-readable but unique enough for diagnostics.
// We deliberately do NOT include the full FQDN or IP to avoid exposing internal topology.

const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString("hex")}`;

const mongoUri = process.env.MONGODB_URI;

// ─── Timing config ────────────────────────────────────────────────────────────
const getLeaseRecoveryIntervalMs = () =>
  Number(process.env.LEASE_RECOVERY_INTERVAL_MS) || 60_000; // 60s

let shuttingDown = false;
let shutdownTimer = null;
let retryPollerTimer = null;
let leaseRecoveryTimer = null;
let activeRetryPoll = null;
let eventBroker = null;

// ─── MongoDB ──────────────────────────────────────────────────────────────────

const connectMongo = async () => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }
  try {
    validateMongoUri(mongoUri);
    await mongoose.connect(mongoUri);
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${redactMongoError(error)}`);
  }
  logInfo("Worker MongoDB connected", { uri: redactMongoUri(mongoUri) });
};

// ─── Retry processing ─────────────────────────────────────────────────────────
// Processes a single event that has come back from retry_wait status.

const processRetryEvent = async (dbEvent) => {
  const eventId = String(dbEvent._id);
  const tenantId = String(dbEvent.tenantId);
  const currentAttempts = dbEvent.attempts ?? 0;
  const maxAttempts = dbEvent.maxAttempts ?? retryConfig.maxAttempts;

  // Atomically claim the event: retry_wait → processing (with worker lease)
  const claimed = await markEventProcessing(eventId, WORKER_ID);
  if (!claimed) {
    // Another worker already claimed it — skip silently
    return;
  }

  logInfo("Worker: retry event claimed", {
    eventId,
    tenantId,
    workerId: WORKER_ID,
    attempt: currentAttempts + 1,
    maxAttempts,
  });

  const enrichedEvent = {
    eventId,
    tenantId,
    type: dbEvent.type,
    channel: dbEvent.channel,
    payload: dbEvent.payload,
    attempt: currentAttempts + 1,
  };

  try {
    const result = await dispatchNotification(enrichedEvent);

    await Delivery.create({
      eventId,
      tenantId,
      attemptNumber: currentAttempts + 1,
      channel: dbEvent.channel,
      status: "success",
      messageId: result?.messageId ?? null,
      providerResponse: result?.providerResponse ?? result?.response ?? null,
      attemptedAt: new Date(),
    });

    logDeliveryRecorded({
      eventId,
      channel: dbEvent.channel,
      status: "success",
      attemptNumber: currentAttempts + 1,
    });

    await markEventDelivered(eventId);
    logEventDelivered({ eventId, channel: dbEvent.channel, result });
  } catch (error) {
    await Delivery.create({
      eventId,
      tenantId,
      attemptNumber: currentAttempts + 1,
      channel: dbEvent.channel,
      status: "failed",
      errorMessage: error.message,
      attemptedAt: new Date(),
    }).catch(() => {});

    logEventFailed({ eventId, channel: dbEvent.channel, error });

    const retryable = isRetryable(error);
    const newAttempts = currentAttempts + 1;

    if (retryable && newAttempts < maxAttempts) {
      await scheduleRetry(eventId, tenantId, newAttempts, error);
    } else {
      await moveToDLQ(eventId, tenantId, dbEvent.channel, newAttempts, error, process.env.KAFKA_TOPIC);
    }
  }
};

// ─── Retry polling loop ───────────────────────────────────────────────────────
// Runs independently of Kafka. Periodically checks MongoDB for retry_wait events
// whose nextRetryAt has passed. Retry state survives worker restarts.

const runRetryPoller = async () => {
  if (shuttingDown) return;

  const poll = (async () => {
    try {
      const dueEvents = await getRetryReadyEvents();
      logRetryPollerPickup({ count: dueEvents.length });

      await mapWithConcurrency(dueEvents, getWorkerConcurrency(), async (event) => {
        if (shuttingDown) return;
        await processRetryEvent(event).catch((err) => {
          logRetryPollerError(err);
        });
      });
    } catch (err) {
      logRetryPollerError(err);
    }
  })();
  activeRetryPoll = poll;
  await poll;
  if (activeRetryPoll === poll) activeRetryPoll = null;

  if (!shuttingDown) {
    retryPollerTimer = setTimeout(runRetryPoller, retryConfig.pollerIntervalMs);
  }
};

// ─── Stale-lease recovery poller ─────────────────────────────────────────────
// Detects events stuck in "processing" because their worker crashed.
// Resets them to "queued" so any live worker can reclaim them.
// Runs on a longer interval than the retry poller (default: 60s).

const runLeaseRecoveryPoller = async () => {
  if (shuttingDown) return;

  try {
    await recoverStaleLeasedEvents(20);
  } catch (err) {
    logError("Lease recovery poller error", err);
  }

  if (!shuttingDown) {
    leaseRecoveryTimer = setTimeout(runLeaseRecoveryPoller, getLeaseRecoveryIntervalMs());
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownTimer = setTimeout(() => process.exit(1), Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS) || 30_000);

  logShutdownStarted(signal);

  if (retryPollerTimer) {
    clearTimeout(retryPollerTimer);
    retryPollerTimer = null;
  }
  if (leaseRecoveryTimer) {
    clearTimeout(leaseRecoveryTimer);
    leaseRecoveryTimer = null;
  }

  try {
    // Stop fetching before waiting for handlers so no new delivery begins.
    await eventBroker?.stopConsumer?.();
    await stopWorker();
    if (activeRetryPoll) await activeRetryPoll.catch(() => {});
    await eventBroker?.disconnectWorker?.();
    await mongoose.disconnect();
    logShutdownComplete();
    clearTimeout(shutdownTimer);
    process.exit(exitCode);
  } catch (error) {
    logError("Worker shutdown failed", error);
    process.exit(1);
  }
};

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Keep the worker alive even if a rogue unhandled rejection slips through.
process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logError("Worker fatal unhandled rejection", error);
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (err) => {
  logError("Worker fatal uncaught exception", err);
  void shutdown("uncaughtException", 1);
});

// ─── Permanent event-loop keepalive ───────────────────────────────────────────
// The googleapis HTTPS client closes its keep-alive socket after each request,
// which can drain the event loop if Kafka has no pending heartbeats at that
// exact moment. This interval guarantees the process stays alive indefinitely
// regardless of third-party library teardown behaviour.
const _keepAlive = setInterval(() => {}, 2_147_483_647); // ~24 days

// ─── Boot ─────────────────────────────────────────────────────────────────────

const boot = async () => {
  logInfo("Worker starting", { workerId: WORKER_ID });

  await connectMongo();

  eventBroker = await createEventBroker();
  await eventBroker.initializeWorker?.();

  // Start the selected broker consumer loop (pass WORKER_ID for lease tracking).
  await startWorker(WORKER_ID, eventBroker);

  // KafkaJS owns consumer recovery/reconnect. Keep this listener for
  // structured observability only; do not start another consumer here.
  eventBroker.onCrash?.(({ payload }) => {
    logError("Consumer crashed; KafkaJS will handle recovery", payload.error);
  });


  // Start retry poller (every RETRY_POLLER_INTERVAL_MS, default 5s)
  retryPollerTimer = setTimeout(runRetryPoller, retryConfig.pollerIntervalMs);
  logInfo("Retry poller started", {
    intervalMs: retryConfig.pollerIntervalMs,
    concurrency: getWorkerConcurrency(),
  });

  // Start stale-lease recovery poller (every LEASE_RECOVERY_INTERVAL_MS, default 60s)
  // Run immediately on boot to recover any events left processing from a previous crash
  leaseRecoveryTimer = setTimeout(runLeaseRecoveryPoller, 0);
  logInfo("Lease recovery poller started", { intervalMs: getLeaseRecoveryIntervalMs() });
};

boot().catch(async (error) => {
  logError("Worker startup failed", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
