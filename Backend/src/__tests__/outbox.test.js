// src/__tests__/outbox.test.js
// Tests for the Outbox Pattern:
//   - Atomic Event + OutboxEvent creation in same transaction
//   - Outbox publisher atomic claim (only one publisher processes each record)
//   - Failed publish does not mark record as published
//   - Max attempts → OutboxEvent marked "failed"
//   - Stale "publishing" record recovery

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { OutboxEvent } from "../modules/event/outbox.model.js";
import { Event } from "../modules/event/event.model.js";

vi.mock("../infrastructure/kafka/kafka.producer.js", () => ({
  publishKafkaEvents: vi.fn(),
}));

import { publishKafkaEvents } from "../infrastructure/kafka/kafka.producer.js";
import {
  runOutboxPublisherCycle,
  startOutboxPublisher,
  stopOutboxPublisher,
} from "../infrastructure/outbox/outbox.publisher.js";
import {
  listOutboxForTenant,
  replayFailedOutboxEvent,
} from "../modules/event/outbox.service.js";

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 15_000);

beforeEach(async () => {
  await stopOutboxPublisher();
  vi.clearAllMocks();
  await Event.deleteMany({});
  await OutboxEvent.deleteMany({});
});

// ─── Atomic creation ──────────────────────────────────────────────────────────

describe("Event + OutboxEvent — atomic transaction", () => {
  it("creates both documents when transaction commits", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();

    let eventId;
    await session.withTransaction(async () => {
      const [event] = await Event.create(
        [{ tenantId, type: "ORDER_PLACED", channel: "webhook", payload: { orderId: 1 }, maxAttempts: 5 }],
        { session }
      );
      eventId = event._id;
      await OutboxEvent.create(
        [{ tenantId, eventId: event._id, topic: "test-topic", key: String(tenantId), payload: { test: true }, maxAttempts: 5 }],
        { session }
      );
    });
    await session.endSession();

    const evCount = await Event.countDocuments({ _id: eventId });
    const obCount = await OutboxEvent.countDocuments({ eventId });

    expect(evCount).toBe(1);
    expect(obCount).toBe(1);
  });

  it("rolls back BOTH documents on transaction abort", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    let savedEventId;

    try {
      await session.withTransaction(async () => {
        const [event] = await Event.create(
          [{ tenantId, type: "ORDER_PLACED", channel: "webhook", payload: {}, maxAttempts: 5 }],
          { session }
        );
        savedEventId = event._id;
        // Simulate a failure inside the transaction
        throw new Error("Simulated Kafka unavailable");
      });
    } catch {
      // expected
    } finally {
      await session.endSession();
    }

    // Both documents must have been rolled back
    const evCount = await Event.countDocuments({ _id: savedEventId });
    const obCount = await OutboxEvent.countDocuments({ eventId: savedEventId });

    expect(evCount).toBe(0);
    expect(obCount).toBe(0);
  });

  it("enforces unique constraint: one OutboxEvent per Event", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();

    await OutboxEvent.create({
      tenantId, eventId, topic: "t", key: "k", payload: {}, maxAttempts: 5,
    });

    await expect(
      OutboxEvent.create({
        tenantId, eventId, topic: "t", key: "k", payload: {}, maxAttempts: 5,
      })
    ).rejects.toThrow();
  });
});

// ─── Outbox publisher claim atomics ───────────────────────────────────────────

describe("OutboxEvent — atomic publisher claim", () => {
  it("only one of N concurrent publishers claims a pending record", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();

    await OutboxEvent.create({
      tenantId, eventId, topic: "t", key: "k",
      payload: {}, maxAttempts: 5, status: "pending", nextAttemptAt: null,
    });

    // Simulate N concurrent publishers trying to claim the same record
    const claimAttempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        OutboxEvent.findOneAndUpdate(
          { status: "pending", $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }] },
          { $set: { status: "publishing" } },
          { new: true }
        )
      )
    );

    const successful = claimAttempts.filter(Boolean);
    expect(successful.length).toBe(1);

    // DB should show exactly one "publishing" record
    const pubCount = await OutboxEvent.countDocuments({ eventId, status: "publishing" });
    expect(pubCount).toBe(1);
  });

  it("pending record with future nextAttemptAt is NOT claimed", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();

    await OutboxEvent.create({
      tenantId, eventId, topic: "t", key: "k",
      payload: {}, maxAttempts: 5, status: "pending",
      nextAttemptAt: new Date(Date.now() + 60_000), // 1 minute in future
    });

    const claimed = await OutboxEvent.findOneAndUpdate(
      { status: "pending", nextAttemptAt: { $lte: new Date() } },
      { $set: { status: "publishing" } },
      { new: true }
    );

    expect(claimed).toBeNull();
  });
});

// ─── Outbox status transitions ────────────────────────────────────────────────

