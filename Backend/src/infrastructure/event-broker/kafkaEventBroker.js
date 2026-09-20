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
import { logInfo } from "../../modules/worker/worker.logger.js";

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
      eachMessage: async (context) => handler({ broker: "kafka", ...context }),
    });
  },

  async stopConsumer() {
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
