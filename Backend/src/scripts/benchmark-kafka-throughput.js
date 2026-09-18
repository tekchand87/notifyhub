// Usage: node src/scripts/benchmark-kafka-throughput.js <partitions> [total] [baseline|configured]
// Isolated Kafka producer/consumer benchmark. It never changes application topics.

import "dotenv/config";
import { CompressionTypes, Kafka, Partitioners } from "kafkajs";

const partitions = Number(process.argv[2]);
const total = Number(process.argv[3] || 60_000);
const mode = process.argv[4] || "baseline";
if (!Number.isSafeInteger(partitions) || partitions < 1 || !Number.isSafeInteger(total) || total < 1 || !["baseline", "configured"].includes(mode)) {
  throw new Error("Usage: node src/scripts/benchmark-kafka-throughput.js <partitions> [total] [baseline|configured]");
}

const topic = `notifyhub.kafka-benchmark-${mode}-${partitions}-${Date.now()}`;
const groupId = `notifyhub-kafka-benchmark-${Date.now()}`;
const brokers = process.env.KAFKA_BROKERS.split(",").map((broker) => broker.trim());
const kafka = new Kafka({ clientId: `notifyhub-kafka-benchmark-${mode}`, brokers });
const configured = mode === "configured";
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  ...(configured ? { idempotent: true, maxInFlightRequests: 5 } : {}),
});
const consumer = kafka.consumer({
  groupId,
  ...(configured ? { minBytes: 32_768, maxBytes: 10_485_760, maxBytesPerPartition: 1_048_576, maxWaitTimeInMs: 50 } : {}),
});
const admin = kafka.admin();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  let consumed = 0;
  let consumeFinishedAt = 0;
  const receivedByPartition = new Map();
  try {
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: partitions, replicationFactor: 1 }] });
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      partitionsConsumedConcurrently: Math.min(50, partitions),
      eachMessage: async ({ partition }) => {
        consumed += 1;
        receivedByPartition.set(partition, (receivedByPartition.get(partition) ?? 0) + 1);
        if (consumed === total) consumeFinishedAt = performance.now();
      },
    });
    await wait(500);

    const value = JSON.stringify({ type: "benchmark", payload: { padding: "x".repeat(512) } });
    const producerStartedAt = performance.now();
    for (let start = 0; start < total; start += 500) {
      const end = Math.min(start + 500, total);
      await producer.send({
        topic,
        acks: -1,
        compression: configured ? CompressionTypes.GZIP : CompressionTypes.None,
        messages: Array.from({ length: end - start }, (_, offset) => {
          const index = start + offset;
          return { partition: index % partitions, key: `tenant-${index % (partitions * 8)}`, value };
        }),
      });
    }
    const producerElapsedSeconds = (performance.now() - producerStartedAt) / 1_000;
    const producerFinishedAt = performance.now();
    const deadline = Date.now() + 120_000;
    while (consumed < total && Date.now() < deadline) await wait(25);
    if (consumed !== total) throw new Error(`Timed out: consumed ${consumed}/${total}`);

    await wait(500);
    const [offsets, committed] = await Promise.all([
      admin.fetchTopicOffsets(topic),
      admin.fetchOffsets({ groupId, topics: [topic] }),
    ]);
    const committedByPartition = new Map(committed[0].partitions.map(({ partition, offset }) => [partition, Number(offset)]));
    const kafkaLag = offsets.reduce((sum, { partition, offset }) => sum + Math.max(0, Number(offset) - (committedByPartition.get(partition) ?? 0)), 0);
    const utilization = Array.from({ length: partitions }, (_, partition) => receivedByPartition.get(partition) ?? 0);
    console.log(JSON.stringify({
      mode,
      partitions,
      total,
      producerMessagesPerSecond: Number((total / producerElapsedSeconds).toFixed(1)),
      consumerMessagesPerSecond: Number((total / ((consumeFinishedAt - producerStartedAt) / 1_000)).toFixed(1)),
      producerElapsedSeconds: Number(producerElapsedSeconds.toFixed(3)),
      consumerDrainSeconds: Number(((consumeFinishedAt - producerFinishedAt) / 1_000).toFixed(3)),
      kafkaLag,
      partitionUtilization: {
        min: Math.min(...utilization),
        max: Math.max(...utilization),
        average: Number((total / partitions).toFixed(1)),
      },
    }));
  } finally {
    await consumer.disconnect().catch(() => {});
    await producer.disconnect().catch(() => {});
    await admin.deleteTopics({ topics: [topic] }).catch(() => {});
    await admin.disconnect().catch(() => {});
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
