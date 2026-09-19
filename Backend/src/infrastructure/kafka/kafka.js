import { Kafka, logLevel } from "kafkajs";

import "dotenv/config"

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

const asBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
};

const asPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const sasl = (() => {
  const mechanism = process.env.KAFKA_SASL_MECHANISM?.trim();
  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;

  // Keep SASL optional for local PLAINTEXT Kafka. If production enables it,
  // fail at startup rather than silently falling back to unauthenticated Kafka.
  if (!mechanism && !username && !password) return undefined;
  if (!mechanism || !username || !password) {
    throw new Error(
      "KAFKA_SASL_MECHANISM, KAFKA_SASL_USERNAME, and KAFKA_SASL_PASSWORD must be provided together"
    );
  }

  return { mechanism, username, password };
})();

export const kafka = new Kafka({
  clientId: process.env.KAFKA_PRODUCER_CLIENT_ID || "notifyhub-api",
  brokers,
  ssl: asBoolean(process.env.KAFKA_SSL),
  ...(sasl ? { sasl } : {}),
  connectionTimeout: asPositiveInteger(process.env.KAFKA_CONNECTION_TIMEOUT_MS, 10_000),
  authenticationTimeout: asPositiveInteger(process.env.KAFKA_AUTHENTICATION_TIMEOUT_MS, 10_000),
  requestTimeout: asPositiveInteger(process.env.KAFKA_REQUEST_TIMEOUT_MS, 30_000),
  logLevel: logLevel.INFO,
});
