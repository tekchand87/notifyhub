// src/modules/worker/worker.service.js
// Orchestrates the per-message pipeline:
//   parse → mark processing → dispatch → record delivery → mark delivered/failed/retry_wait/dlq
// Stays channel-agnostic: no SMTP, no HTTP webhook code here.

import { parseKafkaEvent, parseSqsEvent } from "./worker.parser.js";
import { dispatchNotification } from "./worker.dispatcher.js";
import {
  markEventProcessing,
  markEventDelivered,
  markEventFailed,
} from "./worker.event.service.js";
import { scheduleRetry, moveToDLQ, isRetryable } from "./retry.service.js";
import { Delivery } from "../event/delivery.model.js";
import { Event } from "../event/event.model.js";
import { retryConfig } from "../../config/retry.config.js";
import { getWorkerConcurrency } from "./worker.concurrency.js";
import { persistPoisonMessage } from "./poison.message.service.js";
import {
  logEventReceived,
  logEventSkipped,
  logEventDelivered,
  logEventFailed,
  logDeliveryRecorded,
  logWorkerStarted,
  logError,
} from "./worker.logger.js";

let acceptingMessages = false;
const inFlightMessages = new Set();

const kafkaContext = ({ topic, partition, message, workerId, event, attempt, deliveryId }) => ({
  eventId: event?.eventId ?? null,
  tenantId: event?.tenantId ?? null,
  deliveryId: deliveryId ?? null,
  topic,
  partition,
  offset: message?.offset ?? null,
  workerId,
  attempt: attempt ?? null,
});

const requireDurableTransition = (result, description) => {
  if (!result) {
    throw new Error(`Durable event transition did not apply: ${description}`);
  }
  return result;
};

const processEventMessage = async ({ event, topic, partition, message, workerId }) => {

  logEventReceived({
    eventId: event.eventId,
    tenantId: event.tenantId,
    type: event.type,
    channel: event.channel,
    topic,
    partition,
    offset: message.offset,
  });


  // 1. Atomically transition: queued|retry_wait → processing (with worker lease)
  //    findOneAndUpdate with status guard ensures only one worker
  //    claims the event (guards against duplicate Kafka delivery)
  const dbEvent = await markEventProcessing(event.eventId, workerId);

  if (!dbEvent) {
    // A terminal/actively-owned Event is a normal duplicate Kafka delivery and
    // can be acknowledged. A missing Event is not: it is a durable poison
    // outcome so operators can investigate an outbox/data-integrity violation.
    const existing = await Event.findById(event.eventId).select("_id").lean();
    if (!existing) {
      const error = new Error("Kafka message references an event that does not exist");
      error.name = "KafkaPoisonMessageError";
      error.isKafkaPoisonMessage = true;
      throw error;
    }
    logEventSkipped(event.eventId);
    return;
  }

  // Determine current attempt count (from DB, incremented on each failure)
  const currentAttempts = dbEvent.attempts ?? 0;
  const maxAttempts = dbEvent.maxAttempts ?? retryConfig.maxAttempts;

  // Pass attempt number to the handler (webhook handler uses it for logging)
  const enrichedEvent = {
    ...event,
    attempt: currentAttempts + 1,
  };


  try {

    // 2. Route to the correct channel handler (email, webhook, …)
    const result = await dispatchNotification(enrichedEvent);


    // 3. Persist a successful Delivery record for audit/traceability
    await Delivery.create({
      eventId: event.eventId,
      tenantId: event.tenantId,
      attemptNumber: currentAttempts + 1,
      channel: event.channel,
      status: "success",
      messageId: result?.messageId ?? null,
      providerResponse: result?.providerResponse ?? result?.response ?? null,
      attemptedAt: new Date(),
    });

    logDeliveryRecorded({
      eventId: event.eventId,
      channel: event.channel,
      status: "success",
      attemptNumber: currentAttempts + 1,
    });


    // 4. Transition: processing → delivered
    requireDurableTransition(
      await markEventDelivered(event.eventId),
      "processing -> delivered"
    );

    logEventDelivered({ eventId: event.eventId, channel: event.channel, result });

  } catch (error) {

    // 5. Persist a failed Delivery record for audit trail
    await Delivery.create({
      eventId: event.eventId,
      tenantId: event.tenantId,
      attemptNumber: currentAttempts + 1,
      channel: event.channel,
      status: "failed",
      errorMessage: error.message,
      attemptedAt: new Date(),
    }).catch(() => {
      // If even Delivery recording fails, do not swallow the original error
    });

    logEventFailed({ eventId: event.eventId, channel: event.channel, error });

    const retryable = isRetryable(error);
    const newAttempts = currentAttempts + 1;

    if (retryable && newAttempts < maxAttempts) {
      // 6a. Retryable and still under limit → schedule retry
      await scheduleRetry(event.eventId, event.tenantId, newAttempts, error);

    } else if (newAttempts >= maxAttempts) {
      // 6b. Max attempts reached → move to DLQ regardless of retryability
      await moveToDLQ(
        event.eventId,
        event.tenantId,
        event.channel,
        newAttempts,
        error,
        topic
      );

    } else {
      // 6c. Non-retryable failure → permanent fail
      requireDurableTransition(
        await markEventFailed(event.eventId, error.message),
        "processing -> failed"
      );
    }
  }
};

