import express from "express"
import cors from "cors"
import helmet from "helmet"

import authRoutes from "./modules/auth/auth.routes.js"
import tenantRoutes from "./modules/tenant/tenant.routes.js"
import apiRoutes from "./modules/apiKey/apiKey.routes.js"
import eventRoutes from "./modules/event/event.routes.js"

import {notFound} from "./middleware/notFound.middleware.js"
import {errorHandler} from "./middleware/error.middleware.js"
import { apiLimiter } from "./middleware/rateLimit.middleware.js"
import { checkKafkaHealth } from "./infrastructure/kafka/kafka.health.js"

const app = express();

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
const rawOrigins = process.env.CORS_ORIGINS || "http://localhost:5173";
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

// ─── Global API rate limiter (applied before all /api routes) ─────────────────
// Note: health endpoints above are NOT affected by this limiter.
app.use(apiLimiter);

app.use("/api/v1/auth",authRoutes);
app.use("/api/v1/tenant",tenantRoutes);
app.use("/api/v1/api-keys",apiRoutes);
app.use("/api/v1/events",eventRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
