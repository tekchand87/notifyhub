// src/__tests__/auth.test.js
// Integration tests for authentication: JWT middleware and login endpoint.
// Uses mongodb-memory-server for a real in-process Mongo instance.
// No external dependencies required.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// ── Environment setup (must run BEFORE any app imports) ───────────────────────
const TEST_JWT_SECRET = "test-jwt-secret-for-auth-tests";
const TEST_KAFKA_BROKERS = "localhost:9092";

process.env.MONGODB_URI = "placeholder"; // replaced below after mongo starts
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_EXPIRES_IN = "1d";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "http://localhost:5173";
process.env.SMTP_HOST = "smtp.test.example";
process.env.SMTP_USER = "test@test.example";
process.env.SMTP_PASSWORD = "test-password";
process.env.KAFKA_BROKERS = TEST_KAFKA_BROKERS;
process.env.KAFKA_TOPIC = "test.events";

// ── Mock Kafka infrastructure so tests don't need a real broker ───────────────
vi.mock("../infrastructure/kafka/kafka.producer.js", () => ({
  connectKafkaProducer: vi.fn().mockResolvedValue(undefined),
  publishKafkaEvent: vi.fn().mockResolvedValue({ partition: 0, offset: "0" }),
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
  // Start in-memory MongoDB replica set (required for transactions)
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;

  // Connect mongoose
  await mongoose.connect(uri);

  // Import app AFTER env is set
  const appModule = await import("../app.js");
  app = appModule.default;
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// ─── Bug #1: Malformed JWT → 401 ─────────────────────────────────────────────

describe("Bug #1 — Malformed JWT must return 401", () => {
  it("missing Authorization header → 401", async () => {
    const res = await request(app).get("/api/v1/events");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("malformed token (gibberish) → 401, not 500", async () => {
    const res = await request(app)
      .get("/api/v1/events")
      .set("Authorization", "Bearer TOTALLY.INVALID.TOKEN");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Must NOT expose JWT internals
    expect(JSON.stringify(res.body)).not.toContain("JsonWebTokenError");
    expect(JSON.stringify(res.body)).not.toContain("SyntaxError");
    expect(JSON.stringify(res.body)).not.toContain("stack");
  });

  it("expired JWT → 401", async () => {
    const expiredToken = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), tenantId: new mongoose.Types.ObjectId().toString(), role: "tenant_admin" },
      TEST_JWT_SECRET,
      { expiresIn: "0s" } // immediately expired
    );
    // Give it a moment to expire
    await new Promise((r) => setTimeout(r, 100));
    const res = await request(app)
      .get("/api/v1/events")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain("TokenExpiredError");
  });

  it("JWT signed with wrong secret → 401", async () => {
    const wrongToken = jwt.sign(
      { userId: "abc", tenantId: "def", role: "member" },
      "completely-wrong-secret"
    );
    const res = await request(app)
      .get("/api/v1/events")
      .set("Authorization", `Bearer ${wrongToken}`);
    expect(res.status).toBe(401);
  });

  it("Bearer prefix missing → 401", async () => {
    const res = await request(app)
      .get("/api/v1/events")
      .set("Authorization", "invalid-format");
    expect(res.status).toBe(401);
  });
});

// ─── Bug #2: Invalid login credentials → 401 ─────────────────────────────────

describe("Bug #2 — Invalid login must return 401 (not 409)", () => {
  const testUser = {
    name: "OrbitStack Admin",
    email: "admin@orbitstack.example",
    password: "SecurePass123!",
    tenantName: "OrbitStack Technologies",
  };

  beforeAll(async () => {
    // Register a test user
    await request(app).post("/api/v1/auth/register").send(testUser);
  });

  it("wrong password → 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: "WrongPassword999!" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid");
    // The message may say "email or password" generically — that's fine.
    // The key constraint is that wrong password and unknown email return IDENTICAL messages.
  });

  it("unknown email → 401 (not 409, not 404)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@nowhere.example", password: "SomePass123!" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Same message as wrong password — no email enumeration
    expect(res.body.message).toContain("Invalid");
  });

  it("wrong password and unknown email return SAME message (no enumeration)", async () => {
    const wrongPwdRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: "BadPass999!" });

    const unknownEmailRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ghost@nowhere.example", password: "BadPass999!" });

    expect(wrongPwdRes.body.message).toBe(unknownEmailRes.body.message);
  });

  it("valid credentials → 200 with token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(typeof res.body.data.accessToken).toBe("string");
  });
});
