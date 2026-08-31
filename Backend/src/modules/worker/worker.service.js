// src/modules/worker/worker.service.js

import { consumer } from "../../infrastructure/kafka/kafka.consumer.js";

import { parseKafkaEvent } from "./worker.parser.js";

import { dispatchNotification } from "./worker.dispatcher.js";

import {
  markEventProcessing,
  markEventDelivered,
  markEventFailed
} from "./worker.event.service.js";


export const processKafkaMessage = async ({
  topic,
  partition,
  message
}) => {

  // 1. Convert and validate Kafka message
  const event = parseKafkaEvent(message);

  console.log("Event received", {
    eventId: event.eventId,
    tenantId: event.tenantId,
    type: event.type,
    channel: event.channel,
    topic,
    partition,
    offset: message.offset
  });


  // 2. Change event status:
  // queued → processing
  const dbEvent = await markEventProcessing(event.eventId);

  // If event was already processed or doesn't exist
  if (!dbEvent) {

    console.log(
      `Skipping ${event.eventId}: event is not queued`
    );

    return;
  }


  try {

    // 3. Send notification
    const result = await dispatchNotification(event);


    // 4. Change status:
    // processing → delivered
    await markEventDelivered(event.eventId);


    console.log("Event processed successfully", {
      eventId: event.eventId,
      channel: event.channel,
      result
    });

  } catch (error) {

    // 5. Change status:
    // processing → failed
    await markEventFailed(event.eventId);


    console.error("Event processing failed", {
      eventId: event.eventId,
      channel: event.channel,
      error: error.message
    });


    // Important:
    // Throw the error so Kafka knows processing failed.
    throw error;
  }
};


export const startWorker = async () => {

  await consumer.run({

    eachMessage: async ({
      topic,
      partition,
      message
    }) => {

      await processKafkaMessage({
        topic,
        partition,
        message
      });

    }

  });


  console.log("NotifyHub Worker is running");
};