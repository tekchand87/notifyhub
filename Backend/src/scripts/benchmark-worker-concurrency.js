// Usage: node src/scripts/benchmark-worker-concurrency.js <concurrency> [total]
// End-to-end worker benchmark: Kafka -> worker claim -> local webhook -> Mongo state.

import "dotenv/config";
import http from "node:http";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { kafka } from "../infrastructure/kafka/kafka.js";
import { Tenant } from "../modules/tenant/tenant.model.js";
import { Event } from "../modules/event/event.model.js";
import { Delivery } from "../modules/event/delivery.model.js";

const concurrency = Number(process.argv[2]);
const total = Number(process.argv[3] || 1_200);
const partitionCount = Number(process.argv[4] || 60);
const deliveryDelayMs = 20;
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(partitionCount) || partitionCount < 1) {
  throw new Error("Usage: node src/scripts/benchmark-worker-concurrency.js <concurrency> [total] [partitions]");
}

const nonce = Date.now();
const topic = `notifyhub.worker-benchmark-${nonce}`;
const groupId = `notifyhub-worker-benchmark-${nonce}`;
const dbName = `notifyhub_worker_benchmark_${nonce}`;
const mongoUrl = new URL(process.env.MONGODB_URI);
mongoUrl.pathname = `/${dbName}`;
const benchmarkMongoUri = mongoUrl.toString();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, percentileValue) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))] ?? 0;
};
const waitFor = async (check, timeoutMs, message) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await wait(100);
  }
  throw new Error(message);
};
const opcounters = (serverStatus) => serverStatus.opcounters ?? {};
const counterDelta = (before, after) => Object.fromEntries(
  ["insert", "query", "update", "delete", "command"].map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)])
);

const startReceiver = async () => {
  const server = http.createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(204);
      res.end();
    }, deliveryDelayMs);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
};

const stopChild = async (child) => {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    wait(15_000).then(() => child.kill("SIGKILL")),
  ]);
};

const run = async () => {
  const admin = kafka.admin();
  const producer = kafka.producer();
  let receiver;
  let child;

  try {
    receiver = await startReceiver();
    const receiverPort = receiver.address().port;
    await mongoose.connect(benchmarkMongoUri);
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: partitionCount, replicationFactor: 1 }] });

    const tenants = await Tenant.insertMany(Array.from({ length: partitionCount }, (_, partition) => ({
      name: `Worker Benchmark ${partition} ${nonce}`,
      slug: `worker-benchmark-${nonce}-${partition}`,
      webhookUrl: `http://127.0.0.1:${receiverPort}/delivery`,
      webhookSecret: "benchmark-secret",
    })));
    const createdAt = new Date();
    const events = await Event.insertMany(Array.from({ length: total }, (_, index) => ({
      tenantId: tenants[index % partitionCount]._id,
      type: "benchmark.delivery",
      channel: "webhook",
      payload: { sequence: index },
      status: "queued",
      maxAttempts: 3,
      createdAt,
      updatedAt: createdAt,
    })));

    let workerReady = false;
    child = spawn(process.execPath, ["src/workers/notification.worker.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGODB_URI: benchmarkMongoUri,
        KAFKA_TOPIC: topic,
        KAFKA_GROUP_ID: groupId,
        WORKER_CONCURRENCY: String(concurrency),
        WEBHOOK_ALLOW_LOCALHOST: "true",
        RETRY_POLLER_INTERVAL_MS: "60000",
        SMTP_USER: "benchmark@example.test",
        GMAIL_CLIENT_ID: "benchmark",
        GMAIL_CLIENT_SECRET: "benchmark",
        GMAIL_REFRESH_TOKEN: "benchmark",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const absorbOutput = (chunk) => {
      if (chunk.toString().includes("NotifyHub Worker is running")) workerReady = true;
    };
    child.stdout.on("data", absorbOutput);
    child.stderr.on("data", absorbOutput);
    await waitFor(() => workerReady, 30_000, "Worker did not become ready");

    const beforeMongo = opcounters(await mongoose.connection.db.admin().command({ serverStatus: 1 }));
    await producer.connect();
    const startedAt = performance.now();
    await producer.send({
      topic,
      messages: events.map((event, index) => ({
        partition: index % partitionCount,
        key: String(event.tenantId),
        value: JSON.stringify({
          eventId: String(event._id),
          tenantId: String(event.tenantId),
          type: event.type,
          channel: event.channel,
          payload: event.payload,
          createdAt: event.createdAt,
        }),
      })),
    });
    await waitFor(
      async () => (await Event.countDocuments({ status: "delivered" })) === total,
      180_000,
      "Timed out waiting for worker deliveries"
    );
    const elapsedSeconds = (performance.now() - startedAt) / 1_000;
    const afterMongo = opcounters(await mongoose.connection.db.admin().command({ serverStatus: 1 }));
    await wait(500); // allow final offset commits before querying lag
    const [committed, highWatermarks, delivered, failedDeliveries] = await Promise.all([
      admin.fetchOffsets({ groupId, topics: [topic] }),
      admin.fetchTopicOffsets(topic),
      Event.find({ status: "delivered" }).select("createdAt deliveredAt").lean(),
      Delivery.countDocuments({ status: "failed" }),
    ]);
    const committedByPartition = new Map(committed[0].partitions.map(({ partition, offset }) => [partition, Number(offset)]));
    const kafkaLag = highWatermarks.reduce(
      (sum, { partition, offset }) => sum + Math.max(0, Number(offset) - (committedByPartition.get(partition) ?? 0)),
      0
    );
    const latencies = delivered.map((event) => event.deliveredAt.getTime() - event.createdAt.getTime());
    const mongoDelta = counterDelta(beforeMongo, afterMongo);

    console.log(JSON.stringify({
      concurrency,
      partitions: partitionCount,
      total,
      messagesPerSecond: Number((total / elapsedSeconds).toFixed(1)),
      processingLatencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
      },
      errors: failedDeliveries,
      kafkaLag,
      mongoOperations: mongoDelta,
      mongoOperationsPerSecond: Object.fromEntries(
        Object.entries(mongoDelta).map(([name, value]) => [name, Number((value / elapsedSeconds).toFixed(1))])
      ),
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    }));
  } finally {
    await producer.disconnect().catch(() => {});
    await stopChild(child).catch(() => {});
    if (receiver) await new Promise((resolve) => receiver.close(resolve));
    await admin.deleteTopics({ topics: [topic] }).catch(() => {});
    await admin.disconnect().catch(() => {});
    if (mongoose.connection.readyState) {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect();
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
