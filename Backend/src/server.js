// src/server.js
// API server entry point.
// Startup order: MongoDB → Kafka Producer → Outbox Publisher → HTTP server
//
// The Outbox Publisher is started here alongside the API server.
// It polls OutboxEvent records and publishes them to Kafka asynchronously,
// providing reliable at-least-once Kafka delivery without blocking API requests.

import app from "./app.js";
import { connectMongoDB } from "./database/mongo.js";
import { env } from "./config/env.js";
import {
  connectKafkaProducer,
  disconnectKafkaProducer,
} from "./infrastructure/kafka/kafka.producer.js";
import {
  startOutboxPublisher,
  stopOutboxPublisher,
} from "./infrastructure/outbox/outbox.publisher.js";

const startServer = async () => {
  // 1. Connect to MongoDB (required before anything else)
  await connectMongoDB();

  // 2. Connect Kafka producer (required by outbox publisher)
  try {
    await connectKafkaProducer();
    console.log("Kafka producer connected");
  } catch (err) {
    // Kafka may not be available at startup — that is acceptable.
    // The outbox publisher will retry publishing when Kafka becomes available.
    console.warn(
      "Kafka producer connection failed at startup — outbox publisher will retry:",
      err.message
    );
  }

  // 3. Start the outbox publisher (polls OutboxEvent → Kafka)
  startOutboxPublisher();

  // 4. Start HTTP server
  const server = app.listen(env.PORT, () => {
    console.log(`NotifyHub API running on port ${env.PORT}`);
  });

  // 5. Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[${signal}] Shutting down API server...`);
    stopOutboxPublisher();
    await disconnectKafkaProducer().catch(() => {});
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer();