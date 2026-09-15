// src/workers/notification.worker.js
// Entry point for the Worker process.
// Startup order: environment → MongoDB → Kafka consumer + DLQ → worker loop + pollers

import "dotenv/config";
import os from "os";
import crypto from "crypto";
import mongoose from "mongoose";

import {
  connectKafkaConsumer,
  subscribeKafkaConsumer,
  disconnectedKafkaConsumer,
} from "../infrastructure/kafka/kafka.consumer.js";

import { ensureDLQTopic } from "../infrastructure/kafka/kafka.admin.js";
import {
  connectDLQProducer,
  disconnectDLQProducer,
} from "../infrastructure/kafka/dlq.publisher.js";

import { startWorker } from "../modules/worker/worker.service.js";
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
let retryPollerTimer = null;
let leaseRecoveryTimer = null;

// ─── MongoDB ──────────────────────────────────────────────────────────────────

const connectMongo = async () => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }
  await mongoose.connect(mongoUri);
  logInfo("Worker MongoDB connected", { uri: mongoUri.replace(/\/\/.*@/, "//***@") });
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

  try {
    const dueEvents = await getRetryReadyEvents();
    logRetryPollerPickup({ count: dueEvents.length });

    // Process sequentially to avoid overwhelming DB/external services
    for (const event of dueEvents) {
      if (shuttingDown) break;
      await processRetryEvent(event).catch((err) => {
        logRetryPollerError(err);
      });
    }
  } catch (err) {
    logRetryPollerError(err);
  }

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

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

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
    await disconnectedKafkaConsumer();
    await disconnectDLQProducer();
    await mongoose.disconnect();
    logShutdownComplete();
    process.exit(0);
  } catch (error) {
    logError("Worker shutdown failed", error);
    process.exit(1);
  }
};

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Boot ─────────────────────────────────────────────────────────────────────

const boot = async () => {
  logInfo("Worker starting", { workerId: WORKER_ID });

  await connectMongo();

  // Ensure Kafka topics exist (main + DLQ)
  await ensureDLQTopic();

  // Connect consumer and DLQ producer
  await connectKafkaConsumer();
  await subscribeKafkaConsumer();
  await connectDLQProducer();

  logInfo("DLQ producer connected");

  // Start Kafka consumer loop (pass WORKER_ID for lease tracking)
  await startWorker(WORKER_ID);


  // Start retry poller (every RETRY_POLLER_INTERVAL_MS, default 5s)
  retryPollerTimer = setTimeout(runRetryPoller, retryConfig.pollerIntervalMs);
  logInfo("Retry poller started", { intervalMs: retryConfig.pollerIntervalMs });

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
