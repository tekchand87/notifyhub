// src/__tests__/webhook.test.js
// Integration tests for real webhook delivery.
// Uses a local HTTP server to prove actual HTTP POSTs are made.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";

// Set env before importing the module under test
process.env.WEBHOOK_ALLOW_LOCALHOST = "true";
process.env.WEBHOOK_TIMEOUT_MS = "10000";

import { deliverWebhook, signPayload, isRetryableHttpStatus } from "../modules/notifications/webhook.service.js";

// ── Helpers to create single-use test servers ─────────────────────────────────
function createServer(statusCode, delay = 0) {
  return new Promise((resolve) => {
    let lastRequest = null;
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        lastRequest = {
          method: req.method,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        };
        setTimeout(() => {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        }, delay);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, getLastRequest: () => lastRequest });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Webhook Service — HTTP delivery", () => {
  it("performs a real HTTP POST to the webhook URL", async () => {
    const { server, port, getLastRequest } = await createServer(200);
    try {
      const result = await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-1", eventType: "user.created", data: {} },
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      const req = getLastRequest();
      expect(req).not.toBeNull();
      expect(req.method).toBe("POST");
    } finally {
      await closeServer(server);
    }
  });

  it("sends Content-Type: application/json", async () => {
    const { server, port, getLastRequest } = await createServer(200);
    try {
      await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-2" },
      });
      expect(getLastRequest().headers["content-type"]).toBe("application/json");
    } finally {
      await closeServer(server);
    }
  });

  it("sends the correct JSON payload", async () => {
    const { server, port, getLastRequest } = await createServer(200);
    try {
      await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-3", eventType: "order.paid", data: { amount: 99 } },
      });
      const received = JSON.parse(getLastRequest().body);
      expect(received.eventId).toBe("test-3");
      expect(received.eventType).toBe("order.paid");
      expect(received.data.amount).toBe(99);
    } finally {
      await closeServer(server);
    }
  });

  it("includes X-NotifyHub-Signature when secret is provided", async () => {
    const { server, port, getLastRequest } = await createServer(200);
    const secret = "my-test-secret-12345678";
    const payload = { eventId: "test-4" };
    try {
      await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: secret,
        payload,
      });
      const sig = getLastRequest().headers["x-notifyhub-signature"];
      expect(sig).toBeTruthy();
      expect(sig).toBe(signPayload(JSON.stringify(payload), secret));
    } finally {
      await closeServer(server);
    }
  });

  it("does NOT include signature header when no secret", async () => {
    const { server, port, getLastRequest } = await createServer(200);
    try {
      await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-5" },
      });
      expect(getLastRequest().headers["x-notifyhub-signature"]).toBeUndefined();
    } finally {
      await closeServer(server);
    }
  });

  it("classifies HTTP 500 as retryable", async () => {
    const { server, port } = await createServer(500);
    try {
      const result = await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-500" },
      });
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.statusCode).toBe(500);
    } finally {
      await closeServer(server);
    }
  });

  it("classifies HTTP 400 as non-retryable", async () => {
    const { server, port } = await createServer(400);
    try {
      const result = await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-400" },
      });
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.statusCode).toBe(400);
    } finally {
      await closeServer(server);
    }
  });

  it("handles connection refused as retryable", async () => {
    // Port 1 is never open on a regular machine
    const result = await deliverWebhook({
      webhookUrl: "http://127.0.0.1:1/webhook",
      webhookSecret: null,
      payload: { eventId: "test-refused" },
    });
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("handles timeout as retryable", async () => {
    // Server delays by 2 seconds, but we set timeout to 200ms
    const { server, port } = await createServer(200, 2000);
    process.env.WEBHOOK_TIMEOUT_MS = "200";
    try {
      const result = await deliverWebhook({
        webhookUrl: `http://127.0.0.1:${port}/webhook`,
        webhookSecret: null,
        payload: { eventId: "test-timeout" },
      });
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("timed out");
    } finally {
      process.env.WEBHOOK_TIMEOUT_MS = "10000";
      await closeServer(server);
    }
  }, 5000);

  it("rejects private IPs when WEBHOOK_ALLOW_LOCALHOST is false", async () => {
    process.env.WEBHOOK_ALLOW_LOCALHOST = "false";
    try {
      const result = await deliverWebhook({
        webhookUrl: "http://localhost:3000/webhook",
        webhookSecret: null,
        payload: { eventId: "test-ssrf" },
      });
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain("private");
    } finally {
      process.env.WEBHOOK_ALLOW_LOCALHOST = "true";
    }
  });
});

describe("Webhook — isRetryableHttpStatus", () => {
  it("marks 429 as retryable", () => expect(isRetryableHttpStatus(429)).toBe(true));
  it("marks 500 as retryable", () => expect(isRetryableHttpStatus(500)).toBe(true));
  it("marks 503 as retryable", () => expect(isRetryableHttpStatus(503)).toBe(true));
  it("marks 400 as not retryable", () => expect(isRetryableHttpStatus(400)).toBe(false));
  it("marks 401 as not retryable", () => expect(isRetryableHttpStatus(401)).toBe(false));
  it("marks 404 as not retryable", () => expect(isRetryableHttpStatus(404)).toBe(false));
});

describe("Webhook — signPayload", () => {
  it("returns sha256=<hex> format", () => {
    const sig = signPayload('{"test":1}', "secret");
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
  it("returns null when no secret", () => {
    expect(signPayload('{}', null)).toBeNull();
  });
  it("produces consistent signatures for same input", () => {
    const sig1 = signPayload('{"a":1}', "key");
    const sig2 = signPayload('{"a":1}', "key");
    expect(sig1).toBe(sig2);
  });
  it("produces different signatures for different inputs", () => {
    const sig1 = signPayload('{"a":1}', "key");
    const sig2 = signPayload('{"a":2}', "key");
    expect(sig1).not.toBe(sig2);
  });
});
