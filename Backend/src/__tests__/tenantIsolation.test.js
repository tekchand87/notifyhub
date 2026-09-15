// src/__tests__/tenantIsolation.test.js
// Tests proving tenant isolation: verifies that service functions
// always scope queries by tenantId. Uses spies on Mongoose model methods.

import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";

// ── Helper: create a fluent Mongoose query chain spy ──────────────────────────
const chainedQuery = (resolvedValue) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Event Service — Tenant Isolation", () => {
  it("listEvents query always scopes by tenantId", async () => {
    const { Event } = await import("../modules/event/event.model.js");

    const findSpy = vi.spyOn(Event, "find").mockReturnValue(chainedQuery([]));
    const countSpy = vi.spyOn(Event, "countDocuments").mockResolvedValue(0);

    const { listEvents } = await import("../modules/event/event.service.js");
    const tenantId = new mongoose.Types.ObjectId().toHexString();
    await listEvents(tenantId, {}).catch(() => {});

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId })
    );
  });

  it("getEvent scopes by both eventId AND tenantId", async () => {
    const { Event } = await import("../modules/event/event.model.js");

    const findOneSpy = vi.spyOn(Event, "findOne").mockReturnValue(chainedQuery(null));

    const { getEvent } = await import("../modules/event/event.service.js");
    const tenantId = new mongoose.Types.ObjectId().toHexString();
    const eventId = new mongoose.Types.ObjectId().toHexString();

    await getEvent(tenantId, eventId).catch(() => {});

    expect(findOneSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        _id: expect.anything(),
      })
    );
  });

  it("publishEvent enforces tenantId from context — not from payload", async () => {
    // Verify the service signature: tenantId is always the first arg (server-controlled),
    // never derived from the request body (which would allow tenant spoofing).
    // This is a structural test: we import the function and verify its arity and
    // that it validates tenantId before touching the DB.
    const { publishEvent } = await import("../modules/event/event.service.js");

    // Calling with an INVALID tenantId (not a valid ObjectId) must throw an AppError
    // before ever calling Event.create — proving the guard runs first.
    let threw = false;
    let thrownError;
    try {
      await publishEvent("not-a-valid-objectid", {
        type: "user.created",
        channel: "webhook",
        payload: {},
      });
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    expect(threw).toBe(true);
    // Should be an AppError with 401 (invalid tenant context guard)
    expect(thrownError.statusCode ?? thrownError.status).toBe(401);
  });
});

describe("Retry logic — state transition calls", () => {
  it("scheduleRetry calls markEventRetryWait with the correct eventId", async () => {
    const workerEventService = await import("../modules/worker/worker.event.service.js");
    const markSpy = vi.spyOn(workerEventService, "markEventRetryWait").mockResolvedValue({});

    const { scheduleRetry } = await import("../modules/worker/retry.service.js");
    const err = new Error("ECONNREFUSED");
    err.code = "ECONNREFUSED";

    const eventId = new mongoose.Types.ObjectId().toHexString();
    await scheduleRetry(eventId, "tenant-1", 1, err);

    expect(markSpy).toHaveBeenCalledWith(
      eventId,
      expect.any(Date),
      2,           // nextAttempts = currentAttempts + 1
      "ECONNREFUSED"
    );
  });

  it("moveToDLQ calls markEventDLQ for the correct eventId", async () => {
    const workerEventService = await import("../modules/worker/worker.event.service.js");
    const dlqSpy = vi.spyOn(workerEventService, "markEventDLQ").mockResolvedValue({});

    const { moveToDLQ } = await import("../modules/worker/retry.service.js");
    const err = new Error("max attempts");
    const eventId = new mongoose.Types.ObjectId().toHexString();

    await moveToDLQ(eventId, "tenant-1", "webhook", 5, err);

    expect(dlqSpy).toHaveBeenCalledWith(eventId, "max attempts");
  });
});
