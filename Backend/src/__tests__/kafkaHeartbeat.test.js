import { afterEach, describe, expect, it, vi } from "vitest";
import { consumer } from "../infrastructure/kafka/kafka.consumer.js";
import {
  createEventBroker,
  resetEventBrokerForTests,
} from "../infrastructure/event-broker/index.js";

const context = (heartbeat) => ({
  topic: "notifyhub.events",
  partition: 0,
  message: { offset: "0", value: Buffer.from("{}") },
  heartbeat,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const setupConsumerRun = () => {
  let eachMessage;
  const run = vi.spyOn(consumer, "run").mockImplementation(async (options) => {
    eachMessage = options.eachMessage;
  });
  const stop = vi.spyOn(consumer, "stop").mockResolvedValue(undefined);
  return {
    run,
    stop,
    getEachMessage: () => eachMessage,
  };
};

const createKafkaBroker = () => createEventBroker({
  EVENT_BROKER: "kafka",
  KAFKA_BROKERS: "localhost:9092",
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetEventBrokerForTests();
});

describe("Kafka application heartbeat", () => {
  it("heartbeats during long-running processing and stops after success", async () => {
    vi.useFakeTimers();
    const { run } = setupConsumerRun();
    const broker = await createKafkaBroker();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const processing = deferred();
    const handler = vi.fn(() => processing.promise);

    await broker.startConsumer(handler);
    const eachMessage = run.mock.calls[0][0].eachMessage;
    const message = eachMessage(context(heartbeat));

    await vi.advanceTimersByTimeAsync(2_000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ broker: "kafka", heartbeat }));

    processing.resolve();
    await message;
    const callsAfterCompletion = heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(heartbeat).toHaveBeenCalledTimes(callsAfterCompletion);
  });

  it("stops heartbeating after failed processing", async () => {
    vi.useFakeTimers();
    const { run } = setupConsumerRun();
    const broker = await createKafkaBroker();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockRejectedValue(new Error("delivery failed"));

    await broker.startConsumer(handler);
    const eachMessage = run.mock.calls[0][0].eachMessage;
    await expect(eachMessage(context(heartbeat))).rejects.toThrow("delivery failed");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it("handles heartbeat errors without failing message processing", async () => {
    vi.useFakeTimers();
    const { run } = setupConsumerRun();
    const broker = await createKafkaBroker();
    const heartbeat = vi.fn().mockRejectedValue(new Error("broker temporarily unavailable"));
    const processing = deferred();
    const handler = vi.fn(() => processing.promise);

    await broker.startConsumer(handler);
    const eachMessage = run.mock.calls[0][0].eachMessage;
    const message = eachMessage(context(heartbeat));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(heartbeat).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();

    processing.resolve();
    await expect(message).resolves.toBeUndefined();
  });

  it("clears heartbeat timers during graceful consumer shutdown", async () => {
    vi.useFakeTimers();
    const { run, stop } = setupConsumerRun();
    const broker = await createKafkaBroker();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const processing = deferred();
    const handler = vi.fn(() => processing.promise);

    await broker.startConsumer(handler);
    const eachMessage = run.mock.calls[0][0].eachMessage;
    const message = eachMessage(context(heartbeat));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(heartbeat).toHaveBeenCalledOnce();

    await broker.stopConsumer();
    const callsAtShutdown = heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(heartbeat).toHaveBeenCalledTimes(callsAtShutdown);
    expect(stop).toHaveBeenCalledOnce();

    processing.resolve();
    await message;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps short processing unchanged and starts one consumer lifecycle", async () => {
    vi.useFakeTimers();
    const { run } = setupConsumerRun();
    const broker = await createKafkaBroker();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue(undefined);

    await broker.startConsumer(handler);
    const eachMessage = run.mock.calls[0][0].eachMessage;
    await eachMessage(context(heartbeat));

    expect(handler).toHaveBeenCalledOnce();
    expect(heartbeat).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledOnce();
  });
});
