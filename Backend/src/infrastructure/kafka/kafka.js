import { Kafka, logLevel } from "kafkajs";

import "dotenv/config";

/**
 * Parse the Kafka bootstrap list without exposing or transforming credentials.
 * KafkaJS accepts multiple endpoints, which is required for a resilient MSK
 * deployment. A blank value is rejected early rather than failing later with
 * an opaque broker-connection error.
 */
export const parseKafkaBrokers = (value = process.env.KAFKA_BROKERS) => {
  const configured = value === undefined ? "localhost:9092" : value;
  const brokers = configured
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS must contain at least one broker endpoint");
  }

  return brokers;
};

const asBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
};

const asPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildKafkaSasl = ({
  mechanism,
  username,
  password,
} = process.env) => {
  const normalizedMechanism = mechanism?.trim().toLowerCase();

  // Keep SASL optional for local PLAINTEXT Kafka. If production enables it,
  // fail at startup rather than silently falling back to unauthenticated Kafka.
  if (!normalizedMechanism && !username && !password) return undefined;
  if (!normalizedMechanism || !username || !password) {
    throw new Error(
      "KAFKA_SASL_MECHANISM, KAFKA_SASL_USERNAME, and KAFKA_SASL_PASSWORD must be provided together"
    );
  }

  return { mechanism: normalizedMechanism, username, password };
};

/**
 * Build the KafkaJS client options from deployment-provided environment.
 * TLS and SASL are opt-in so the local Docker PLAINTEXT broker remains the
 * default, while MSK TLS/SCRAM can be enabled without source changes.
 */
export const buildKafkaConfig = (env = process.env) => {
  const sasl = buildKafkaSasl({
    mechanism: env.KAFKA_SASL_MECHANISM,
    username: env.KAFKA_SASL_USERNAME,
    password: env.KAFKA_SASL_PASSWORD,
  });

  return {
    clientId: env.KAFKA_PRODUCER_CLIENT_ID || "notifyhub-api",
    brokers: parseKafkaBrokers(env.KAFKA_BROKERS),
    ssl: asBoolean(env.KAFKA_SSL),
    ...(sasl ? { sasl } : {}),
    connectionTimeout: asPositiveInteger(env.KAFKA_CONNECTION_TIMEOUT_MS, 10_000),
    authenticationTimeout: asPositiveInteger(env.KAFKA_AUTHENTICATION_TIMEOUT_MS, 10_000),
    requestTimeout: asPositiveInteger(env.KAFKA_REQUEST_TIMEOUT_MS, 30_000),
    logLevel: logLevel.INFO,
  };
};

export const kafka = new Kafka(buildKafkaConfig());
