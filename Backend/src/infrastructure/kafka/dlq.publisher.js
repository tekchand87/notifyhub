// src/infrastructure/kafka/dlq.publisher.js
// Dedicated producer for publishing failed events to the DLQ Kafka topic.
// A separate producer is used so DLQ publishing does NOT interfere with
// the main event producer (different connection lifecycle).
//
// SAFETY: publishToDLQ NEVER throws — if publishing fails, the error
// is logged but the worker continues. The DB status is already "dlq" at
// this point, so the event is still correctly marked as dead-lettered.

import { kafka } from "./kafka.js";
import "dotenv/config";

const dlqProducer = kafka.producer();
let dlqConnected = false;

export const connectDLQProducer = async () => {
  if (dlqConnected) return;
  await dlqProducer.connect();
  dlqConnected = true;
};

export const disconnectDLQProducer = async () => {
  if (!dlqConnected) return;
  await dlqProducer.disconnect();
  dlqConnected = false;
};

/**
 * Publish a DLQ record to the configured Kafka DLQ topic.
 * This function NEVER throws — failures are returned as { ok: false, error }.
 *
 * @param {object} dlqRecord
 * @param {string} dlqRecord.eventId
 * @param {string} dlqRecord.tenantId
 * @param {string} dlqRecord.channel
 * @param {number} dlqRecord.attempts
 * @param {string} dlqRecord.reason        - Human-readable failure reason
 * @param {string} [dlqRecord.lastError]
 * @param {string} [dlqRecord.originalTopic]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export const publishToDLQ = async (dlqRecord) => {
  const topic = process.env.KAFKA_DLQ_TOPIC || "notifyhub.events.dlq";

  if (!dlqConnected) {
    return { ok: false, error: "DLQ producer is not connected" };
  }

  const message = {
    eventId: dlqRecord.eventId,
    tenantId: dlqRecord.tenantId,
    channel: dlqRecord.channel,
    attempts: dlqRecord.attempts,
    reason: dlqRecord.reason,
    lastError: dlqRecord.lastError ?? null,
    originalTopic: dlqRecord.originalTopic ?? process.env.KAFKA_TOPIC ?? null,
    failedAt: new Date().toISOString(),
  };

  try {
    await dlqProducer.send({
      topic,
      messages: [{
        // Use tenantId as the key for consistent partition routing (same as main topic)
        key: String(dlqRecord.tenantId),
        value: JSON.stringify(message),
        headers: {
          "notifyhub-dlq": "true",
          "event-id": String(dlqRecord.eventId),
          "tenant-id": String(dlqRecord.tenantId),
        },
      }],
    });
    return { ok: true };
  } catch (error) {
    // DLQ publish failure must NEVER crash the worker
    return { ok: false, error: error.message };
  }
};
