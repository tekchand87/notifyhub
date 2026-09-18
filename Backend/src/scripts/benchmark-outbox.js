// Usage: node src/scripts/benchmark-outbox.js <legacy|batched> [total]
// Uses an isolated Kafka topic and only synthetic OutboxEvent records.

import "dotenv/config";
import mongoose from "mongoose";
import { OutboxEvent } from "../modules/event/outbox.model.js";
import { kafka } from "../infrastructure/kafka/kafka.js";
import {
  connectKafkaProducer,
  disconnectKafkaProducer,
  publishKafkaEvent,
} from "../infrastructure/kafka/kafka.producer.js";

const mode = process.argv[2];
const total = Number(process.argv[3] || (mode === "legacy" ? 1_000 : 20_000));
if (!new Set(["legacy", "batched"]).has(mode) || !Number.isSafeInteger(total) || total < 1) {
  throw new Error("Usage: node src/scripts/benchmark-outbox.js <legacy|batched> [total]");
}

const benchmarkTopic = `notifyhub.outbox-benchmark-${Date.now()}`;
const benchmarkDatabase = `notifyhub_outbox_benchmark_${Date.now()}`;
process.env.KAFKA_TOPIC = benchmarkTopic;
process.env.OUTBOX_BATCH_SIZE = mode === "legacy" ? "50" : "500";
process.env.OUTBOX_CONCURRENCY = "50";
process.env.OUTBOX_POLL_INTERVAL_MS = "25";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createTopic = async () => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic: benchmarkTopic, numPartitions: 6, replicationFactor: 1 }] });
  } finally {
    await admin.disconnect();
  }
};

const seed = async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  const documents = Array.from({ length: total }, () => ({
    tenantId,
    eventId: new mongoose.Types.ObjectId(),
    topic: benchmarkTopic,
    key: String(tenantId),
    payload: {
      type: "benchmark.outbox",
      channel: "webhook",
      payload: { benchmark: true },
      createdAt,
    },
    status: "pending",
    maxAttempts: 5,
    nextAttemptAt: null,
  }));
  await OutboxEvent.insertMany(documents, { ordered: false });
};

const runLegacy = async () => {
  let published = 0;
  while (published < total) {
    const records = [];
    for (let i = 0; i < 50; i++) {
      const record = await OutboxEvent.findOneAndUpdate(
        { status: "pending", nextAttemptAt: null },
        { $set: { status: "publishing" } },
        { returnDocument: "after", sort: { createdAt: 1 } }
      ).lean();
      if (!record) break;
      records.push(record);
    }
    await Promise.all(records.map(async (record) => {
      await publishKafkaEvent({
        _id: record.eventId,
        tenantId: record.tenantId,
        type: record.payload.type,
        channel: record.payload.channel,
        payload: record.payload.payload,
        createdAt: record.payload.createdAt,
      });
      await OutboxEvent.findByIdAndUpdate(record._id, {
        $set: { status: "published", publishedAt: new Date() },
        $inc: { attempts: 1 },
      });
    }));
    published += records.length;
    if (records.length < 50) break;
    await sleep(1_000); // Original publisher's post-cycle polling delay.
  }
  return published;
};

const run = async () => {
  // A dedicated database prevents a running API publisher from claiming these
  // synthetic records and keeps benchmark data separate from application data.
  await mongoose.connect(process.env.MONGODB_URI, { dbName: benchmarkDatabase });
  await createTopic();
  await seed();
  await connectKafkaProducer();

  const startedAt = performance.now();
  let published;
  if (mode === "legacy") {
    published = await runLegacy();
  } else {
    const { runOutboxPublisherCycle } = await import("../infrastructure/outbox/outbox.publisher.js");
    published = 0;
    while (published < total) published += (await runOutboxPublisherCycle()).published;
  }
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  const verified = await OutboxEvent.countDocuments({ topic: benchmarkTopic, status: "published" });

  console.log(JSON.stringify({
    mode,
    total,
    published,
    verified,
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    eventsPerSecond: Number((published / elapsedSeconds).toFixed(1)),
    topic: benchmarkTopic,
    database: benchmarkDatabase,
  }));

  await disconnectKafkaProducer();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await disconnectKafkaProducer().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
