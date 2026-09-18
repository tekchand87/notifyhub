// src/__tests__/idempotency.test.js
// Tests for idempotency: race safety, fingerprint conflict detection, tenant isolation.
// Uses MongoDB Memory Server for real index behavior (no mocking of unique index).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  validateIdempotencyKey,
  computeFingerprint,
  claimIdempotencySlot,
  markIdempotencyComplete,
  deleteIdempotencyRecord,
} from "../modules/event/idempotency.service.js";
import { IdempotencyRecord } from "../modules/event/idempotency.model.js";
import { Event } from "../modules/event/event.model.js";
import { OutboxEvent } from "../modules/event/outbox.model.js";
import { publishEvent } from "../modules/event/event.service.js";

process.env.KAFKA_TOPIC = "idempotency-test-topic";

// Use a replica set so TTL index and transactions work correctly
let replSet;

beforeAll(async () => {
  // MongoMemoryReplSet for realistic index + TTL behavior
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
}, 15_000);

beforeEach(async () => {
  await IdempotencyRecord.deleteMany({});
  await Event.deleteMany({});
  await OutboxEvent.deleteMany({});
  vi.restoreAllMocks();
});

// ─── Key validation ────────────────────────────────────────────────────────────

describe("validateIdempotencyKey", () => {
  it("accepts valid keys", () => {
    expect(() => validateIdempotencyKey("abc-123")).not.toThrow();
    expect(() => validateIdempotencyKey("order_XYZ.001")).not.toThrow();
    expect(() => validateIdempotencyKey("A".repeat(255))).not.toThrow();
  });

  it("rejects empty key", () => {
    expect(() => validateIdempotencyKey("")).toThrow(/empty/);
  });

  it("rejects key over 255 characters", () => {
    expect(() => validateIdempotencyKey("A".repeat(256))).toThrow(/255/);
  });

  it("rejects keys with unsafe characters", () => {
    expect(() => validateIdempotencyKey("key with spaces")).toThrow();
    expect(() => validateIdempotencyKey("key\x00null")).toThrow();
    expect(() => validateIdempotencyKey("<script>")).toThrow();
  });

  it("rejects non-string input", () => {
    expect(() => validateIdempotencyKey(123)).toThrow();
  });
});

// ─── Fingerprint ──────────────────────────────────────────────────────────────

describe("computeFingerprint", () => {
  it("produces consistent SHA-256 hex for same input", () => {
    const body = { type: "ORDER_CREATED", channel: "webhook", payload: { id: 1 } };
    expect(computeFingerprint(body)).toBe(computeFingerprint(body));
  });

  it("produces different fingerprints for different payloads", () => {
    const body1 = { type: "ORDER_CREATED", channel: "webhook", payload: { id: 1 } };
    const body2 = { type: "ORDER_CREATED", channel: "webhook", payload: { id: 2 } };
    expect(computeFingerprint(body1)).not.toBe(computeFingerprint(body2));
  });

  it("output is 64-char hex (SHA-256)", () => {
    const fp = computeFingerprint({ type: "X", channel: "webhook", payload: {} });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("treats nested JSON object key order as the same logical request", () => {
    const first = { type: "ORDER_CREATED", channel: "webhook", payload: { a: 1, nested: { x: 2, y: 3 } } };
    const reordered = { type: "ORDER_CREATED", channel: "webhook", payload: { nested: { y: 3, x: 2 }, a: 1 } };
    expect(computeFingerprint(first)).toBe(computeFingerprint(reordered));
  });
});

// ─── claimIdempotencySlot ─────────────────────────────────────────────────────

describe("claimIdempotencySlot — first request", () => {
  it("returns { claimed: true } for a new key", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const result = await claimIdempotencySlot(String(tenantId), "key-1", "fp-abc");
    expect(result.claimed).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record.status).toBe("pending");
  });

  it("creates a DB record with correct fields", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await claimIdempotencySlot(String(tenantId), "key-2", "fp-xyz");
    const rec = await IdempotencyRecord.findOne({ key: "key-2" }).lean();
    expect(rec).not.toBeNull();
    expect(rec.status).toBe("pending");
    expect(rec.fingerprint).toBe("fp-xyz");
    expect(rec.expiresAt).toBeInstanceOf(Date);
  });
});

