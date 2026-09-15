// src/__tests__/workerConcurrency.test.js
// Tests for worker lease management and stale-lease recovery.
// Verifies that concurrent workers cannot both process the same event,
// and that crashed-worker events are recovered correctly.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Event } from "../modules/event/event.model.js";
import {
  markEventProcessing,
  markEventDelivered,
  recoverStaleLeasedEvents,
} from "../modules/worker/worker.event.service.js";
import { EVENT_STATUS } from "../modules/event/event.constants.js";

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
  await Event.deleteMany({});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeQueuedEvent = () =>
  Event.create({
    tenantId: new mongoose.Types.ObjectId(),
    type: "TEST_EVENT",
    channel: "webhook",
    payload: { test: true },
    maxAttempts: 5,
    status: EVENT_STATUS.QUEUED,
  });

// ─── Atomic claim: only one worker wins ───────────────────────────────────────

describe("markEventProcessing — concurrent claim safety", () => {
  it("exactly one of N concurrent workers claims a queued event", async () => {
    const event = await makeQueuedEvent();
    const eventId = String(event._id);

    const workers = ["worker-A", "worker-B", "worker-C", "worker-D", "worker-E"];

    // All workers try to claim simultaneously
    const results = await Promise.all(
      workers.map((wid) => markEventProcessing(eventId, wid))
    );

    const successful = results.filter(Boolean);
    expect(successful.length).toBe(1);

    // DB must show exactly one workerId set
    const dbEvent = await Event.findById(eventId).lean();
    expect(dbEvent.status).toBe(EVENT_STATUS.PROCESSING);
    expect(typeof dbEvent.workerId).toBe("string");
    expect(workers).toContain(dbEvent.workerId);
  });

  it("returns null for all workers that fail to claim", async () => {
    const event = await makeQueuedEvent();
    const eventId = String(event._id);

    const results = await Promise.all([
      markEventProcessing(eventId, "w1"),
      markEventProcessing(eventId, "w2"),
      markEventProcessing(eventId, "w3"),
    ]);

    const nullResults = results.filter((r) => r === null);
    expect(nullResults.length).toBe(2); // 2 out of 3 must fail
  });

  it("sets processingStartedAt and leaseExpiresAt atomically", async () => {
    const event = await makeQueuedEvent();
    const before = Date.now();

    const claimed = await markEventProcessing(String(event._id), "test-worker", 300_000);

    const after = Date.now();
    expect(claimed).not.toBeNull();
    expect(claimed.processingStartedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(claimed.processingStartedAt.getTime()).toBeLessThanOrEqual(after);
    expect(claimed.leaseExpiresAt.getTime()).toBeGreaterThan(claimed.processingStartedAt.getTime());
  });

  it("cannot claim an already-processing event (no re-entrancy)", async () => {
    const event = await makeQueuedEvent();
    const eventId = String(event._id);

    // First worker claims
    await markEventProcessing(eventId, "worker-1");

    // Second worker tries to re-claim the already-processing event
    const retry = await markEventProcessing(eventId, "worker-2");
    expect(retry).toBeNull();
  });
});

// ─── Lease field clearance on completion ─────────────────────────────────────

describe("markEventDelivered — clears lease fields", () => {
  it("nulls out workerId and leaseExpiresAt on delivery", async () => {
    const event = await makeQueuedEvent();
    await markEventProcessing(String(event._id), "worker-1");
    await markEventDelivered(String(event._id));

    const final = await Event.findById(event._id).lean();
    expect(final.status).toBe(EVENT_STATUS.DELIVERED);
    expect(final.workerId).toBeNull();
    expect(final.leaseExpiresAt).toBeNull();
    expect(final.deliveredAt).toBeInstanceOf(Date);
  });
});

// ─── Stale-lease recovery ─────────────────────────────────────────────────────

describe("recoverStaleLeasedEvents", () => {
  const makeStuckProcessingEvent = async () => {
    // Create event already stuck in processing with an expired lease
    const tenantId = new mongoose.Types.ObjectId();
    return Event.create({
      tenantId,
      type: "STUCK_EVENT",
      channel: "webhook",
      payload: {},
      maxAttempts: 5,
      status: EVENT_STATUS.PROCESSING,
      processingStartedAt: new Date(Date.now() - 400_000), // 400s ago
      leaseExpiresAt: new Date(Date.now() - 100_000),      // expired 100s ago
      workerId: "crashed-worker",
    });
  };

  it("resets stale processing events back to queued", async () => {
    const staleEvent = await makeStuckProcessingEvent();
    const recovered = await recoverStaleLeasedEvents(10);

    expect(recovered).toBe(1);

    const dbEvent = await Event.findById(staleEvent._id).lean();
    expect(dbEvent.status).toBe(EVENT_STATUS.QUEUED);
    expect(dbEvent.workerId).toBeNull();
    expect(dbEvent.leaseExpiresAt).toBeNull();
    expect(dbEvent.processingStartedAt).toBeNull();
  });

  it("does NOT recover events whose lease has not yet expired", async () => {
    await Event.create({
      tenantId: new mongoose.Types.ObjectId(),
      type: "ACTIVE_EVENT",
      channel: "webhook",
      payload: {},
      maxAttempts: 5,
      status: EVENT_STATUS.PROCESSING,
      processingStartedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 300_000), // expires in 5 minutes
      workerId: "active-worker",
    });

    const recovered = await recoverStaleLeasedEvents(10);
    expect(recovered).toBe(0);
  });

  it("respects the limit parameter — recovers at most N events", async () => {
    // Create 5 stale events
    for (let i = 0; i < 5; i++) {
      await makeStuckProcessingEvent();
    }

    const recovered = await recoverStaleLeasedEvents(3);
    expect(recovered).toBe(3);

    // 2 are still stuck (not yet recovered)
    const stillStuck = await Event.countDocuments({ status: EVENT_STATUS.PROCESSING });
    expect(stillStuck).toBe(2);
  });

  it("makes recovered events claimable again", async () => {
    const staleEvent = await makeStuckProcessingEvent();
    await recoverStaleLeasedEvents(10);

    // Now a worker can claim it again
    const claimed = await markEventProcessing(String(staleEvent._id), "new-worker");
    expect(claimed).not.toBeNull();
    expect(claimed.workerId).toBe("new-worker");
  });
});
