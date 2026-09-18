import crypto from "crypto";
import { PoisonMessage } from "./poison.message.model.js";

const messageValue = (message) => {
  if (message?.value == null) return Buffer.alloc(0);
  return Buffer.isBuffer(message.value)
    ? message.value
    : Buffer.from(String(message.value));
};

// Best-effort extraction is deliberately separate from validation. It provides
// useful correlation fields without treating untrusted payload data as valid.
const extractIdentity = (value) => {
  try {
    const parsed = JSON.parse(value.toString("utf8"));
    return {
      eventId: typeof parsed?.eventId === "string" ? parsed.eventId : null,
      tenantId: typeof parsed?.tenantId === "string" ? parsed.tenantId : null,
    };
  } catch {
    return { eventId: null, tenantId: null };
  }
};

/**
 * Persist an idempotent failure outcome for an invalid Kafka record.
 * Throws when Mongo cannot establish that outcome; callers must then rethrow to
 * KafkaJS so the source offset is not acknowledged.
 */
export const persistPoisonMessage = async ({ topic, partition, message, error }) => {
  const value = messageValue(message);
  const identity = extractIdentity(value);
  const headerNames = Object.keys(message?.headers || {});

  return PoisonMessage.findOneAndUpdate(
    { topic, partition, offset: String(message?.offset) },
    {
      $setOnInsert: {
        ...identity,
        errorType: error?.name || "KafkaMessageValidationError",
        reason: error?.message || "Kafka message could not be processed",
        payloadBytes: value.length,
        payloadSha256: crypto.createHash("sha256").update(value).digest("hex"),
        headerNames,
        failedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
};
