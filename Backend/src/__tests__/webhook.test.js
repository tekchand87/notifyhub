// src/__tests__/webhook.test.js
// Integration tests for real webhook delivery.
// Uses a local HTTP server to prove actual HTTP POSTs are made.

import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import dns from "dns";

// Set env before importing the module under test
process.env.WEBHOOK_ALLOW_LOCALHOST = "true";
process.env.WEBHOOK_TIMEOUT_MS = "10000";

import {
  classifyIpAddress,
  deliverWebhook,
  resolveAndValidateWebhookTarget,
  signPayload,
  isRetryableHttpStatus,
} from "../modules/notifications/webhook.service.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowLocalhost = process.env.WEBHOOK_ALLOW_LOCALHOST;
const originalAllowHttp = process.env.WEBHOOK_ALLOW_INSECURE_HTTP;
const originalMaxResponseBytes = process.env.WEBHOOK_MAX_RESPONSE_BYTES;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalAllowLocalhost === undefined) delete process.env.WEBHOOK_ALLOW_LOCALHOST;
  else process.env.WEBHOOK_ALLOW_LOCALHOST = originalAllowLocalhost;
  if (originalAllowHttp === undefined) delete process.env.WEBHOOK_ALLOW_INSECURE_HTTP;
  else process.env.WEBHOOK_ALLOW_INSECURE_HTTP = originalAllowHttp;
  if (originalMaxResponseBytes === undefined) delete process.env.WEBHOOK_MAX_RESPONSE_BYTES;
  else process.env.WEBHOOK_MAX_RESPONSE_BYTES = originalMaxResponseBytes;
});

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

function createLargeResponseServer(size) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("x".repeat(size));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
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

  it("caps a webhook response without buffering the full body", async () => {
    const { server, port } = await createLargeResponseServer(32_000);
    process.env.WEBHOOK_MAX_RESPONSE_BYTES = "128";
    try {
      const result = await deliverWebhook({ webhookUrl: `http://127.0.0.1:${port}/large`, webhookSecret: null, payload: {} });
      expect(result.success).toBe(true);
      expect(result.providerResponse.length).toBe(128);
    } finally {
      await closeServer(server);
    }
  });
});

describe("Webhook SSRF and DNS protection", () => {
  it.each([
    "127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "::", "::1", "fc00::1", "fe80::1", "ff00::1", "::ffff:127.0.0.1",
  ])("classifies %s as non-public", (address) => {
    expect(classifyIpAddress(address)).toMatchObject({ blocked: true });
  });

  it("allows ordinary public IPv4 addresses", () => {
    expect(classifyIpAddress("8.8.8.8")).toMatchObject({ blocked: false, family: 4 });
  });

  it("blocks non-HTTP protocols and URL credentials", async () => {
    for (const webhookUrl of ["file:///etc/passwd", "ftp://example.com/path", "https://user:pass@example.com/path"]) {
      const result = await deliverWebhook({ webhookUrl, webhookSecret: null, payload: {} });
      expect(result).toMatchObject({ success: false, retryable: false });
    }
  });

  it("blocks localhost even when production has an unsafe localhost flag", async () => {
    process.env.NODE_ENV = "production";
    process.env.WEBHOOK_ALLOW_LOCALHOST = "true";
    const result = await deliverWebhook({ webhookUrl: "https://localhost/webhook", webhookSecret: null, payload: {} });
    expect(result).toMatchObject({ success: false, retryable: false });
  });

  it("blocks HTTP in production before any DNS or network use", async () => {
    process.env.NODE_ENV = "production";
    const result = await deliverWebhook({ webhookUrl: "http://8.8.8.8/webhook", webhookSecret: null, payload: {} });
    expect(result).toMatchObject({ success: false, retryable: false });
    expect(result.errorMessage).toContain("HTTPS");
  });

  it("blocks a hostname when one DNS answer is private", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 },
    ]);
    const result = await resolveAndValidateWebhookTarget(new URL("https://mixed.example/webhook"));
    expect(result.error).toContain("non-public");
  });

  it("blocks hostname answers resolving to loopback or metadata ranges", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect((await resolveAndValidateWebhookTarget(new URL("https://loopback.example"))).error).toContain("non-public");
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    expect((await resolveAndValidateWebhookTarget(new URL("https://metadata.example"))).error).toContain("non-public");
  });

  it("treats DNS resolution failure as safe and retryable", async () => {
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    const result = await deliverWebhook({ webhookUrl: "https://missing.example/webhook", webhookSecret: null, payload: {} });
    expect(result).toMatchObject({ success: false, retryable: true });
    expect(result.errorMessage).toContain("DNS resolution failed");
  });

  it("does not follow redirects, including redirects to private addresses", async () => {
    const { server, port } = await new Promise((resolve) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(302, { Location: "http://127.0.0.1:1/private" });
        res.end();
      });
      server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    });
    try {
      const result = await deliverWebhook({ webhookUrl: `http://127.0.0.1:${port}/redirect`, webhookSecret: null, payload: {} });
      expect(result).toMatchObject({ success: false, statusCode: 302, retryable: false });
    } finally {
      await closeServer(server);
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
