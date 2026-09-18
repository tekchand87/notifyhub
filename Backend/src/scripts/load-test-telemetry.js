// Usage: node src/scripts/load-test-telemetry.js <out-file> <duration-seconds>
// Samples the target environment while k6 executes one fixed-rate stage.

import "dotenv/config";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import { Kafka } from "kafkajs";

const [outFile, durationArg] = process.argv.slice(2);
const durationSeconds = Number(durationArg || 60);
if (!outFile || !Number.isSafeInteger(durationSeconds) || durationSeconds < 1) {
  throw new Error("Usage: node src/scripts/load-test-telemetry.js <out-file> <duration-seconds>");
}

const topic = process.env.KAFKA_TOPIC;
const groupId = process.env.KAFKA_GROUP_ID || "notifyhub-workers";
if (!topic) throw new Error("KAFKA_TOPIC is required");

const kafka = new Kafka({
  clientId: "notifyhub-load-test-telemetry",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(",").map((broker) => broker.trim()),
});
const admin = kafka.admin();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const elapsed = (start) => Number(((performance.now() - start) / 1_000).toFixed(3));

const snapshot = async () => {
  const pingStarted = performance.now();
  await mongoose.connection.db.admin().ping();
  const mongoPingMs = Number((performance.now() - pingStarted).toFixed(2));
  const [outbox, events, deliveries, topicOffsets, offsets] = await Promise.all([
    mongoose.connection.db.collection("outboxevents").aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    mongoose.connection.db.collection("events").aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    mongoose.connection.db.collection("deliveries").countDocuments(),
    admin.fetchTopicOffsets(topic),
    admin.fetchOffsets({ groupId, topics: [topic] }),
  ]);
  const outboxByStatus = Object.fromEntries(outbox.map(({ _id, count }) => [_id, count]));
  const eventsByStatus = Object.fromEntries(events.map(({ _id, count }) => [_id, count]));
  const committed = new Map(offsets[0].partitions.map(({ partition, offset }) => [partition, Number(offset)]));
  const kafkaHighWatermark = topicOffsets.reduce((total, { offset }) => total + Number(offset), 0);
  const kafkaConsumerLag = topicOffsets.reduce(
    (total, { partition, offset }) => total + Math.max(0, Number(offset) - (committed.get(partition) ?? 0)),
    0
  );
  return { mongoPingMs, outboxByStatus, eventsByStatus, deliveryCount: deliveries, kafkaHighWatermark, kafkaConsumerLag };
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await admin.connect();
  const started = performance.now();
  const samples = [];
  try {
    while (elapsed(started) <= durationSeconds + 5) {
      samples.push({ elapsedSeconds: elapsed(started), ...(await snapshot()) });
      await sleep(1_000);
    }
    const first = samples[0];
    const last = samples.at(-1);
    const seconds = Math.max(1, last.elapsedSeconds - first.elapsedSeconds);
    const delta = (after, before) => after - before;
    const delivered = delta(last.eventsByStatus.delivered ?? 0, first.eventsByStatus.delivered ?? 0);
    const terminal = delivered + delta(last.eventsByStatus.failed ?? 0, first.eventsByStatus.failed ?? 0) + delta(last.eventsByStatus.dlq ?? 0, first.eventsByStatus.dlq ?? 0);
    await fs.writeFile(outFile, JSON.stringify({
      topic,
      groupId,
      durationSeconds: seconds,
      mongoLatencyMs: {
        p50: percentile(samples.map(({ mongoPingMs }) => mongoPingMs), 0.5),
        p95: percentile(samples.map(({ mongoPingMs }) => mongoPingMs), 0.95),
        max: Math.max(...samples.map(({ mongoPingMs }) => mongoPingMs)),
      },
      outboxBacklog: { start: first.outboxByStatus.pending ?? 0, end: last.outboxByStatus.pending ?? 0 },
      kafkaThroughputPerSecond: Number((delta(last.kafkaHighWatermark, first.kafkaHighWatermark) / seconds).toFixed(1)),
      kafkaConsumerLag: { start: first.kafkaConsumerLag, end: last.kafkaConsumerLag, max: Math.max(...samples.map(({ kafkaConsumerLag }) => kafkaConsumerLag)) },
      workerThroughputPerSecond: Number((terminal / seconds).toFixed(1)),
      deliveryThroughputPerSecond: Number((delivered / seconds).toFixed(1)),
      samples,
    }, null, 2));
  } finally {
    await admin.disconnect().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

run().catch((error) => { console.error(error); process.exit(1); });
