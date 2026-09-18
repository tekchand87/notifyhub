import express from "express"
import cors from "cors"
import helmet from "helmet"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import authRoutes from "./modules/auth/auth.routes.js"
import tenantRoutes from "./modules/tenant/tenant.routes.js"
import apiRoutes from "./modules/apiKey/apiKey.routes.js"
import eventRoutes from "./modules/event/event.routes.js"
import outboxRoutes from "./modules/event/outbox.routes.js"

import {notFound} from "./middleware/notFound.middleware.js"
import {errorHandler} from "./middleware/error.middleware.js"
import { apiLimiter } from "./middleware/rateLimit.middleware.js"
import { checkKafkaHealth } from "./infrastructure/kafka/kafka.health.js"
import { checkRedisHealth } from "./infrastructure/redis/redis.client.js"
import mongoose from "mongoose"
import { requestContext } from "./middleware/requestContext.middleware.js"
import { metricsSnapshot } from "./infrastructure/observability/metrics.js"

const app = express();

// Leave this false unless the deployment supplies the exact trusted reverse
// proxy/CIDR list. With false, Express ignores client-supplied X-Forwarded-For.
app.set("trust proxy", process.env.TRUST_PROXY || false);
app.use(requestContext);

// ─── Security headers (Bug #6) ────────────────────────────────────────────────
// Helmet removes X-Powered-By and adds a suite of safe HTTP security headers.
// CSP is intentionally disabled here because this is an API server, not a
// browser document origin — clients are not browsers rendering HTML from this server.
app.use(
  helmet({
    contentSecurityPolicy: false, // API-only server — no HTML served
  })
);

// ─── CORS (Bug #7) ───────────────────────────────────────────────────────────
// Restrict to explicitly configured origins.
// Default (development): http://localhost:5173
// Production: set CORS_ORIGINS=https://app.example.com (comma-separated)
// Accept both standard loopback hostnames in local development. Production must
// still provide explicit origins through CORS_ORIGINS.
const rawOrigins = process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173";
const allowedOrigins = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Idempotency-Key",
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Malformed JSON handler (Bug #5) ─────────────────────────────────────────
// Express body-parser signals JSON parse failures by setting a SyntaxError
// with err.type === "entity.parse.failed". We intercept it here and return a
// safe, generic message without exposing internal parser details.
// This middleware must come IMMEDIATELY after express.json().
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
    });
  }
  return next(err);
});

// ─── Health endpoints (excluded from rate limiting) ───────────────────────────

app.get("/health",(req,res)=>{
  res.status(200).json({
    success : true,
    message :"NotifyHub API is running",
    timestamp: new Date().toISOString(),
  });
});

// Real Kafka health check — performs a live broker probe (cached 5s)
app.get("/health/kafka", async (req, res) => {
  try {
    const result = await checkKafkaHealth();
    const httpStatus = result.status === "healthy" ? 200 : 503;
    res.status(httpStatus).json({
      success: result.status === "healthy",
      kafka: {
        status: result.status,
        broker: result.broker,
        latencyMs: result.latencyMs,
        cached: result.cached,
        // Only include error message when unhealthy
        ...(result.status === "unhealthy" ? { error: result.error } : {}),
      },
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      kafka: {
        status: "unhealthy",
        error: "Health check failed",
      },
    });
  }
});

// Dependency readiness is separate from liveness: Redis may be optional when
// rate limiting is disabled or explicitly configured to fail open.
app.get("/health/redis", async (_req, res) => {
  const result = await checkRedisHealth();
  const httpStatus = result.status === "unhealthy" ? 503 : 200;
  res.status(httpStatus).json({
    success: result.status !== "unhealthy",
    redis: result,
  });
});

// Liveness means only that this process can answer HTTP requests.
app.get("/live", (_req, res) => res.status(200).json({ success: true, status: "alive" }));
// Readiness checks dependencies required to accept/commit event ingestion.
app.get("/ready", async (_req, res) => {
  const redis = await checkRedisHealth();
  const mongoReady = mongoose.connection.readyState === 1;
  const redisRequired = process.env.RATE_LIMIT_ENABLED !== "false" && process.env.RATE_LIMIT_FAILURE_MODE === "fail-closed";
  const ready = mongoReady && (!redisRequired || redis.status === "healthy");
  res.status(ready ? 200 : 503).json({ success: ready, dependencies: { mongo: mongoReady ? "healthy" : "unhealthy", redis: redis.status } });
});
// This is intentionally unauthenticated only for local/internal scraping. Put it
// behind network policy in production; it exposes aggregate counts, not secrets.
app.get("/metrics", (_req, res) => res.status(200).json(metricsSnapshot()));

// ─── Global API rate limiter (applied before all /api routes) ─────────────────
// Note: health endpoints above are NOT affected by this limiter.
app.use(apiLimiter);

app.use("/api/v1/auth",authRoutes);
app.use("/api/v1/tenant",tenantRoutes);
app.use("/api/v1/api-keys",apiRoutes);
app.use("/api/v1/events",eventRoutes);
app.use("/api/v1/outbox",outboxRoutes);

// ─── Serve built frontend (production / when dist exists) ─────────────────────
// In development, the Vite dev server (port 5173) serves the frontend and
// proxies /api and /health to Express. On a hard refresh at e.g. /api-keys,
// Vite returns index.html and React Router handles the route — no 404.
//
// In production (or if someone hits :3000 directly during development):
// Express serves the built React app from Frontend/dist and falls back to
// index.html for all non-API routes so React Router still handles navigation.
const distPath = path.resolve(
  __dirname,
  "..",   // src/  → Backend/
  "..",   // Backend/ → project root
  "Frontend",
  "dist"
);

app.use(express.static(distPath));

// API 404 — only for unknown /api/* routes, not for SPA routes
app.use("/api", notFound);

// SPA catch-all — return index.html for every other route so that
// /api-keys, /dashboard, /events/123 etc. work on hard refresh.
// Uses app.use() (not app.get("*")) for Express 5 / path-to-regexp compatibility.
app.use((_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.use(errorHandler);

export default app;
