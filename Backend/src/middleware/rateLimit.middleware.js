// src/middleware/rateLimit.middleware.js
// Production-quality rate limiting for NotifyHub API.
//
// Strategy:
//   authLimiter        — 10 req / 15 min per IP  (login, register — brute-force protection)
//   apiLimiter         — 100 req / min per IP    (general API endpoints)
//   eventPublishLimiter— 60 req / min per API key (event publishing — tenant-aware)
//
// Store: in-memory (express-rate-limit default).
// ⚠️  In-memory store is suitable for single-instance / local development only.
//     For multi-instance production deployments, replace the store with a
//     Redis-backed store (e.g., rate-limit-redis) to share state across instances.
//     See: https://github.com/express-rate-limit/rate-limit-redis

import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ─── Helper: generate 429 response in existing error format ──────────────────
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: "Too many requests — please try again later",
  });
};

// ─── Auth limiter ─────────────────────────────────────────────────────────────
// Applied to: POST /auth/login, POST /auth/register
// 10 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,   // 15 minutes
  max: 10,
  standardHeaders: true,        // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: "Too many authentication attempts — please try again in 15 minutes",
});

// ─── General API limiter ──────────────────────────────────────────────────────
// Applied to: all /api/v1/* routes except event publishing
// 100 requests per minute per IP
export const apiLimiter = rateLimit({
  windowMs: 60 * 1_000,         // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => ipKeyGenerator(req),
  // Skip health endpoints — monitoring must never be blocked
  skip: (req) => req.path === "/health" || req.path.startsWith("/health/"),
});

// ─── Event publish limiter ────────────────────────────────────────────────────
// Applied to: POST /api/v1/events (external API key auth)
// 60 events per minute per API key (tenant-aware because each API key belongs to one tenant)
export const eventPublishLimiter = rateLimit({
  windowMs: 60 * 1_000,         // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  // Key = API key prefix (already on req.apiKey after requireApiKey middleware runs)
  // Falls back to IP if API key not yet resolved
  keyGenerator: (req) => {
    if (req.apiKey?.keyPrefix) {
      return `apikey:${req.apiKey.keyPrefix}`;
    }
    return ipKeyGenerator(req);
  },
});
