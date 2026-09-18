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
import { connectRedis, disconnectRedis } from "./infrastructure/redis/redis.client.js";

const startServer = async () => {
  // 1. Connect to MongoDB (required before anything else)
  await connectMongoDB();

  // Redis is shared by every API process for distributed rate limiting. A
  // connection failure does not crash startup; request behavior follows the
  // explicit RATE_LIMIT_FAILURE_MODE policy.
  await connectRedis().then(
    () => console.log("Redis rate-limit client connected"),
    () => console.warn("Redis rate-limit client unavailable at startup")
  );

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
    await stopOutboxPublisher();
    await disconnectKafkaProducer().catch(() => {});
    await disconnectRedis().catch(() => {});
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
