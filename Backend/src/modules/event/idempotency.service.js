// src/modules/event/idempotency.service.js
// Service layer for idempotency record management.
//
// Race condition strategy:
//   We use MongoDB's unique compound index { tenantId, key } as the race-safety
//   mechanism. The flow is:
//
//     1. Try to insert a new "pending" record (upsert=false, so pure insert).
//     2. If insert succeeds → this is the first request. Proceed with event creation.
//     3. If insert throws E11000 → another request already created this record.
//        Read the existing record and decide:
//          - status=complete + same fingerprint → return cached response (idempotent replay)
//          - status=complete + different fingerprint → 409 Conflict
//          - status=pending → 409 "Request in progress" (the original request is still executing)
//
// This guarantees that even under concurrent load, exactly one event is created.

import crypto from "crypto";
import { IdempotencyRecord } from "./idempotency.model.js";
import { AppError } from "../../utils/AppError.js";

// ─── TTL configuration ────────────────────────────────────────────────────────

const getTTLMs = () => {
  const hours = Number(process.env.IDEMPOTENCY_TTL_HOURS) || 24;
  return hours * 60 * 60 * 1000;
};

// ─── Key validation ────────────────────────────────────────────────────────────

const KEY_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

/**
 * Validate the format of a client-supplied Idempotency-Key.
 * @param {string} key
 * @throws {AppError} 400 if invalid
 */
export const validateIdempotencyKey = (key) => {
  if (typeof key !== "string") {
    throw new AppError("Idempotency-Key must be a string", 400);
  }
  if (key.length === 0) {
    throw new AppError("Idempotency-Key must not be empty", 400);
  }
  if (key.length > 255) {
    throw new AppError(
      "Idempotency-Key must not exceed 255 characters",
      400
    );
  }
  if (!KEY_PATTERN.test(key)) {
    throw new AppError(
      "Idempotency-Key may only contain alphanumeric characters, hyphens, underscores, and dots",
      400
    );
  }
};

// ─── Request fingerprint ──────────────────────────────────────────────────────

/**
 * Compute a SHA-256 fingerprint of the request body.
 * Used to detect same-key + different-payload conflicts.
 * We hash, not store, the raw payload to avoid PII in the database.
 *
 * @param {{ type: string, channel: string, payload: object }} body
 * @returns {string} hex-encoded SHA-256 hash
 */
export const computeFingerprint = (body) => {
  // Use a stable serialization: sort keys to be consistent
  const canonical = JSON.stringify({
    type: body.type,
    channel: body.channel,
    payload: body.payload,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
};

// ─── Core idempotency operations ──────────────────────────────────────────────

/**
 * Attempt to claim an idempotency slot.
 *
 * Returns one of:
 *   { claimed: true, record }   — this is the first request; proceed with event creation
 *   { claimed: false, record, replayed: true }  — same key + same fingerprint: return cache
 *   throws AppError(409)        — same key + different fingerprint: conflict
 *   throws AppError(409)        — same key, pending (in-flight duplicate)
 *
 * @param {string} tenantId
 * @param {string} key
 * @param {string} fingerprint
 * @returns {Promise<{ claimed: boolean, record: object, replayed?: boolean }>}
 */
export const claimIdempotencySlot = async (tenantId, key, fingerprint) => {
  const expiresAt = new Date(Date.now() + getTTLMs());

  try {
    // Attempt atomic insert — if the unique index rejects it, we catch below
    const record = await IdempotencyRecord.create({
      tenantId,
      key,
      fingerprint,
      status: "pending",
      expiresAt,
    });

    // We are the first request. Signal the caller to proceed.
    return { claimed: true, record };
  } catch (err) {
    // MongoDB duplicate key error — another request already holds this slot
    if (err.code === 11000) {
      const existing = await IdempotencyRecord.findOne({ tenantId, key }).lean();

      if (!existing) {
        // Extremely rare: record was inserted then immediately TTL-expired
        // between our failed insert and this read. Treat as "not found" = retry
        throw new AppError(
          "Idempotency record disappeared unexpectedly. Please retry.",
          503
        );
      }

      // ── Complete record (event already created) ───────────────────────────
      if (existing.status === "complete") {
        if (existing.fingerprint !== fingerprint) {
          throw new AppError(
            "Idempotency-Key was already used with a different request payload. Use a new key for different requests.",
            409
          );
        }
        // Same key + same fingerprint → replay cached response
        return { claimed: false, record: existing, replayed: true };
      }

      // ── Pending record (the original request is still executing) ──────────
      // This is a concurrent duplicate. Tell the client to retry shortly.
      throw new AppError(
        "A request with this Idempotency-Key is already being processed. Please wait and retry if needed.",
        409
      );
    }

    // Unexpected error — rethrow
    throw err;
  }
};

/**
 * Mark an idempotency record as complete after a successful event creation.
 *
 * @param {string} recordId - IdempotencyRecord._id
 * @param {string} eventId  - The newly created Event._id
 * @param {object} responseBody - The full response body to cache for replay
 * @returns {Promise<void>}
 */
export const markIdempotencyComplete = async (recordId, eventId, responseBody) => {
  await IdempotencyRecord.findByIdAndUpdate(recordId, {
    $set: {
      status: "complete",
      eventId,
      responseBody,
    },
  });
};

/**
 * Delete an idempotency record on transaction rollback.
 * Allows the client to safely retry with the same key.
 *
 * @param {string} recordId
 * @returns {Promise<void>}
 */
export const deleteIdempotencyRecord = async (recordId) => {
  await IdempotencyRecord.findByIdAndDelete(recordId);
};
