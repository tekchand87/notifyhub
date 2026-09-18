import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { KafkaPoisonMessageError, parseKafkaEvent } from "../modules/worker/worker.parser.js";
import { PoisonMessage } from "../modules/worker/poison.message.model.js";
import { persistPoisonMessage } from "../modules/worker/poison.message.service.js";

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
}, 15_000);

beforeEach(async () => {
  await PoisonMessage.deleteMany({});
  vi.restoreAllMocks();
});

describe("Kafka poison-message durability", () => {
  it("classifies malformed Kafka values as poison messages", () => {
    expect(() => parseKafkaEvent({ value: Buffer.from("not-json") }))
      .toThrow(KafkaPoisonMessageError);
  });

  it("persists an idempotent failure record before a poison offset can be acknowledged", async () => {
    const message = {
      value: Buffer.from('{"eventId":"not-an-object-id","tenantId":"tenant-a"}'),
      offset: "42",
      headers: { source: Buffer.from("test") },
    };
    const error = new KafkaPoisonMessageError("eventId must be a valid MongoDB ObjectId");

    const first = await persistPoisonMessage({ topic: "events", partition: 2, message, error });
    const second = await persistPoisonMessage({ topic: "events", partition: 2, message, error });

    expect(String(first._id)).toBe(String(second._id));
    expect(await PoisonMessage.countDocuments()).toBe(1);
    expect(first).toMatchObject({
      topic: "events",
      partition: 2,
      offset: "42",
      eventId: "not-an-object-id",
      tenantId: "tenant-a",
      payloadBytes: message.value.length,
    });
    expect(first.payloadSha256).toHaveLength(64);
    expect(first.headerNames).toEqual(["source"]);
  });

  it("propagates Mongo persistence failures instead of establishing a false poison outcome", async () => {
    vi.spyOn(PoisonMessage, "findOneAndUpdate").mockImplementation(() => {
      throw new Error("MongoDB unavailable");
    });

    await expect(persistPoisonMessage({
      topic: "events",
      partition: 0,
      message: { value: Buffer.from("bad"), offset: "7" },
      error: new KafkaPoisonMessageError("Kafka message contains invalid JSON"),
    })).rejects.toThrow("MongoDB unavailable");
  });
});
