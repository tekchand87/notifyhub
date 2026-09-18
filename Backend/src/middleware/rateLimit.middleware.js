import crypto from "crypto";

import { isRedisRateLimitingEnabled } from "../infrastructure/redis/redis.client.js";
import { consumeRateLimitBuckets } from "../infrastructure/redis/rateLimit.store.js";
import { getTenantEventQuota } from "../modules/tenant/tenantQuota.service.js";
import { incrementMetric } from "../infrastructure/observability/metrics.js";

const numberSetting = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const failureMode = () => process.env.RATE_LIMIT_FAILURE_MODE === "fail-closed" ? "fail-closed" : "fail-open";
const safeKeyPart = (value) => crypto.createHash("sha256").update(String(value)).digest("base64url").slice(0, 32);
const key = (type, value) => `notifyhub:rate-limit:${type}:${safeKeyPart(value)}`;
const seconds = (milliseconds) => Math.max(1, Math.ceil(milliseconds / 1_000));

// Express's req.ip is only based on X-Forwarded-For when app.set('trust proxy',
// ...) has explicitly configured a known reverse proxy. Otherwise it is the peer
// socket address, so client-controlled forwarding headers cannot change this key.
const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

const logFailure = (req, error) => {
  console.warn(JSON.stringify({
    ts: new Date().toISOString(), level: "warn", service: "notifyhub-api",
    message: "Rate-limit backend unavailable", path: req.path,
    requestId: req.headers?.["x-request-id"], failureMode: failureMode(),
  }));
};

const sendLimited = (req, res, result) => {
  incrementMetric("rate_limit_rejections_total", { type: result.rejectedBucket || "unknown" });
  const retryAfter = seconds(result.retryAfterMs);
  res.setHeader("Retry-After", String(retryAfter));
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil((Date.now() + result.retryAfterMs) / 1_000)));
  console.warn(JSON.stringify({
    ts: new Date().toISOString(), level: "warn", service: "notifyhub-api", message: "Rate limited",
    rateLimitType: result.rejectedBucket, remaining: result.remaining, retryAfter,
    path: req.path, requestId: req.headers?.["x-request-id"],
  }));
  return res.status(429).json({ success: false, message: "Too many requests — please try again later" });
};

const run = async (req, res, next, buckets) => {
  if (!isRedisRateLimitingEnabled()) return next();
  try {
    const result = await consumeRateLimitBuckets(buckets);
    if (!result.allowed) return sendLimited(req, res, result);
    return next();
  } catch (error) {
    logFailure(req, error);
    if (failureMode() === "fail-open") return next();
    return res.status(503).json({ success: false, message: "Rate limiting is temporarily unavailable" });
  }
};

const ipBucket = (req, type, rateSetting, burstSetting, defaultRate, defaultBurst) => ({
  type,
  key: key(type, clientIp(req)),
  ratePerSecond: numberSetting(rateSetting, defaultRate),
  burst: numberSetting(burstSetting, defaultBurst),
});

// Placed before auth/database work to reject abusive source IPs cheaply.
export const authLimiter = (req, res, next) => run(req, res, next, [
  ipBucket(req, "auth-ip", "AUTH_RATE_LIMIT_PER_SECOND", "AUTH_RATE_LIMIT_BURST", 10 / (15 * 60), 10),
]);

// Public API source-IP protection. Event routes receive this before API-key lookup.
export const apiLimiter = (req, res, next) => run(req, res, next, [
  ipBucket(req, "ip", "IP_RATE_LIMIT_PER_SECOND", "IP_RATE_LIMIT_BURST", 1_000, 2_000),
]);

// Runs after requireApiKey. All tenant/key/global buckets are decremented only if
// every bucket has capacity, so two keys cannot evade their shared tenant quota.
export const eventPublishLimiter = async (req, res, next) => {
  if (!req.apiKey?._id || !req.tenantId) {
    return next(new Error("Event rate limiter requires authenticated API-key context"));
  }
  try {
    const tenantQuota = await getTenantEventQuota(req.tenantId);
    return run(req, res, next, [
      {
        type: "global-events", key: "notifyhub:rate-limit:global:events",
        ratePerSecond: numberSetting("GLOBAL_EVENT_RATE_LIMIT_PER_SECOND", 1_000),
        burst: numberSetting("GLOBAL_EVENT_RATE_LIMIT_BURST", 2_000),
      },
      { type: "tenant", key: key("tenant", req.tenantId), ...tenantQuota },
      {
        type: "api-key", key: key("api-key", req.apiKey._id),
        ratePerSecond: numberSetting("API_KEY_RATE_LIMIT_PER_SECOND", 1_000),
        burst: numberSetting("API_KEY_RATE_LIMIT_BURST", 2_000),
      },
    ]);
  } catch (error) {
    logFailure(req, error);
    if (failureMode() === "fail-open") return next();
    return res.status(503).json({ success: false, message: "Rate limiting is temporarily unavailable" });
  }
};

export const rateLimitKeyFor = key;
export const clientIpForRateLimit = clientIp;
