import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock, SQSClientMock, SendMessageCommandMock, ReceiveMessageCommandMock, DeleteMessageCommandMock } = vi.hoisted(() => {
  const sendMock = vi.fn();
  class SQSClientMock {
    constructor(config) {
      this.config = config;
      SQSClientMock.lastInstance = this;
    }

    send(...args) {
      return sendMock(...args);
    }
  }
  class SendMessageCommandMock { constructor(input) { this.input = input; } }
  class ReceiveMessageCommandMock { constructor(input) { this.input = input; } }
  class DeleteMessageCommandMock { constructor(input) { this.input = input; } }
  return { sendMock, SQSClientMock, SendMessageCommandMock, ReceiveMessageCommandMock, DeleteMessageCommandMock };
});

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: SQSClientMock,
  SendMessageCommand: SendMessageCommandMock,
  ReceiveMessageCommand: ReceiveMessageCommandMock,
  DeleteMessageCommand: DeleteMessageCommandMock,
}));

import {
  createEventBroker,
  resetEventBrokerForTests,
} from "../infrastructure/event-broker/index.js";
import {
  getEventBrokerMode,
  validateEventBrokerConfig,
} from "../infrastructure/event-broker/event-broker.js";
import { getSqsConfig } from "../infrastructure/event-broker/sqsEventBroker.js";

const validEvent = {
  eventId: "507f1f77bcf86cd799439011",
  tenantId: "507f1f77bcf86cd799439012",
  type: "order.created",
  channel: "webhook",
  payload: { orderId: 42 },
  createdAt: "2026-09-20T00:00:00.000Z",
};

const waitFor = async (predicate, timeoutMs = 1_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for test condition");
};

afterEach(() => {
  sendMock.mockReset();
  resetEventBrokerForTests();
});

describe("event broker selection and validation", () => {
  it("defaults to Kafka and accepts only kafka or sqs", () => {
    expect(getEventBrokerMode(undefined)).toBe("kafka");
    expect(getEventBrokerMode("SQS")).toBe("sqs");
    expect(() => getEventBrokerMode("rabbitmq")).toThrow("Invalid EVENT_BROKER");
  });

  it("validates SQS-only configuration", () => {
    expect(() => validateEventBrokerConfig({ EVENT_BROKER: "sqs" })).toThrow("AWS_REGION");
    expect(() => validateEventBrokerConfig({ EVENT_BROKER: "sqs", AWS_REGION: "ap-south-1" })).toThrow("SQS_EVENTS_QUEUE_URL");
    expect(validateEventBrokerConfig({
      EVENT_BROKER: "sqs",
      AWS_REGION: "ap-south-1",
      SQS_EVENTS_QUEUE_URL: "https://sqs.example/events",
    })).toBe("sqs");
    expect(validateEventBrokerConfig({ EVENT_BROKER: "kafka" })).toBe("kafka");
  });

  it("selects the Kafka adapter without changing its implementation", async () => {
    const broker = await createEventBroker({ EVENT_BROKER: "kafka", KAFKA_BROKERS: "localhost:9092" });
    expect(broker.mode).toBe("kafka");
  });

  it("selects the SQS adapter", async () => {
    const broker = await createEventBroker({
      EVENT_BROKER: "sqs",
      AWS_REGION: "ap-south-1",
      SQS_EVENTS_QUEUE_URL: "https://sqs.example/events",
    });
    expect(broker.mode).toBe("sqs");
    expect(SQSClientMock.lastInstance.config).toEqual({ region: "ap-south-1" });
  });
});

