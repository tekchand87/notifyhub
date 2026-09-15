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
import { retryConfig } from "../../config/retry.config.js";
import {
  logEventReceived,
  logEventSkipped,
  logEventDelivered,
  logEventFailed,
  logDeliveryRecorded,
  logWorkerStarted,
} from "./worker.logger.js";


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
    await markEventDelivered(event.eventId);

    logEventDelivered({ eventId: event.eventId, channel: event.channel, result });

  } catch (error) {

    // 6. Persist a failed Delivery record for audit trail
    await Delivery.create({
      eventId: event.eventId,
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
      await markEventFailed(event.eventId, error.message);
    }
  }
};


export const startWorker = async (workerId) => {

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      await processKafkaMessage({ topic, partition, message, workerId });
    },
  });

  logWorkerStarted();
};
