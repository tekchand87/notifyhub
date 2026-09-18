// src/modules/worker/worker.service.js
// Orchestrates the per-message pipeline:
//   parse → mark processing → dispatch → record delivery → mark delivered/failed/retry_wait/dlq
// Stays channel-agnostic: no SMTP, no HTTP webhook code here.

import { consumer } from "../../infrastructure/kafka/kafka.consumer.js";
import { parseKafkaEvent } from "./worker.parser.js";
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

export const processKafkaMessage = async ({ topic, partition, message, workerId }) => {

  // 1. Parse and validate the raw Kafka message
  const event = parseKafkaEvent(message);

  logEventReceived({
    eventId: event.eventId,
    tenantId: event.tenantId,
    type: event.type,
    channel: event.channel,
    topic,
    partition,
    offset: message.offset,
  });


  // 2. Atomically transition: queued|retry_wait → processing (with worker lease)
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

    // 3. Route to the correct channel handler (email, webhook, …)
    const result = await dispatchNotification(enrichedEvent);


    // 4. Persist a successful Delivery record for audit/traceability
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


    // 5. Transition: processing → delivered
    requireDurableTransition(
      await markEventDelivered(event.eventId),
      "processing -> delivered"
    );

    logEventDelivered({ eventId: event.eventId, channel: event.channel, result });

  } catch (error) {

    // 6. Persist a failed Delivery record for audit trail
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
      // 7a. Retryable and still under limit → schedule retry
      await scheduleRetry(event.eventId, event.tenantId, newAttempts, error);

    } else if (newAttempts >= maxAttempts) {
      // 7b. Max attempts reached → move to DLQ regardless of retryability
      await moveToDLQ(
        event.eventId,
        event.tenantId,
        event.channel,
        newAttempts,
        error,
        topic
      );

    } else {
      // 7c. Non-retryable failure → permanent fail
      requireDurableTransition(
        await markEventFailed(event.eventId, error.message),
        "processing -> failed"
      );
    }
  }
};


export const startWorker = async (workerId) => {
  acceptingMessages = true;
  const concurrency = getWorkerConcurrency();

  await consumer.run({
    // KafkaJS runs this many assigned partitions concurrently while retaining
    // in-order processing and offset commits within each partition.
    partitionsConsumedConcurrently: concurrency,
    eachMessage: async ({ topic, partition, message }) => {
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
        // idempotent Mongo failure record first; only then may this handler
        // resolve and allow KafkaJS to advance the offset.
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
    },
  });

  logWorkerStarted({ concurrency });
};

/** Wait for the bounded set of already-started handlers to settle. */
export const stopWorker = async () => {
  acceptingMessages = false;
  await Promise.allSettled([...inFlightMessages]);
};
