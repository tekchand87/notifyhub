import "dotenv/config";
import mongoose from "mongoose";

import {
  connectKafkaConsumer,
  subscribeKafkaConsumer,
  disconnectedKafkaConsumer
} from "../infrastructure/kafka/kafka.consumer.js";

import { startWorker } from "../modules/worker/worker.service.js";

const mongoUri = process.env.MONGODB_URI;

let shuttingDown = false;

// MongoDB connection
const connectMongo = async () => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(mongoUri);

  console.log("Worker MongoDB Connected");
};

// Graceful shutdown
const shutdown = async (signal) => {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down...`);

  try {
    await disconnectedKafkaConsumer();

    await mongoose.disconnect();

    console.log("Worker shutdown complete");

    process.exit(0);
  } catch (error) {
    console.error("Worker shutdown failed", error);

    process.exit(1);
  }
};

// Listen for termination signals
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));

// Worker startup
const boot = async () => {
  await connectMongo();

  await connectKafkaConsumer();

  await subscribeKafkaConsumer();

  await startWorker();
};

// Start worker
boot().catch(async (error) => {
  console.error("Worker startup failed", error);

  await mongoose
    .disconnect()
    .catch(() => {});

  process.exit(1);
});