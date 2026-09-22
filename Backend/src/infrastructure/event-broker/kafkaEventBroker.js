import {
  consumer,
  connectKafkaConsumer,
  subscribeKafkaConsumer,
  stopKafkaConsumer,
  disconnectedKafkaConsumer,
} from "../kafka/kafka.consumer.js";
import { validateKafkaTopics } from "../kafka/kafka.admin.js";
import {
  connectKafkaProducer,
  disconnectKafkaProducer,
  publishKafkaEvents,
} from "../kafka/kafka.producer.js";
import {
  connectDLQProducer,
  disconnectDLQProducer,
} from "../kafka/dlq.publisher.js";
import { getWorkerConcurrency } from "../../modules/worker/worker.concurrency.js";
import { logInfo, logWarn } from "../../modules/worker/worker.logger.js";

// KafkaJS throttles the supplied heartbeat callback to its configured
// heartbeatInterval. Calling it from a shorter application timer keeps long
// delivery operations from going quiet without changing KafkaJS settings.
const APPLICATION_HEARTBEAT_INTERVAL_MS = 1_000;
const activeHeartbeatStops = new Set();

const stopActiveHeartbeats = () => {
  for (const stop of [...activeHeartbeatStops]) stop();
};

const startHeartbeatLoop = (heartbeat) => {
  if (typeof heartbeat !== "function") return () => {};

  let stopped = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    activeHeartbeatStops.delete(stop);
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;

      try {
        await heartbeat();
      } catch (error) {
        // Heartbeat failures must not alter delivery retry/DLQ semantics or
        // create an unhandled rejection. KafkaJS will surface a fatal group
        // error through its normal consumer lifecycle when appropriate.
        logWarn("Kafka heartbeat failed during message processing", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        schedule();
      }
    }, APPLICATION_HEARTBEAT_INTERVAL_MS);
  };

  activeHeartbeatStops.add(stop);
  schedule();
  return stop;
};

const processKafkaMessage = async (handler, context) => {
  const stopHeartbeat = startHeartbeatLoop(context.heartbeat);
  try {
    return await handler({ broker: "kafka", ...context });
  } finally {
    stopHeartbeat();
  }
};

export const createEventBroker = () => ({
  mode: "kafka",

  async initializePublisher() {
    await connectKafkaProducer();
    logInfo("event broker initialized", { broker: "kafka" });
  },

  async publishEvent(events, options = {}) {
    return publishKafkaEvents(Array.isArray(events) ? events : [events], options);
  },

  async initializeWorker() {
    await validateKafkaTopics();
    await connectKafkaConsumer();
    await subscribeKafkaConsumer();
    await connectDLQProducer();
  },

  async startConsumer(handler) {
    return consumer.run({
      partitionsConsumedConcurrently: getWorkerConcurrency(),
      eachMessage: (context) => processKafkaMessage(handler, context),
    });
  },

  async stopConsumer() {
    stopActiveHeartbeats();
    await stopKafkaConsumer();
  },

  async disconnectWorker() {
    await disconnectedKafkaConsumer();
    await disconnectDLQProducer();
  },

  async disconnectPublisher() {
    await disconnectKafkaProducer();
  },

  onCrash(handler) {
    consumer.on(consumer.events.CRASH, handler);
  },

  async publishDlq(record) {
    // Dynamic import keeps existing Kafka DLQ behavior and makes the adapter's
    // test spyable without loading Kafka in SQS mode.
    const { publishToDLQ } = await import("../kafka/dlq.publisher.js");
    return publishToDLQ(record);
  },
});
