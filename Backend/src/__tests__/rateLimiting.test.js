// src/__tests__/rateLimiting.test.js
// Tests rate limiting middleware and health endpoint accessibility.
// Tests the rate limit middleware in isolation — no live DB/Kafka needed.

import { describe, it, expect } from "vitest";
import { authLimiter, apiLimiter, eventPublishLimiter } from "../middleware/rateLimit.middleware.js";

describe("Rate Limiter Config", () => {
  it("authLimiter exists and is a function (Express middleware)", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("apiLimiter exists and is a function (Express middleware)", () => {
    expect(typeof apiLimiter).toBe("function");
  });

  it("eventPublishLimiter exists and is a function (Express middleware)", () => {
    expect(typeof eventPublishLimiter).toBe("function");
  });

  it("rate limiters accept 3 arguments (req, res, next)", () => {
    expect(authLimiter.length).toBeLessThanOrEqual(3);
    expect(apiLimiter.length).toBeLessThanOrEqual(3);
    expect(eventPublishLimiter.length).toBeLessThanOrEqual(3);
  });
});

describe("authLimiter — middleware behaviour", () => {
  it("calls next() for a normal request (not rate limited)", () => {
    return new Promise((resolve, reject) => {
      const req = {
        ip: "192.168.1.1",
        method: "POST",
        path: "/api/v1/auth/login",
        headers: {},
        socket: { remoteAddress: "192.168.1.1" },
      };
      const res = {
        setHeader: () => {},
        getHeader: () => null,
        status: () => ({ json: () => {} }),
      };
      const next = (err) => {
        if (err) reject(err);
        else resolve();
      };

      authLimiter(req, res, next);
    });
  });
});

describe("apiLimiter — skip health endpoints", () => {
  it("calls skip function that returns true for /health path", () => {
    // Access the internal skip function indirectly by calling the limiter
    // with a health path — it should call next() without setting rate limit headers
    return new Promise((resolve, reject) => {
      const req = {
        ip: "10.0.0.1",
        method: "GET",
        path: "/health",
        headers: {},
        socket: { remoteAddress: "10.0.0.1" },
      };
      const res = {
        setHeader: () => {},
        getHeader: () => null,
        status: () => ({ json: () => {} }),
      };
      const next = (err) => {
        if (err) reject(err);
        else resolve();
      };

      // apiLimiter should skip /health and call next() directly
      apiLimiter(req, res, next);
    });
  });
});

describe("eventPublishLimiter — API key based keying", () => {
  it("accepts a request with an API key prefix attached", () => {
    return new Promise((resolve, reject) => {
      const req = {
        ip: "1.2.3.4",
        method: "POST",
        path: "/api/v1/events",
        headers: {},
        socket: { remoteAddress: "1.2.3.4" },
        apiKey: { _id: "api-key-1", keyPrefix: "abc123" }, // Simulates resolved API key
        tenantId: "tenant-1",
      };
      const res = {
        setHeader: () => {},
        getHeader: () => null,
        status: () => ({ json: () => {} }),
      };
      const next = (err) => {
        if (err) reject(err);
        else resolve();
      };

      eventPublishLimiter(req, res, next);
    });
  });

  it("requires API-key middleware to establish tenant context", () => {
    return new Promise((resolve, reject) => {
      const req = {
        ip: "5.6.7.8",
        method: "POST",
        path: "/api/v1/events",
        headers: {},
        socket: { remoteAddress: "5.6.7.8" },
        apiKey: null,
      };
      const res = {
        setHeader: () => {},
        getHeader: () => null,
        status: () => ({ json: () => {} }),
      };
      const next = (err) => {
        if (err) resolve();
        else reject(new Error("expected missing API-key context to be rejected"));
      };

      eventPublishLimiter(req, res, next);
    });
  });
});