describe("claimIdempotencySlot — idempotent replay", () => {
  it("returns { claimed: false, replayed: true } for same key + same fingerprint after completion", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { record } = await claimIdempotencySlot(String(tenantId), "key-3", "fp-1");

    // Mark complete
    await markIdempotencyComplete(record._id, new mongoose.Types.ObjectId(), { success: true });

    // Second request — same key, same fingerprint
    const result2 = await claimIdempotencySlot(String(tenantId), "key-3", "fp-1");
    expect(result2.claimed).toBe(false);
    expect(result2.replayed).toBe(true);
    expect(result2.record.responseBody).toEqual({ success: true });
  });

  it("returns 409 for same key + DIFFERENT fingerprint", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { record } = await claimIdempotencySlot(String(tenantId), "key-4", "fp-A");
    await markIdempotencyComplete(record._id, new mongoose.Types.ObjectId(), {});

    await expect(
      claimIdempotencySlot(String(tenantId), "key-4", "fp-B")
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 409 for a pending in-flight key", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    // First request claims slot — remains pending (not yet complete)
    await claimIdempotencySlot(String(tenantId), "key-5", "fp-X");

    // Second concurrent request — slot is pending (in-flight duplicate)
    await expect(
      claimIdempotencySlot(String(tenantId), "key-5", "fp-X")
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("claimIdempotencySlot — tenant isolation", () => {
  it("allows two different tenants to use the same key", async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();

    const r1 = await claimIdempotencySlot(String(tenantA), "shared-key", "fp-1");
    const r2 = await claimIdempotencySlot(String(tenantB), "shared-key", "fp-1");

    expect(r1.claimed).toBe(true);
    expect(r2.claimed).toBe(true);
  });

  it("rejects duplicate key within same tenant", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await claimIdempotencySlot(String(tenantId), "dup-key", "fp-1");

    await expect(
      claimIdempotencySlot(String(tenantId), "dup-key", "fp-1")
    ).rejects.toBeDefined();
  });
});

describe("claimIdempotencySlot — concurrent race condition", () => {
  it("concurrent requests with same key result in exactly one DB record", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const key = "concurrent-key";
    const fp = "same-fingerprint";

    // Fire 10 concurrent requests
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        claimIdempotencySlot(String(tenantId), key, fp)
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const claimed = fulfilled.filter((r) => r.value.claimed === true);

    // Exactly one must have successfully claimed
    expect(claimed.length).toBe(1);

    // Exactly one DB record
    const count = await IdempotencyRecord.countDocuments({ tenantId, key });
    expect(count).toBe(1);
  });
});

describe("deleteIdempotencyRecord", () => {
  it("allows same key to be reused after deletion (simulates TTL expiry)", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const { record } = await claimIdempotencySlot(String(tenantId), "reuse-key", "fp-1");

    await deleteIdempotencyRecord(record._id);

    // Should now be claimable again
    const result = await claimIdempotencySlot(String(tenantId), "reuse-key", "fp-1");
    expect(result.claimed).toBe(true);
  });
});

// ─── Event + Outbox + idempotency transaction boundary ───────────────────────

