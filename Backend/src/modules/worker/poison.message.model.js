// Durable record for Kafka messages that cannot be parsed into a NotifyHub event.
//
// The source topic/partition/offset uniquely identify a Kafka record. Keeping this
// record in Mongo lets the worker acknowledge a poison record only after a durable,
// idempotent failure outcome exists.

import mongoose from "mongoose";

const poisonMessageSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    partition: { type: Number, required: true },
    offset: { type: String, required: true },
    eventId: { type: String, default: null },
    tenantId: { type: String, default: null },
    errorType: { type: String, required: true },
    reason: { type: String, required: true },
    payloadBytes: { type: Number, required: true },
    payloadSha256: { type: String, required: true },
    headerNames: { type: [String], default: [] },
    failedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

poisonMessageSchema.index({ topic: 1, partition: 1, offset: 1 }, { unique: true });

export const PoisonMessage = mongoose.model("PoisonMessage", poisonMessageSchema);
