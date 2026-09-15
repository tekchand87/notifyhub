// src/middleware/error.middleware.js
// Global error handler for Express.
//
// Logging strategy:
//   - Operational / client errors (4xx): log at WARN level with structured fields,
//     NO stack trace (these are expected, noisy stacks waste disk/ELK budget).
//   - Unexpected server errors (5xx): log at ERROR level WITH stack (diagnostics needed).
//   - AppError.isOperational marks expected client errors.
//
// Response strategy:
//   - 5xx: always return a generic "Internal server error" — never expose internals.
//   - 4xx: return the operational message from AppError.
//   - Never expose: stack traces, Mongo errors, JWT internals, parser internals.

const isProduction = process.env.NODE_ENV === "production";

// ── Structured logger (mirrors worker.logger to avoid a second system) ─────────
const logEntry = (level, statusCode, message, req, extra = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "notifyhub-api",
    statusCode,
    message,
    method: req?.method,
    path: req?.path,
    requestId: req?.headers?.["x-request-id"] ?? undefined,
    ...extra,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.warn(JSON.stringify(entry));
  }
};

export const errorHandler = (error, req, res, next) => {

  // ── MongoDB duplicate-key ────────────────────────────────────────────────────
  if (error.code === 11000) {
    const duplicateFields = Object.keys(error.keyPattern || {}).join(", ");
    logEntry("warn", 409, "Duplicate key error", req, {
      fields: duplicateFields || "unknown",
    });
    return res.status(409).json({
      success: false,
      message: `Duplicate value for: ${duplicateFields || "unique field"}`
    });
  }

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  if (statusCode < 500 && isOperational) {
    // ── 4xx operational errors — WARN, no stack ──────────────────────────────
    logEntry("warn", statusCode, error.message, req);
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // ── 5xx server errors — ERROR, include stack server-side only ───────────────
  const stack = isProduction ? undefined : error.stack;
  logEntry("error", statusCode, error.message ?? "Internal server error", req, {
    ...(stack ? { stack } : {}),
    errorName: error.name,
  });

  return res.status(statusCode).json({
    success: false,
    message: "Internal server error",
  });
};