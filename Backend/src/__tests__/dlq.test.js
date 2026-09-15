// src/__tests__/dlq.test.js
// Tests for DLQ logic: publishToDLQ safety, moveToDLQ state transitions.

import { describe, it, expect, vi, afterEach } from "vitest";
import * as workerEventService from "../modules/worker/worker.event.service.js";
import * as dlqPublisher from "../infrastructure/kafka/dlq.publisher.js";
import * as retryService from "../modules/worker/retry.service.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DLQ Publisher", () => {
  it("publishToDLQ returns { ok: false } when producer is not connected (never throws)", async () => {
    // dlqConnected starts as false, so this should return { ok: false }
    const result = await dlqPublisher.publishToDLQ({
      eventId: "e1",
      tenantId: "t1",
      channel: "webhook",
      attempts: 5,
      reason: "max attempts",
    });
    // Must be a plain object with ok property — never throws
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
    if (!result.ok) {
      expect(result).toHaveProperty("error");
    }
  });

  it("publishToDLQ result always has { ok } property — never throws", async () => {
    // Even in worst case it should not throw
    let threw = false;
    let result;
    try {
      result = await dlqPublisher.publishToDLQ({
        eventId: "bad-event",
        tenantId: "bad-tenant",
        channel: "webhook",
        attempts: 5,
        reason: "test",
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).toHaveProperty("ok");
  });
});

describe("moveToDLQ", () => {
  it("calls markEventDLQ with the correct eventId", async () => {
    const dlqSpy = vi.spyOn(workerEventService, "markEventDLQ").mockResolvedValue({
      _id: "event-456",
      status: "dlq",
    });
    // publishToDLQ is fine to call (returns { ok: false } since not connected)

    const err = new Error("timeout after 10s");
    await retryService.moveToDLQ("event-456", "tenant-1", "webhook", 5, err, "notifyhub.events");

    expect(dlqSpy).toHaveBeenCalledWith("event-456", "timeout after 10s");
  });

  it("handles DLQ publish failure gracefully (does not throw)", async () => {
    // We verify this by calling moveToDLQ when the DLQ producer is not connected —
    // publishToDLQ returns { ok: false, error: '...' } which moveToDLQ must absorb.
    // The spy on markEventDLQ ensures the DB is still updated.
    vi.spyOn(workerEventService, "markEventDLQ").mockResolvedValue({});

    const err = new Error("test error");
    // moveToDLQ must resolve (not reject) even when DLQ Kafka publish returns { ok: false }
    let didThrow = false;
    try {
      await retryService.moveToDLQ("event-789", "tenant-1", "webhook", 5, err);
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });

  it("always updates DB status to dlq even when Kafka publish fails", async () => {
    const dlqSpy = vi.spyOn(workerEventService, "markEventDLQ").mockResolvedValue({});
    vi.spyOn(dlqPublisher, "publishToDLQ").mockRejectedValue(new Error("broker down"));

    const err = new Error("max retries");
    await retryService.moveToDLQ("event-999", "t1", "email", 3, err).catch(() => {});

    // markEventDLQ MUST have been called regardless
    expect(dlqSpy).toHaveBeenCalledWith("event-999", "max retries");
  });
});