export const processKafkaMessage = async ({ topic, partition, message, workerId }) => {
  const event = parseKafkaEvent(message);
  return processEventMessage({ event, topic, partition, message, workerId });
};

export const processSqsMessage = async ({ event, message, workerId }) => {
  const parsedEvent = event || parseSqsEvent(message);
  return processEventMessage({
    event: parsedEvent,
    topic: process.env.KAFKA_TOPIC || "notifyhub.events",
    partition: null,
    message,
    workerId,
  });
};


const handleKafkaMessage = async ({ topic, partition, message, workerId }) => {
  if (!acceptingMessages) return;
  const task = processKafkaMessage({ topic, partition, message, workerId });
  inFlightMessages.add(task);
  try {
    await task;
  } catch (err) {
    // A parsed Event has an existing state machine. Any error after parsing
    // must propagate until that state machine has a durable outcome.
    if (!err?.isKafkaPoisonMessage) {
      logError("Kafka processing failure is not durably handled", {
        ...kafkaContext({ topic, partition, message, workerId }),
        error: err?.message,
        errorType: err?.name,
        retryable: true,
      });
      throw err;
    }

    // Parser failures have no Event state to transition. Persist their
    // idempotent Mongo failure record first; only then may KafkaJS advance.
    let poisonRecord = null;
    try {
      poisonRecord = await persistPoisonMessage({ topic, partition, message, error: err });
    } catch (poisonError) {
      logError("Kafka processing failure could not be durably recorded", {
        ...kafkaContext({ topic, partition, message, workerId }),
        error: poisonError.message,
        errorType: poisonError.name,
        originalError: err?.message,
        retryable: true,
      });
      throw poisonError;
    }

    if (!poisonRecord) throw err;

    logError("Kafka poison message durably recorded", {
      ...kafkaContext({
        topic,
        partition,
        message,
        workerId,
        event: { eventId: poisonRecord.eventId, tenantId: poisonRecord.tenantId },
      }),
      error: err.message,
      errorType: err.name,
      retryable: false,
      poisonMessageId: String(poisonRecord._id),
    });
  } finally {
    inFlightMessages.delete(task);
  }
};

const handleSqsMessage = async ({ event, message, workerId }) => {
  if (!acceptingMessages) return;
  const task = processSqsMessage({ event, message, workerId });
  inFlightMessages.add(task);
  try {
    // SQS must see failures so the adapter leaves the message undeleted.
    await task;
  } catch (error) {
    logError("SQS processing failure was not durably handled", {
      ...kafkaContext({ message, workerId, event }),
      error: error.message,
      errorType: error.name,
      retryable: true,
    });
    throw error;
  } finally {
    inFlightMessages.delete(task);
  }
};

export const startWorker = async (workerId, broker = null) => {
  acceptingMessages = true;
  const concurrency = getWorkerConcurrency();

  if (broker) {
    await broker.startConsumer((context) => context.broker === "sqs"
      ? handleSqsMessage({ ...context, workerId })
      : handleKafkaMessage({ ...context, workerId }));
    logWorkerStarted({ concurrency, broker: broker.mode });
    return;
  }

  // Legacy Kafka entry point retained for existing integration tests and
  // callers that explicitly connect/subscribe the Kafka consumer themselves.
  const { consumer } = await import("../../infrastructure/kafka/kafka.consumer.js");
  await consumer.run({
    partitionsConsumedConcurrently: concurrency,
    eachMessage: (context) => handleKafkaMessage({ ...context, workerId }),
  });

  logWorkerStarted({ concurrency, broker: "kafka" });
};

/** Wait for the bounded set of already-started handlers to settle. */
export const stopWorker = async () => {
  acceptingMessages = false;
  await Promise.allSettled([...inFlightMessages]);
};