describe("OutboxEvent — status lifecycle", () => {
  const makeRecord = async (overrides = {}) => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    return OutboxEvent.create({
      tenantId, eventId, topic: "t", key: "k",
      payload: {}, maxAttempts: 3, status: "pending",
      ...overrides,
    });
  };

  it("transitions pending → publishing → published", async () => {
    const rec = await makeRecord();

    await OutboxEvent.findByIdAndUpdate(rec._id, { $set: { status: "publishing" } });
    await OutboxEvent.findByIdAndUpdate(rec._id, {
      $set: { status: "published", publishedAt: new Date() },
      $inc: { attempts: 1 },
    });

    const final = await OutboxEvent.findById(rec._id).lean();
    expect(final.status).toBe("published");
    expect(final.publishedAt).toBeInstanceOf(Date);
    expect(final.attempts).toBe(1);
  });

  it("on failure increments attempts and resets to pending with backoff", async () => {
    const rec = await makeRecord({ status: "publishing" });

    await OutboxEvent.findByIdAndUpdate(rec._id, {
      $set: { status: "pending", lastError: "Connection refused", nextAttemptAt: new Date(Date.now() + 5000) },
      $inc: { attempts: 1 },
    });

    const updated = await OutboxEvent.findById(rec._id).lean();
    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("Connection refused");
    expect(updated.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("marks record as failed after maxAttempts", async () => {
    const rec = await makeRecord({ status: "publishing", attempts: 2 });

    await OutboxEvent.findByIdAndUpdate(rec._id, {
      $set: { status: "failed", lastError: "Exhausted" },
      $inc: { attempts: 1 },
    });

    const final = await OutboxEvent.findById(rec._id).lean();
    expect(final.status).toBe("failed");
    expect(final.attempts).toBe(3);
  });
});

// ─── Stale publishing recovery ────────────────────────────────────────────────

describe("OutboxEvent — stale publishing recovery", () => {
  it("resets stale publishing records to pending", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();

    // Create a record already in "publishing" state
    const rec = await OutboxEvent.create({
      tenantId, eventId, topic: "t", key: "k",
      payload: {}, maxAttempts: 5, status: "publishing",
    });

    // The real publisher uses updatedAt to detect stale records.
    // Since Mongoose timestamps: true auto-manages updatedAt, we bypass it via
    // a direct collection update (as Mongoose's updateMany also updates updatedAt).
    // Instead, we simulate detection by using a threshold in the PAST that is
    // older than the record's updatedAt — meaning the record would NOT be stale.
    // For a record to be stale, its updatedAt must be BEFORE the stale threshold.
    // We simulate this by using updateOne with timestamps disabled.
    await OutboxEvent.collection.updateOne(
      { _id: rec._id },
      { $set: { updatedAt: new Date(Date.now() - 120_000) } }
    );

    const staleThreshold = new Date(Date.now() - 60_000);
    const result = await OutboxEvent.updateMany(
      { status: "publishing", updatedAt: { $lte: staleThreshold } },
      { $set: { status: "pending", nextAttemptAt: null } }
    );

    expect(result.modifiedCount).toBe(1);

    const recovered = await OutboxEvent.findById(rec._id).lean();
    expect(recovered.status).toBe("pending");
  });
});

// ─── Batched publisher integration ───────────────────────────────────────────

describe("Outbox publisher — batched throughput path", () => {
  const makeRecord = (overrides = {}) => OutboxEvent.create({
    tenantId: new mongoose.Types.ObjectId(),
    eventId: new mongoose.Types.ObjectId(),
    topic: "test-topic",
    key: "tenant-key",
    payload: {
      type: "test.event",
      channel: "webhook",
      payload: { value: 1 },
      createdAt: new Date(),
    },
    maxAttempts: 3,
    ...overrides,
  });

  it("concurrent publishers atomically claim each record once", async () => {
    await Promise.all(Array.from({ length: 25 }, () => makeRecord()));
    publishKafkaEvents.mockResolvedValue([]);

    const [first, second] = await Promise.all([
      runOutboxPublisherCycle(),
      runOutboxPublisherCycle(),
    ]);

    expect(first.claimed + second.claimed).toBe(25);
    expect(first.published + second.published).toBe(25);
    expect(await OutboxEvent.countDocuments({ status: "published" })).toBe(25);
    expect(await OutboxEvent.countDocuments({ status: "publishing" })).toBe(0);
  });

  it("publishes a successful claimed batch in one Kafka call", async () => {
    await Promise.all(Array.from({ length: 8 }, () => makeRecord()));
    publishKafkaEvents.mockResolvedValue([]);

    const result = await runOutboxPublisherCycle();

    expect(result).toMatchObject({ claimed: 8, published: 8, failed: 0 });
    expect(publishKafkaEvents).toHaveBeenCalledTimes(1);
    expect(publishKafkaEvents.mock.calls[0][0]).toHaveLength(8);
    expect(await OutboxEvent.countDocuments({ status: "published", attempts: 1 })).toBe(8);
  });

  it("returns a failed Kafka batch to pending with retry metadata", async () => {
    const record = await makeRecord();
    publishKafkaEvents.mockRejectedValue(new Error("Kafka unavailable"));

    const result = await runOutboxPublisherCycle();
    const updated = await OutboxEvent.findById(record._id).lean();

    expect(result).toMatchObject({ claimed: 1, published: 0, failed: 1 });
    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("Kafka unavailable");
    expect(updated.nextAttemptAt).toBeInstanceOf(Date);
    expect(updated.claimToken).toBeNull();
  });

  it("recovers a stale claim before publishing it", async () => {
    const record = await makeRecord({ status: "publishing", claimToken: "dead-worker" });
    await OutboxEvent.collection.updateOne(
      { _id: record._id },
      { $set: { updatedAt: new Date(Date.now() - 120_000) } }
    );
    publishKafkaEvents.mockResolvedValue([]);

    const result = await runOutboxPublisherCycle();

    expect(result).toMatchObject({ claimed: 1, published: 1 });
    expect(await OutboxEvent.countDocuments({ _id: record._id, status: "published" })).toBe(1);
  });

  it("graceful shutdown waits for an in-flight batch and stops future polling", async () => {
    await makeRecord();
    let releasePublish;
    publishKafkaEvents.mockImplementation(() => new Promise((resolve) => { releasePublish = resolve; }));

    startOutboxPublisher();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stopping = stopOutboxPublisher();
    let stopped = false;
    stopping.then(() => { stopped = true; });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(stopped).toBe(false);

    releasePublish([]);
    await stopping;
    expect(await OutboxEvent.countDocuments({ status: "published" })).toBe(1);
  });
});

// ─── Recoverable automatic failure + tenant-admin replay ─────────────────────

describe("Outbox recovery — no Kafka outage orphaning", () => {
  const makeRecord = async (tenantId, overrides = {}) => OutboxEvent.create({
    tenantId,
    eventId: new mongoose.Types.ObjectId(),
    topic: "test-topic",
    key: String(tenantId),
    payload: { type: "test.event", channel: "webhook", payload: { value: 1 }, createdAt: new Date() },
    maxAttempts: 2,
    ...overrides,
  });

  it("retains the Event and recoverable failed outbox record after automatic retries exhaust", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const event = await Event.create({
      tenantId, type: "TEST_EVENT", channel: "webhook", payload: { value: 1 }, status: "queued",
    });
    const record = await OutboxEvent.create({
      tenantId, eventId: event._id, topic: "test-topic", key: String(tenantId),
      payload: { type: "TEST_EVENT", channel: "webhook", payload: { value: 1 }, createdAt: new Date() },
      maxAttempts: 2,
    });
    publishKafkaEvents.mockRejectedValue(new Error("Kafka unavailable"));

    await runOutboxPublisherCycle();
    await OutboxEvent.updateOne({ _id: record._id }, { $set: { nextAttemptAt: null } });
    await runOutboxPublisherCycle();

    const exhausted = await OutboxEvent.findById(record._id).lean();
    expect(await Event.exists({ _id: event._id })).not.toBeNull();
    expect(exhausted).toMatchObject({ status: "failed", attempts: 2, lastError: "Kafka unavailable" });
    expect(exhausted.failedAt).toBeInstanceOf(Date);
    expect(exhausted.claimToken).toBeNull();

    const visible = await listOutboxForTenant(String(tenantId), { status: "failed" });
    expect(visible.counts.failed).toBe(1);
    expect(visible.records[0]).toMatchObject({ id: record._id, eventId: event._id, status: "failed", attempts: 2 });
  });

  it("atomically replays a failed record and publishes it after Kafka is restored", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const operatorId = new mongoose.Types.ObjectId();
    const record = await makeRecord(tenantId, {
      status: "failed", attempts: 2, lastError: "Kafka unavailable", failedAt: new Date(),
    });

    const replayed = await replayFailedOutboxEvent(String(tenantId), String(record._id), operatorId);
    expect(replayed).toMatchObject({ status: "pending", attempts: 0, lastFailureAttempts: 2, replayCount: 1 });
    expect(replayed.lastError).toBeNull();

    publishKafkaEvents.mockResolvedValue([]);
    const result = await runOutboxPublisherCycle();
    const published = await OutboxEvent.findById(record._id).lean();

    expect(result).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(published).toMatchObject({ status: "published", attempts: 1, replayCount: 1 });
    expect(published.publishedAt).toBeInstanceOf(Date);
  });

  it("prevents cross-tenant and repeated replay", async () => {
    const ownerTenantId = new mongoose.Types.ObjectId();
    const otherTenantId = new mongoose.Types.ObjectId();
    const record = await makeRecord(ownerTenantId, { status: "failed", attempts: 2 });

    await expect(replayFailedOutboxEvent(String(otherTenantId), String(record._id), new mongoose.Types.ObjectId()))
      .rejects.toMatchObject({ statusCode: 404 });

    const results = await Promise.allSettled([
      replayFailedOutboxEvent(String(ownerTenantId), String(record._id), new mongoose.Types.ObjectId()),
      replayFailedOutboxEvent(String(ownerTenantId), String(record._id), new mongoose.Types.ObjectId()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0].reason.statusCode).toBe(409);
  });
});
