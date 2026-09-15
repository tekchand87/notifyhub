// src/middleware/idempotency.middleware.js
// Express middleware that enforces idempotency for event publishing.
//
// Behaviour:
//   1. If no Idempotency-Key header → skip (backward-compatible; no protection)
//   2. Validate key format
//   3. Compute request fingerprint
//   4. Attempt to claim the idempotency slot (race-safe via MongoDB unique index)
//   5a. If slot claimed (first request) → attach record to req, call next()
//   5b. If replayed (same key + same fingerprint) → return cached 202 immediately
//   5c. If conflict (same key + different fingerprint) → return 409
//   5d. If in-flight duplicate → return 409
//
// The controller is responsible for calling markIdempotencyComplete() after
// a successful event creation. On failure, deleteIdempotencyRecord() is called
// to allow the client to safely retry with the same key.

import {
  validateIdempotencyKey,
  computeFingerprint,
  claimIdempotencySlot,
} from "../modules/event/idempotency.service.js";
import { AppError } from "../utils/AppError.js";

export const idempotencyMiddleware = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"];

    // ── Optional: skip if no key provided ─────────────────────────────────────
    if (!idempotencyKey) {
      req.idempotencyKey = null;
      req.idempotencyRecord = null;
      return next();
    }

    // ── Validate key format ────────────────────────────────────────────────────
    validateIdempotencyKey(idempotencyKey);

    // ── Compute request fingerprint ────────────────────────────────────────────
    const fingerprint = computeFingerprint(req.body);

    // ── Attempt to claim the idempotency slot ──────────────────────────────────
    // tenantId is set by requireApiKey middleware (runs before this)
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new AppError("Tenant context missing from request", 500);
    }

    const result = await claimIdempotencySlot(tenantId, idempotencyKey, fingerprint);

    if (result.replayed) {
      // ── Idempotent replay: return cached response ──────────────────────────
      // Set header to signal this is a replayed response, not a new creation.
      // Clients can use this to distinguish between "created" and "already exists".
      return res
        .status(202)
        .set("X-Idempotency-Replayed", "true")
        .json(result.record.responseBody);
    }

    // ── First request: proceed to controller ──────────────────────────────────
    req.idempotencyKey = idempotencyKey;
    req.idempotencyRecord = result.record;

    next();
  } catch (err) {
    next(err);
  }
};
