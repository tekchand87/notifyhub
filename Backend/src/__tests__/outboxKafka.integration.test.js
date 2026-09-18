// Opt-in real-infrastructure validation. Run in CI/staging with disposable
// KAFKA_INTEGRATION_BROKERS and MONGODB_URI values; it never runs against the
// default local developer broker by accident.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kafka } from "kafkajs";
import mongoose from "mongoose";
import { OutboxEvent } from "../modules/event/outbox.model.js";

const brokers = process.env.KAFKA_INTEGRATION_BROKERS?.split(",").filter(Boolean);
const enabled = Boolean(brokers?.length && process.env.MONGODB_URI);
const topic = `notifyhub-outbox-recovery-${Date.now()}`;
const groupId = `notifyhub-outbox-recovery-test-${Date.now()}`;
const kafka = enabled ? new Kafka({ clientId: "notifyhub-outbox-integration", brokers }) : null;
let admin;
let observer;
let connectKafkaProducer;
let disconnectKafkaProducer;
let runOutboxPublisherCycle;

describe.skipIf(!enabled)("Outbox recovery with real Kafka", () => {
  beforeAll(async () => {
    process.env.KAFKA_BROKERS = brokers.join(",");
    process.env.KAFKA_TOPIC = topic;
    await mongoose.connect(process.env.MONGODB_URI);
    admin = kafka.admin();
    observer = kafka.consumer({ groupId });
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
    await observer.connect();
    await observer.subscribe({ topic, fromBeginning: true });
    ({ connectKafkaProducer, disconnectKafkaProducer } = await import("../infrastructure/kafka/kafka.producer.js"));
    ({ runOutboxPublisherCycle } = await import("../infrastructure/outbox/outbox.publisher.js"));
    await connectKafkaProducer();
  }, 30_000);

  afterAll(async () => {
    await disconnectKafkaProducer?.().catch(() => {});
    await observer?.disconnect().catch(() => {});
    await admin?.deleteTopics({ topics: [topic] }).catch(() => {});
    await admin?.disconnect().catch(() => {});
    await mongoose.disconnect();
  }, 30_000);

  it("publishes a recoverably failed record after manual requeue", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    const record = await OutboxEvent.create({
      tenantId,
      eventId,
      topic,
      key: String(tenantId),
      payload: { type: "test.event", channel: "webhook", payload: { value: 1 }, createdAt: new Date() },
      status: "failed",
      attempts: 3,
      maxAttempts: 3,
      lastError: "Kafka unavailable",
      failedAt: new Date(),
    });

    const { replayFailedOutboxEvent } = await import("../modules/event/outbox.service.js");
    await replayFailedOutboxEvent(String(tenantId), String(record._id), new mongoose.Types.ObjectId());

    const observed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out waiting for Kafka publication")), 15_000);
      observer.run({
        eachMessage: async ({ message }) => {
          const event = JSON.parse(message.value.toString());
          if (event.eventId === String(eventId)) {
            clearTimeout(timeout);
            resolve(event);
          }
        },
      });
    });

    const result = await runOutboxPublisherCycle();
    const publishedKafkaEvent = await observed;
    const published = await OutboxEvent.findById(record._id).lean();

    expect(result).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(publishedKafkaEvent).toMatchObject({ eventId: String(eventId), tenantId: String(tenantId) });
    expect(published.status).toBe("published");
  }, 30_000);
});
