// src/server.js
// API server entry point.
// Startup order: MongoDB → selected event broker → Outbox Publisher → HTTP server
//
// The Outbox Publisher is started here alongside the API server.
// It polls OutboxEvent records and publishes them to the selected broker
// asynchronously, providing reliable at-least-once delivery without blocking
// API requests.

import app from "./app.js";
import { connectMongoDB, disconnectMongoDB } from "./database/mongo.js";
import { env } from "./config/env.js";
import { createEventBroker } from "./infrastructure/event-broker/index.js";
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

  // 2. Initialize the selected event broker publisher.
  const eventBroker = await createEventBroker();
  try {
    await eventBroker.initializePublisher?.();
  } catch (err) {
    // Kafka may not be available at startup — that is acceptable. The outbox
    // publisher will retry publishing when the selected broker is available.
    console.warn(
      `${eventBroker.mode} publisher connection failed at startup — outbox publisher will retry:`,
      err.message
    );
  }

  // 3. Start the outbox publisher (polls OutboxEvent → selected broker)
  startOutboxPublisher(eventBroker);

  // 4. Start HTTP server
  const server = app.listen(env.PORT, () => {
    console.log(`NotifyHub API running on port ${env.PORT}`);
  });

  // 5. Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[${signal}] Shutting down API server...`);

    // Stop accepting new HTTP work before draining background publishers and
    // closing their shared database/broker connections.
    const closeHttpServer = new Promise((resolve) => {
      server.close(() => {
        console.log("HTTP server closed");
        resolve();
      });
    });

    // Force exit if a long-lived request or dependency close prevents a clean
    // shutdown. The normal path below clears this timer first.
    const forceExitTimer = setTimeout(() => process.exit(1), 10_000);

    try {
      await closeHttpServer;
      await stopOutboxPublisher();
      await eventBroker.disconnectPublisher?.().catch(() => {});
      await disconnectRedis().catch(() => {});
      await disconnectMongoDB().catch(() => {});
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      console.error("API shutdown failed:", error.message);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer();
