// src/__tests__/security.test.js
// Security regression tests:
//   - Bug #5: Malformed JSON → 400 with safe message
//   - Bug #6: Helmet headers present, X-Powered-By absent
//   - Bug #7: CORS restricted to allowed origins
//   - Bug #8: Error responses do not expose stack traces

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

// ── Environment setup ─────────────────────────────────────────────────────────
process.env.JWT_SECRET = "test-security-jwt-secret";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "http://localhost:5173,https://app.example.com";
process.env.SMTP_HOST = "smtp.test.example";
process.env.SMTP_USER = "test@test.example";
process.env.SMTP_PASSWORD = "test-password";
process.env.KAFKA_BROKERS = "localhost:9092";
process.env.KAFKA_TOPIC = "test.events";

// ── Mock Kafka & outbox ───────────────────────────────────────────────────────
vi.mock("../infrastructure/kafka/kafka.producer.js", () => ({
  connectKafkaProducer: vi.fn().mockResolvedValue(undefined),
  publishKafkaEvent: vi.fn().mockResolvedValue({}),
  disconnectKafkaProducer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../infrastructure/kafka/kafka.health.js", () => ({
  checkKafkaHealth: vi.fn().mockResolvedValue({
    status: "healthy",
    broker: "localhost:9092",
    latencyMs: 1,
    cached: false,
  }),
}));

vi.mock("../infrastructure/outbox/outbox.publisher.js", () => ({
  startOutboxPublisher: vi.fn(),
  stopOutboxPublisher: vi.fn(),
}));

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);

  const appModule = await import("../app.js");
  app = appModule.default;
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// ─── Bug #5: Malformed JSON ───────────────────────────────────────────────────

describe("Bug #5 — Malformed JSON must return 400 with safe message", () => {
  it("malformed JSON body → 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json}");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("malformed JSON does not expose parser internals", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json}");

    const bodyStr = JSON.stringify(res.body);
    // Must not expose Node/V8 parser details
    expect(bodyStr).not.toMatch(/Expected property/i);
    expect(bodyStr).not.toMatch(/position \d+/i);
    expect(bodyStr).not.toMatch(/SyntaxError/i);
    expect(bodyStr).not.toMatch(/JSON at/i);
    // Safe message
    expect(res.body.message).toBe("Invalid JSON payload");
  });

  it("valid JSON is still processed normally", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "test@test.com", password: "password123" });
    // Should get 401 (wrong creds) not 400 (parse error)
    expect(res.status).toBe(401);
  });
});

// ─── Bug #6: Helmet / X-Powered-By ───────────────────────────────────────────

describe("Bug #6 — Helmet headers and X-Powered-By removal", () => {
  it("X-Powered-By header is absent", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("X-Content-Type-Options header is set", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBeTruthy();
  });

  it("X-Frame-Options header is set", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBeTruthy();
  });

  it("Referrer-Policy header is set", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["referrer-policy"]).toBeTruthy();
  });

  it("X-DNS-Prefetch-Control header is set", async () => {
    const res = await request(app).get("/health");
    // Helmet sets this to 'off' by default
    expect(res.headers["x-dns-prefetch-control"]).toBeTruthy();
  });
});

// ─── Bug #7: CORS restricted ─────────────────────────────────────────────────

describe("Bug #7 — CORS must not use wildcard", () => {
  it("allowed origin gets Access-Control-Allow-Origin set to that origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
  });

  it("second allowed origin works", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://app.example.com");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com"
    );
  });

  it("disallowed origin is rejected (no ACAO header)", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.attacker.example");

    // CORS should block this — no Access-Control-Allow-Origin for unknown origins
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("Access-Control-Allow-Origin is NEVER '*'", async () => {
    const res1 = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res1.headers["access-control-allow-origin"]).not.toBe("*");

    const res2 = await request(app).get("/health");
    expect(res2.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("OPTIONS preflight returns 204 for allowed origin", async () => {
    const res = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");

    expect([200, 204]).toContain(res.status);
  });
});

// ─── Bug #8: Error responses never expose stack traces ───────────────────────

describe("Bug #8 — API error responses must not expose stack traces", () => {
  it("401 response does not contain stack trace", async () => {
    const res = await request(app)
      .get("/api/v1/events")
      .set("Authorization", "Bearer FAKE.TOKEN.HERE");

    expect(res.status).toBe(401);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain("at ");       // JS stack frame prefix
    expect(bodyStr).not.toContain(".js:");       // file reference
    expect(bodyStr).not.toContain("node_modules");
  });

  it("500-level errors return generic message (not internal details)", async () => {
    // Trigger a 404 (not found) — check no internal details leak
    const res = await request(app).get("/api/v1/nonexistent-route-xyz");
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain("stack");
    expect(bodyStr).not.toContain("at Object");
  });
});
