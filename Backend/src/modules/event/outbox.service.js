import mongoose from "mongoose";
import { OutboxEvent } from "./outbox.model.js";
import { AppError } from "../../utils/AppError.js";

const toOperatorRecord = (record) => ({
  id: record._id,
  eventId: record.eventId,
  topic: record.topic,
  status: record.status,
  attempts: record.attempts,
  lastFailureAttempts: record.lastFailureAttempts,
  maxAttempts: record.maxAttempts,
  lastError: record.lastError,
  nextAttemptAt: record.nextAttemptAt,
  publishedAt: record.publishedAt,
  lastAttemptAt: record.lastAttemptAt,
  failedAt: record.failedAt,
  replayCount: record.replayCount,
  replayedAt: record.replayedAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const listOutboxForTenant = async (tenantId, { status, limit = 50 } = {}) => {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const filter = { tenantId };
  if (status) filter.status = status;

  const [records, statusCounts] = await Promise.all([
    OutboxEvent.find(filter)
      .select("eventId topic status attempts lastFailureAttempts maxAttempts lastError nextAttemptAt publishedAt lastAttemptAt failedAt replayCount replayedAt createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(normalizedLimit)
      .lean(),
    OutboxEvent.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const counts = { pending: 0, publishing: 0, published: 0, failed: 0 };
  for (const entry of statusCounts) counts[entry._id] = entry.count;

  return { counts, records: records.map(toOperatorRecord) };
};

/**
 * Requeue only a failed record owned by the authenticated tenant. The status
 * predicate makes competing replay requests safe: exactly one changes failed
 * to pending. The publisher, not this HTTP request, performs Kafka I/O.
 */
export const replayFailedOutboxEvent = async (tenantId, outboxId, operatorId) => {
  if (!mongoose.isValidObjectId(outboxId)) {
    throw new AppError("Invalid outbox event id", 400);
  }

  const existing = await OutboxEvent.findOne({ _id: outboxId, tenantId })
    .select("status attempts")
    .lean();
  if (!existing) throw new AppError("Outbox event not found", 404);
  if (existing.status !== "failed") {
    throw new AppError("Only automatically exhausted outbox events can be replayed", 409);
  }

  const record = await OutboxEvent.findOneAndUpdate(
    { _id: outboxId, tenantId, status: "failed", attempts: existing.attempts },
    {
      $set: {
        status: "pending",
        attempts: 0,
        lastFailureAttempts: existing.attempts,
        lastError: null,
        nextAttemptAt: null,
        claimToken: null,
        failedAt: null,
        replayedAt: new Date(),
        replayedBy: operatorId,
      },
      $inc: { replayCount: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!record) {
    throw new AppError("Outbox event was already replayed; refresh and retry", 409);
  }

  return toOperatorRecord(record);
};
