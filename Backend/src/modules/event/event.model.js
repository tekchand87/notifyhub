import mongoose from "mongoose"
import {EVENT_CHANNELS_VALUES, EVENT_STATUS_VALUES, EVENT_STATUS} from "./event.constants.js"

const eventSchema = new mongoose.Schema({
  tenantId : {
    type : mongoose.Schema.Types.ObjectId,
    ref : "Tenant",
    required : true,
    index : true
  },
  type : {
    type : String,
    required : true,
    trim : true,
    minLength : 2,
    maxLength : 100,
  },
  channel : {
    type : String,
    enum : EVENT_CHANNELS_VALUES,
    required : true
  },
  payload : {
    type : mongoose.Schema.Types.Mixed,
    required : true
  },
  status : {
    type : String,
    enum : EVENT_STATUS_VALUES,
    default : EVENT_STATUS.QUEUED,
    index : true
  },

  // ── Retry tracking fields ──────────────────────────────────────────────────
  // Number of delivery attempts made so far (incremented on each attempt)
  attempts : {
    type : Number,
    default : 0,
    min : 0,
  },
  // Stamped at creation time from retryConfig.maxAttempts so it remains
  // immutable even if the env var changes between creation and processing.
  maxAttempts : {
    type : Number,
    default : null,
  },
  // When the next retry should be processed (null = not scheduled)
  nextRetryAt : {
    type : Date,
    default : null,
    index : true,
  },
  // Last error message from a failed delivery attempt
  lastError : {
    type : String,
    default : null,
  },

  // ── Worker lease fields ────────────────────────────────────────────────────
  // When a worker claims the event (queued/retry_wait → processing), it sets:
  //   processingStartedAt — when the claim was made
  //   leaseExpiresAt      — processingStartedAt + PROCESSING_LEASE_MS
  //   workerId            — unique ID of the worker instance (hostname:pid:hex)
  //
  // The stale-lease recovery poller finds events where:
  //   { status: "processing", leaseExpiresAt: { $lte: now } }
  // and atomically resets them to "queued" for reprocessing.
  processingStartedAt : {
    type : Date,
    default : null,
  },
  leaseExpiresAt : {
    type : Date,
    default : null,
  },
  workerId : {
    type : String,
    default : null,
  },

  // ── Lifecycle timestamps ───────────────────────────────────────────────────
  // Set when the event reaches a terminal or significant state.
  // Used for analytics, SLA monitoring, and debugging.
  deliveredAt : {
    type : Date,
    default : null,
  },
  failedAt : {
    type : Date,
    default : null,
  },
  dlqAt : {
    type : Date,
    default : null,
  },
},{
  timestamps : true,
  versionKey : false
})

// ── Indexes ────────────────────────────────────────────────────────────────────

// Tenant-scoped queries
eventSchema.index({tenantId : 1, createdAt : -1});
eventSchema.index({tenantId : 1, status : 1, createdAt : -1});
eventSchema.index({tenantId : 1, channel : 1, createdAt : -1});

// Retry poller: { status: "retry_wait", nextRetryAt: { $lte: now } }
eventSchema.index({status : 1, nextRetryAt : 1});

// Stale-lease recovery: { status: "processing", leaseExpiresAt: { $lte: now } }
eventSchema.index({status : 1, leaseExpiresAt : 1});

export const Event = mongoose.model("Event",eventSchema);
