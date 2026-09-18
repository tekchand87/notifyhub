// src/modules/event/idempotency.model.js
// IdempotencyRecord — tracks client-supplied Idempotency-Key headers to prevent
// duplicate event creation on network retries.
//
// Race safety:
//   The compound unique index { tenantId: 1, key: 1 } is enforced by MongoDB at
//   the storage layer. Two concurrent requests with the same key will result in
//   exactly one successful insert; the other receives a duplicate-key error (E11000).
//   This is handled in idempotency.service.js.
//
// Expiration:
//   Records expire automatically via a MongoDB TTL index on the `expiresAt` field.
//   No application-level cron job is needed. MongoDB's TTL thread runs every 60s.

import mongoose from "mongoose";

const idempotencySchema = new mongoose.Schema(
  {
    // ── Scope ──────────────────────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // Client-supplied idempotency key (from Idempotency-Key header)
    key: {
      type: String,
      required: true,
      maxlength: 255,
    },

    // ── Request fingerprint ────────────────────────────────────────────────────
    // SHA-256 hash of the request body { type, channel, payload }.
    // Used to detect same-key + different-payload conflicts.
    // We store the hash, not the raw payload, to limit memory and avoid logging PII.
    fingerprint: {
      type: String,
      required: true,
    },

    // ── Result ─────────────────────────────────────────────────────────────────
    // Status of this idempotency record.
    //   pending  — reservation held while the creation transaction is in flight
    //   complete — event successfully created; response is cached
    status: {
      type: String,
      enum: ["pending", "complete"],
      default: "pending",
    },

    // The _id of the Event document created for this request.
    // Null until status = complete.
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },

    // The full 202 response body to replay on duplicate requests.
    // Null until status = complete.
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // A pending reservation may be reclaimed only after this lease expires.
    // It prevents a process crash before the transaction from blocking the key
    // until the much longer idempotency retention TTL expires.
    pendingExpiresAt: {
      type: Date,
      default: null,
    },

    // ── TTL ────────────────────────────────────────────────────────────────────
    // MongoDB TTL index on this field automatically removes records after they expire.
    // Default: 24 hours from creation (configurable via IDEMPOTENCY_TTL_HOURS).
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────

// PRIMARY: Enforce uniqueness at the database level (race-safe).
// Two concurrent requests with the same tenantId + key result in exactly one
// successful insert. The second receives MongoDB error code E11000.
idempotencySchema.index({ tenantId: 1, key: 1 }, { unique: true });

// TTL: MongoDB background thread removes expired records automatically.
// No application-level cleanup needed.
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyRecord = mongoose.model(
  "IdempotencyRecord",
  idempotencySchema
);
