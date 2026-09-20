// Outbox Publisher — reliably moves committed MongoDB outbox records to the
// configured event broker.
// A MongoDB claim remains the source of ownership. Broker publication remains
// at-least-once: a crash after the broker acknowledges a batch but before
// MongoDB is updated causes stale-claim recovery to publish that batch again.

import crypto from "crypto";
import { OutboxEvent } from "../../modules/event/outbox.model.js";
import { createEventBroker } from "../event-broker/index.js";
import { logInfo, logWarn, logError } from "../../modules/worker/worker.logger.js";

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const config = {
  get pollIntervalMs() { return positiveInteger(process.env.OUTBOX_POLL_INTERVAL_MS, 25); },
  get batchSize() { return positiveInteger(process.env.OUTBOX_BATCH_SIZE, 500); },
  get concurrency() { return positiveInteger(process.env.OUTBOX_CONCURRENCY, 50); },
  get maxAttempts() { return positiveInteger(process.env.OUTBOX_MAX_ATTEMPTS, 5); },
  get staleMs() { return positiveInteger(process.env.OUTBOX_STALE_MS, 60_000); },
};

let pollerTimer = null;
let running = false;
let activePoll = null;
let configuredBroker = null;

const calculateOutboxBackoff = (attempt) => {
  const capped = Math.min(1_000 * Math.pow(2, attempt - 1), 60_000);
  return Math.floor(Math.random() * capped);
};

const recoverStalePublishing = async () => {
  const staleThreshold = new Date(Date.now() - config.staleMs);
  const result = await OutboxEvent.updateMany(
    { status: "publishing", updatedAt: { $lte: staleThreshold } },
    { $set: { status: "pending", claimToken: null, nextAttemptAt: null } }
  );
  if (result.modifiedCount > 0) {
    logWarn("Outbox: recovered stale publishing records", { count: result.modifiedCount });
  }
  return result.modifiedCount;
};

// Claim a whole candidate set with one status-guarded update. Competing
// publishers may read the same candidates, but only the first update can change
// each pending document, so ownership remains atomic per document.
const claimBatch = async () => {
  const claimToken = crypto.randomUUID();
  const now = new Date();
  const eligible = {
    status: "pending",
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  };
  const candidates = await OutboxEvent.find(eligible)
    .select("_id")
    .sort({ nextAttemptAt: 1, _id: 1 })
    .limit(config.batchSize)
    .lean();

  if (candidates.length === 0) return { records: [], claimToken };

  await OutboxEvent.updateMany(
    { ...eligible, _id: { $in: candidates.map(({ _id }) => _id) } },
    { $set: { status: "publishing", claimToken } }
  );

  const records = await OutboxEvent.find({ status: "publishing", claimToken })
    .sort({ nextAttemptAt: 1, _id: 1 })
    .lean();
  return { records, claimToken };
};

const eventForKafka = (record) => ({
  _id: record.eventId,
  tenantId: record.tenantId,
  topic: record.topic,
  type: record.payload.type,
  channel: record.payload.channel,
  payload: record.payload.payload,
  createdAt: record.payload.createdAt,
});

const markPublished = (records, claimToken) => OutboxEvent.bulkWrite(
  records.map((record) => ({
    updateOne: {
      filter: { _id: record._id, status: "publishing", claimToken },
      update: {
        $set: {
          status: "published", publishedAt: new Date(), lastAttemptAt: new Date(),
          lastError: null, claimToken: null,
        },
        $inc: { attempts: 1 },
      },
    },
  })),
  { ordered: false }
);

const markPublishFailed = (records, claimToken, error) => {
  const now = Date.now();
  return OutboxEvent.bulkWrite(
    records.map((record) => {
      const attempts = record.attempts + 1;
      // maxAttempts is stamped when Event + OutboxEvent are created. Retain
      // that per-record policy rather than changing exhaustion behaviour if an
      // environment variable is changed while records are in flight.
      const maxAttempts = positiveInteger(record.maxAttempts, config.maxAttempts);
      const exhausted = attempts >= maxAttempts;
      return {
        updateOne: {
          filter: { _id: record._id, status: "publishing", claimToken },
          update: {
            $set: {
              status: exhausted ? "failed" : "pending",
              claimToken: null,
              lastError: error.message,
              lastAttemptAt: new Date(now),
              failedAt: exhausted ? new Date(now) : null,
              nextAttemptAt: exhausted ? null : new Date(now + calculateOutboxBackoff(attempts)),
            },
            $inc: { attempts: 1 },
          },
        },
      };
    }),
    { ordered: false }
  );
};

const publishClaimedBatch = async (records, claimToken, broker) => {
  try {
    await broker.publishEvent(records.map(eventForKafka), { concurrency: config.concurrency });
    const result = await markPublished(records, claimToken);
    logInfo("Outbox: batch published", {
      broker: broker.mode,
      claimed: records.length,
      published: result.modifiedCount,
    });
    return { published: result.modifiedCount, failed: 0 };
  } catch (error) {
    const result = await markPublishFailed(records, claimToken, error);
    logWarn("Outbox: Kafka batch publish failed", {
      claimed: records.length, updated: result.modifiedCount, error: error.message,
      records: records.map((record) => ({
        outboxId: String(record._id), eventId: String(record.eventId), tenantId: String(record.tenantId),
        status: record.attempts + 1 >= positiveInteger(record.maxAttempts, config.maxAttempts) ? "failed" : "pending",
        attempt: record.attempts + 1,
      })),
    });
    return { published: 0, failed: result.modifiedCount };
  }
};

/** Run one complete outbox cycle. Exported for focused integration tests. */
export const runOutboxPublisherCycle = async () => {
  const broker = configuredBroker || await createEventBroker();
  await recoverStalePublishing();
  const { records, claimToken } = await claimBatch();
  if (records.length === 0) return { claimed: 0, published: 0, failed: 0 };

  logInfo("Outbox: claimed records for publishing", { count: records.length });
  const result = await publishClaimedBatch(records, claimToken, broker);
  return { claimed: records.length, ...result };
};

const schedulePoll = (delayMs) => {
  if (running) pollerTimer = setTimeout(runScheduledPoll, delayMs);
};

const runScheduledPoll = async () => {
  if (!running) return;
  activePoll = runOutboxPublisherCycle();
  let result;
  try {
    result = await activePoll;
  } catch (error) {
    logError("Outbox: poll cycle error", error);
  } finally {
    activePoll = null;
  }
  if (running) schedulePoll(result?.claimed === config.batchSize ? 0 : config.pollIntervalMs);
};

export const startOutboxPublisher = (broker = null) => {
  if (running) return;
  configuredBroker = broker;
  running = true;
  logInfo("Outbox publisher started", {
    broker: broker?.mode || process.env.EVENT_BROKER || "kafka",
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    maxAttempts: config.maxAttempts,
  });
  schedulePoll(0);
};

/** Stop scheduling work and wait for the currently claimed batch to settle. */
export const stopOutboxPublisher = async () => {
  running = false;
  if (pollerTimer) {
    clearTimeout(pollerTimer);
    pollerTimer = null;
  }
  if (activePoll) await activePoll.catch(() => {});
  configuredBroker = null;
  logInfo("Outbox publisher stopped");
};
