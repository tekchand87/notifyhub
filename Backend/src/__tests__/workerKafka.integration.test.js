// Real-broker coverage for the Kafka acknowledgement boundary. This suite is
// intentionally opt-in: it requires a disposable Kafka broker and MongoDB, not
// mocks. Run with KAFKA_INTEGRATION_BROKERS and MONGODB_URI in CI/staging.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kafka } from "kafkajs";
import mongoose from "mongoose";
import { PoisonMessage } from "../modules/worker/poison.message.model.js";

const brokers = process.env.KAFKA_INTEGRATION_BROKERS?.split(",").filter(Boolean);
const enabled = Boolean(brokers?.length && process.env.MONGODB_URI);
const topic = `notifyhub-worker-offset-${Date.now()}`;
const groupId = `notifyhub-worker-offset-test-${Date.now()}`;
const kafka = enabled ? new Kafka({ clientId: "notifyhub-worker-integration", brokers }) : null;
let admin;
let producer;
let stopWorker;
let stopKafkaConsumer;
let disconnectedKafkaConsumer;

describe.skipIf(!enabled)("Kafka worker offset semantics (real infrastructure)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    admin = kafka.admin();
    producer = kafka.producer();
    await admin.connect();
    await producer.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
    await PoisonMessage.deleteMany({ topic });
    process.env.KAFKA_TOPIC = topic;
    process.env.KAFKA_GROUP_ID = groupId;
    ({ stopWorker } = await import("../modules/worker/worker.service.js"));
    ({ stopKafkaConsumer, disconnectedKafkaConsumer } = await import("../infrastructure/kafka/kafka.consumer.js"));
    const { connectKafkaConsumer, subscribeKafkaConsumer } = await import("../infrastructure/kafka/kafka.consumer.js");
    const { startWorker } = await import("../modules/worker/worker.service.js");
    await connectKafkaConsumer();
    await subscribeKafkaConsumer();
    await startWorker("real-kafka-integration-worker");
  }, 30_000);

  afterAll(async () => {
    await stopKafkaConsumer?.().catch(() => {});
    await stopWorker?.().catch(() => {});
    await disconnectedKafkaConsumer?.().catch(() => {});
    await producer?.disconnect();
    await admin?.deleteTopics({ topics: [topic] }).catch(() => {});
    await admin?.disconnect();
    await mongoose.disconnect();
  }, 30_000);

  it("records malformed data durably before the consumer resolves its offset", async () => {
    await producer.send({ topic, messages: [{ value: "not-json" }] });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await PoisonMessage.exists({ topic, partition: 0, offset: "0" })) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(await PoisonMessage.countDocuments({ topic })).toBe(1);
  }, 30_000);
});