describe("idempotency transaction recovery", () => {
  const input = { type: "ORDER_CREATED", channel: "webhook", payload: { orderId: "order-1" } };

  const reserve = async (tenantId, key = "event-key", body = input) => {
    const fingerprint = computeFingerprint(body);
    return claimIdempotencySlot(String(tenantId), key, fingerprint);
  };

  const recoverReservation = async (recordId) => {
    await IdempotencyRecord.collection.updateOne(
      { _id: recordId },
      { $set: { pendingExpiresAt: new Date(Date.now() - 1_000) } }
    );
  };

  it("commits exactly one Event, OutboxEvent, and complete record; retry replays its original Event", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const first = await reserve(tenantId);

    const created = await publishEvent(String(tenantId), input, { idempotencyRecordId: first.record._id });
    const replay = await reserve(tenantId);

    expect(await Event.countDocuments({ tenantId })).toBe(1);
    expect(await OutboxEvent.countDocuments({ tenantId })).toBe(1);
    expect(replay).toMatchObject({ claimed: false, replayed: true });
    expect(String(replay.record.eventId)).toBe(String(created.eventId));
    expect(replay.record.responseBody.data.eventId.toString()).toBe(created.eventId.toString());
  });

  it("rejects same key with a different payload before creating a second Event", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const first = await reserve(tenantId, "conflict-key");
    await publishEvent(String(tenantId), input, { idempotencyRecordId: first.record._id });

    await expect(reserve(tenantId, "conflict-key", { ...input, payload: { orderId: "order-2" } }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await Event.countDocuments({ tenantId })).toBe(1);
  });

  it("allows the same key independently for different tenants", async () => {
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const firstA = await reserve(tenantA, "same-key");
    const firstB = await reserve(tenantB, "same-key");

    await Promise.all([
      publishEvent(String(tenantA), input, { idempotencyRecordId: firstA.record._id }),
      publishEvent(String(tenantB), input, { idempotencyRecordId: firstB.record._id }),
    ]);
    expect(await Event.countDocuments({ type: input.type })).toBe(2);
  });

  it("100 concurrent identical reservations create exactly one Event and replay the same result", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const key = "hundred-concurrent";
    const reservations = await Promise.allSettled(
      Array.from({ length: 100 }, () => reserve(tenantId, key))
    );
    const winnerIndex = reservations.findIndex((result) => result.status === "fulfilled" && result.value.claimed);
    const winner = reservations[winnerIndex];
    expect(winner).toBeDefined();
    expect(reservations.filter((result) => result.status === "fulfilled" && result.value.claimed)).toHaveLength(1);

    const created = await publishEvent(String(tenantId), input, { idempotencyRecordId: winner.value.record._id });
    const replay = await reserve(tenantId, key);
    expect(await Event.countDocuments({ tenantId })).toBe(1);
    expect(replay.record.responseBody.data.eventId.toString()).toBe(created.eventId.toString());
  });

  it("100 concurrent different payloads under one key allow one operation and reject all conflicts", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const key = "hundred-conflicts";
    const reservations = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) => reserve(
        tenantId,
        key,
        { ...input, payload: { orderId: `order-${index}` } }
      ))
    );
    const winnerIndex = reservations.findIndex((result) => result.status === "fulfilled" && result.value.claimed);
    const winner = reservations[winnerIndex];
    const rejected = reservations.filter((result) => result.status === "rejected");

    expect(winner).toBeDefined();
    expect(reservations.filter((result) => result.status === "fulfilled" && result.value.claimed)).toHaveLength(1);
    expect(rejected).toHaveLength(99);
    expect(rejected.every((result) => result.reason.statusCode === 409)).toBe(true);

    await publishEvent(String(tenantId), { ...input, payload: { orderId: `order-${winnerIndex}` } }, {
      idempotencyRecordId: winner.value.record._id,
    });
    expect(await Event.countDocuments({ tenantId })).toBe(1);
  });

  it("recovers an expired pending reservation after an interrupted pre-commit request", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const first = await reserve(tenantId, "crash-before-commit");
    await recoverReservation(first.record._id);

    const recovered = await reserve(tenantId, "crash-before-commit");
    expect(recovered).toMatchObject({ claimed: true, recovered: true });

    await publishEvent(String(tenantId), input, { idempotencyRecordId: recovered.record._id });
    expect(await Event.countDocuments({ tenantId })).toBe(1);
  });

  it("does not commit Event or OutboxEvent when idempotency completion cannot be written", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const first = await reserve(tenantId, "completion-failure");
    vi.spyOn(IdempotencyRecord, "updateOne").mockRejectedValue(new Error("Mongo completion write failed"));

    await expect(publishEvent(String(tenantId), input, { idempotencyRecordId: first.record._id }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(await Event.countDocuments({ tenantId })).toBe(0);
    expect(await OutboxEvent.countDocuments({ tenantId })).toBe(0);

    vi.restoreAllMocks();
    await recoverReservation(first.record._id);
    const recovered = await reserve(tenantId, "completion-failure");
    await publishEvent(String(tenantId), input, { idempotencyRecordId: recovered.record._id });
    expect(await Event.countDocuments({ tenantId })).toBe(1);
  });
});