describe("SQS event broker", () => {
  const config = {
    EVENT_BROKER: "sqs",
    AWS_REGION: "ap-south-1",
    SQS_EVENTS_QUEUE_URL: "https://sqs.example/events",
    SQS_WAIT_TIME_SECONDS: "20",
    SQS_VISIBILITY_TIMEOUT_SECONDS: "60",
    SQS_MAX_MESSAGES: "7",
  };

  it("normalizes long-polling configuration and bounds max messages", () => {
    expect(getSqsConfig(config)).toMatchObject({
      region: "ap-south-1",
      queueUrl: "https://sqs.example/events",
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
      maxMessages: 7,
    });
  });

  it("publishes the stable event JSON body", async () => {
    sendMock.mockResolvedValueOnce({ MessageId: "message-1" });
    const broker = await createEventBroker(config);

    await broker.publishEvent(validEvent);

    const command = sendMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendMessageCommandMock);
    expect(command.input.QueueUrl).toBe(config.SQS_EVENTS_QUEUE_URL);
    expect(JSON.parse(command.input.MessageBody)).toMatchObject({
      eventId: validEvent.eventId,
      tenantId: validEvent.tenantId,
      type: validEvent.type,
      payload: validEvent.payload,
      attempt: 0,
    });
  });

  it("uses tenant ordering and event deduplication fields for FIFO queues", async () => {
    sendMock.mockResolvedValueOnce({ MessageId: "fifo-message-1" });
    const broker = await createEventBroker({
      ...config,
      SQS_EVENTS_QUEUE_URL: "https://sqs.example/events.fifo",
    });

    await broker.publishEvent(validEvent);

    const command = sendMock.mock.calls[0][0];
    expect(command.input.MessageGroupId).toBe(validEvent.tenantId);
    expect(command.input.MessageDeduplicationId).toBe(validEvent.eventId);
  });

  it("receives with long polling and deletes only after successful processing", async () => {
    const message = {
      MessageId: "message-1",
      ReceiptHandle: "receipt-1",
      Body: JSON.stringify(validEvent),
    };
    let firstReceive = true;
    sendMock.mockImplementation((command, options) => {
      if (command instanceof ReceiveMessageCommandMock) {
        if (firstReceive) {
          firstReceive = false;
          return Promise.resolve({ Messages: [message] });
        }
        return new Promise((resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      if (command instanceof DeleteMessageCommandMock) return Promise.resolve({});
      return Promise.resolve({});
    });

    const broker = await createEventBroker(config);
    const handler = vi.fn().mockResolvedValue(undefined);
    await broker.startConsumer(handler);
    await waitFor(() => sendMock.mock.calls.some(([command]) => command instanceof DeleteMessageCommandMock));
    await broker.stopConsumer();

    const receive = sendMock.mock.calls.find(([command]) => command instanceof ReceiveMessageCommandMock)[0];
    expect(receive.input).toMatchObject({
      QueueUrl: config.SQS_EVENTS_QUEUE_URL,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 60,
      MaxNumberOfMessages: 7,
    });
    expect(handler).toHaveBeenCalledOnce();
    const deleted = sendMock.mock.calls.find(([command]) => command instanceof DeleteMessageCommandMock)[0];
    expect(deleted.input).toEqual({ QueueUrl: config.SQS_EVENTS_QUEUE_URL, ReceiptHandle: "receipt-1" });
  });

  it("leaves a failed message undeleted for visibility-timeout retry", async () => {
    const message = {
      MessageId: "message-failed",
      ReceiptHandle: "receipt-failed",
      Body: JSON.stringify(validEvent),
    };
    let firstReceive = true;
    sendMock.mockImplementation((command, options) => {
      if (command instanceof ReceiveMessageCommandMock) {
        if (firstReceive) {
          firstReceive = false;
          return Promise.resolve({ Messages: [message] });
        }
        return new Promise((resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      return Promise.resolve({});
    });

    const broker = await createEventBroker(config);
    await broker.startConsumer(async () => { throw new Error("delivery failed"); });
    await waitFor(() => sendMock.mock.calls.length >= 2);
    await broker.stopConsumer();

    expect(sendMock.mock.calls.some(([command]) => command instanceof DeleteMessageCommandMock)).toBe(false);
  });
});
