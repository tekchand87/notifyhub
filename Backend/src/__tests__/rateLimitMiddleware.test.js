import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeRateLimitBuckets = vi.fn();
const getTenantEventQuota = vi.fn();

vi.mock("../infrastructure/redis/redis.client.js", () => ({ isRedisRateLimitingEnabled: () => true }));
vi.mock("../infrastructure/redis/rateLimit.store.js", () => ({ consumeRateLimitBuckets }));
vi.mock("../modules/tenant/tenantQuota.service.js", () => ({ getTenantEventQuota }));

const { apiLimiter, eventPublishLimiter, rateLimitKeyFor, clientIpForRateLimit } = await import("../middleware/rateLimit.middleware.js");

const request = (overrides = {}) => ({
  ip: "203.0.113.9", path: "/api/v1/events", headers: {}, socket: { remoteAddress: "198.51.100.2" },
  apiKey: { _id: "key-1" }, tenantId: "tenant-1", ...overrides,
});
const response = () => {
  const result = { headers: {}, statusCode: null, body: null };
  result.setHeader = (name, value) => { result.headers[name] = value; };
  result.status = (code) => { result.statusCode = code; return { json: (body) => { result.body = body; } }; };
  return result;
};
const invoke = (middleware, req = request()) => new Promise((resolve, reject) => {
  const res = response();
  middleware(req, res, (error) => error ? reject(error) : resolve({ next: true, res }));
  setTimeout(() => resolve({ next: false, res }), 20);
});

describe("distributed rate-limit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitBuckets.mockResolvedValue({ allowed: true, remaining: 7 });
    getTenantEventQuota.mockResolvedValue({ ratePerSecond: 50, burst: 100 });
    process.env.RATE_LIMIT_FAILURE_MODE = "fail-open";
  });
  afterEach(() => { vi.restoreAllMocks(); delete process.env.RATE_LIMIT_FAILURE_MODE; });

  it("uses Express's resolved client IP, not a raw forwarding header", () => {
    expect(clientIpForRateLimit(request({ headers: { "x-forwarded-for": "1.2.3.4" } }))).toBe("203.0.113.9");
  });

  it("hashes identities before using them in Redis keys", () => {
    const redisKey = rateLimitKeyFor("api-key", "nh_live_secret_value");
    expect(redisKey).toMatch(/^notifyhub:rate-limit:api-key:/);
    expect(redisKey).not.toContain("nh_live_secret_value");
  });

  it("returns a consistent 429 with Retry-After when a bucket is empty", async () => {
    consumeRateLimitBuckets.mockResolvedValue({ allowed: false, rejectedBucket: "tenant", retryAfterMs: 1500, limit: 100, remaining: 0 });
    const { next, res } = await invoke(apiLimiter);
    expect(next).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("2");
    expect(res.headers["RateLimit-Limit"]).toBe("100");
    expect(res.body).toMatchObject({ success: false });
  });

  it("checks global, tenant, and API-key quotas in one atomic call", async () => {
    await invoke(eventPublishLimiter);
    expect(consumeRateLimitBuckets).toHaveBeenCalledOnce();
    const buckets = consumeRateLimitBuckets.mock.calls[0][0];
    expect(buckets.map((item) => item.type)).toEqual(["global-events", "tenant", "api-key"]);
  });

  it("fails open or closed according to the configured Redis outage policy", async () => {
    consumeRateLimitBuckets.mockRejectedValue(new Error("Redis timeout"));
    expect((await invoke(apiLimiter)).next).toBe(true);
    process.env.RATE_LIMIT_FAILURE_MODE = "fail-closed";
    const closed = await invoke(apiLimiter);
    expect(closed.res.statusCode).toBe(503);
  });
});
