// src/modules/event/outbox.model.js
// OutboxEvent — implements the Outbox Pattern for reliable Event → Kafka publishing.
//
// Problem solved:
//   Without this, the API writes to MongoDB then makes a separate Kafka call.
//   If Kafka is down when the event is created, the event is permanently stuck
//   in "queued" with no recovery path.
//
// Solution:
//   Instead of calling Kafka directly from the API:
//   1. The API writes Event + OutboxEvent in the same MongoDB transaction.
//   2. A separate Outbox Publisher service polls for pending OutboxEvents and
//      publishes them to Kafka.
//   3. On success, the OutboxEvent is marked "published".
//   4. On failure, the OutboxEvent is retried with exponential backoff.
//
// Delivery semantics:
//   This provides AT-LEAST-ONCE Kafka publishing.
//   If the publisher crashes after Kafka.send() succeeds but before the
//   MongoDB "published" update commits, the OutboxEvent will be published again.
//   Downstream processing must be idempotent (use eventId as the stable identity).
//
// Concurrency:
//   Multiple publisher instances claim records atomically via findOneAndUpdate
//   (pending → publishing). Only the winner publishes.

import mongoose from "mongoose";

const outboxEventSchema = new mongoose.Schema(
  {
    // ── Tenant scoping ──────────────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    // Reference to the Event document created in the same transaction
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    // ── Kafka routing ───────────────────────────────────────────────────────────
    topic: {
      type: String,
      required: true,
    },

    // Kafka message key (tenantId string — preserves per-tenant ordering)
    key: {
      type: String,
      required: true,
    },

    // Full Kafka message payload — serialized at write time to avoid dependency
    // on the live Event document during publishing
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // ── Status ──────────────────────────────────────────────────────────────────
    // pending    → ready to be published
    // publishing → atomically claimed by a publisher; in-flight
    // published  → successfully published to Kafka (terminal)
    // failed     → exceeded maxAttempts; will not be retried (terminal)
    status: {
      type: String,
      enum: ["pending", "publishing", "published", "failed"],
      default: "pending",
    },

    // ── Retry tracking ──────────────────────────────────────────────────────────
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 5,
    },

    lastError: {
      type: String,
      default: null,
    },

    // When the record becomes eligible for next publish attempt.
    // null = immediately eligible (initial state).
    nextAttemptAt: {
      type: Date,
      default: null,
    },

    // ── Lifecycle timestamps ────────────────────────────────────────────────────
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────

// PRIMARY: Poller query — efficiently find pending records due for publishing.
// Covers: { status: "pending", nextAttemptAt: { $lte: now } }
outboxEventSchema.index({ status: 1, nextAttemptAt: 1 });

// UNIQUE on eventId: one OutboxEvent per Event, prevents accidental duplicates.
outboxEventSchema.index({ eventId: 1 }, { unique: true });

// Tenant-scoped lookups (admin queries, diagnostics)
outboxEventSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const OutboxEvent = mongoose.model("OutboxEvent", outboxEventSchema);
