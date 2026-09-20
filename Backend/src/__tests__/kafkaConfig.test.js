import { describe, expect, it } from "vitest";
import {
  buildKafkaConfig,
  buildKafkaSasl,
  parseKafkaBrokers,
} from "../infrastructure/kafka/kafka.js";

describe("Kafka client configuration", () => {
  it("accepts a comma-separated bootstrap list for multi-broker deployments", () => {
    expect(parseKafkaBrokers("broker-a:9098, broker-b:9098,broker-c:9098")).toEqual([
      "broker-a:9098",
      "broker-b:9098",
      "broker-c:9098",
    ]);
  });

  it("rejects an empty bootstrap list", () => {
    expect(() => parseKafkaBrokers(" , ")).toThrow(
      "KAFKA_BROKERS must contain at least one broker endpoint"
    );
  });

  it("keeps SASL optional for local Docker PLAINTEXT Kafka", () => {
    expect(buildKafkaSasl({})).toBeUndefined();
  });

  it("requires complete SASL settings instead of silently disabling authentication", () => {
    expect(() => buildKafkaSasl({ mechanism: "scram-sha-512", username: "user" })).toThrow(
      "KAFKA_SASL_MECHANISM, KAFKA_SASL_USERNAME, and KAFKA_SASL_PASSWORD must be provided together"
    );
  });

  it("builds TLS/SCRAM options from environment-provided MSK settings", () => {
    const config = buildKafkaConfig({
      KAFKA_BROKERS: "b-1.example:9098,b-2.example:9098",
      KAFKA_PRODUCER_CLIENT_ID: "notifyhub-api",
      KAFKA_SSL: "true",
      KAFKA_SASL_MECHANISM: "SCRAM-SHA-512",
      KAFKA_SASL_USERNAME: "managed-user",
      KAFKA_SASL_PASSWORD: "managed-password",
    });

    expect(config.brokers).toEqual(["b-1.example:9098", "b-2.example:9098"]);
    expect(config.ssl).toBe(true);
    expect(config.sasl).toEqual({
      mechanism: "scram-sha-512",
      username: "managed-user",
      password: "managed-password",
    });
  });

  it("does not add SASL credentials when they are not configured", () => {
    const config = buildKafkaConfig({
      KAFKA_BROKERS: "kafka:29092",
      KAFKA_SSL: "false",
    });

    expect(config.brokers).toEqual(["kafka:29092"]);
    expect(config.ssl).toBe(false);
    expect(config).not.toHaveProperty("sasl");
  });
});
