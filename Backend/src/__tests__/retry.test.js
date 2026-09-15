// src/__tests__/retry.test.js
// Tests for retry logic: backoff calculation, error classification, state transitions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateBackoffDelay, isRetryable } from "../modules/worker/retry.service.js";
import { WebhookDeliveryError } from "../modules/notifications/webhook.handler.js";

describe("calculateBackoffDelay", () => {
  it("returns a number >= 0", () => {
    for (let i = 1; i <= 10; i++) {
      expect(calculateBackoffDelay(i)).toBeGreaterThanOrEqual(0);
    }
  });

  it("respects maxDelayMs cap", () => {
    const original = process.env.RETRY_MAX_DELAY_MS;
    process.env.RETRY_MAX_DELAY_MS = "1000";
    for (let i = 1; i <= 20; i++) {
      expect(calculateBackoffDelay(i)).toBeLessThanOrEqual(1000);
    }
    process.env.RETRY_MAX_DELAY_MS = original;
  });

  it("is non-deterministic (jitter applied)", () => {
    // With full jitter, two calls should rarely produce the same value
    const results = new Set(Array.from({ length: 20 }, () => calculateBackoffDelay(3)));
    // Expect at least 2 distinct values (probability of all same is negligible)
    expect(results.size).toBeGreaterThan(1);
  });

  it("delay grows with attempt number (statistical)", () => {
    // Average of 100 samples for attempt 1 should be less than for attempt 5
    const avg = (attempt, n = 100) =>
      Array.from({ length: n }, () => calculateBackoffDelay(attempt)).reduce((a, b) => a + b, 0) / n;
    expect(avg(1)).toBeLessThan(avg(5));
  });
});

describe("isRetryable", () => {
  it("returns true for WebhookDeliveryError with retryable=true", () => {
    const err = new WebhookDeliveryError("Server error", { retryable: true });
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for WebhookDeliveryError with retryable=false", () => {
    const err = new WebhookDeliveryError("Bad request", { retryable: false });
    expect(isRetryable(err)).toBe(false);
  });

  it("returns true for AbortError (timeout)", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for ECONNREFUSED", () => {
    const err = new Error("connect ECONNREFUSED");
    err.code = "ECONNREFUSED";
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for ECONNRESET", () => {
    const err = new Error("socket hang up");
    err.code = "ECONNRESET";
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for ETIMEDOUT", () => {
    const err = new Error("connection timed out");
    err.code = "ETIMEDOUT";
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for invalid JSON error", () => {
    const err = new Error("Kafka message contains invalid JSON");
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for no webhookUrl configured", () => {
    const err = new Error("Tenant has no webhookUrl configured");
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for Tenant not found", () => {
    const err = new Error("Tenant not found for webhook delivery");
    expect(isRetryable(err)).toBe(false);
  });

  it("defaults to true for unknown errors", () => {
    const err = new Error("Some unexpected error");
    expect(isRetryable(err)).toBe(true);
  });
});
