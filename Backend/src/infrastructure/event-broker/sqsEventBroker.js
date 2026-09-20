import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { parseSqsEvent } from "../../modules/worker/worker.parser.js";
import { getWorkerConcurrency, mapWithConcurrency } from "../../modules/worker/worker.concurrency.js";
import { logError, logInfo, logWarn } from "../../modules/worker/worker.logger.js";

const positiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? Math.min(parsed, maximum)
    : fallback;
};

export const getSqsConfig = (env = process.env) => {
  if (!env.AWS_REGION?.trim()) {
    throw new Error("AWS_REGION is required when EVENT_BROKER=sqs");
  }
  if (!env.SQS_EVENTS_QUEUE_URL?.trim()) {
    throw new Error("SQS_EVENTS_QUEUE_URL is required when EVENT_BROKER=sqs");
  }

  return {
    region: env.AWS_REGION.trim(),
    queueUrl: env.SQS_EVENTS_QUEUE_URL.trim(),
    dlqQueueUrl: env.SQS_DLQ_QUEUE_URL?.trim() || null,
    waitTimeSeconds: positiveInteger(env.SQS_WAIT_TIME_SECONDS, 20, 20),
    visibilityTimeoutSeconds: positiveInteger(env.SQS_VISIBILITY_TIMEOUT_SECONDS, 60, 43_200),
    maxMessages: Math.max(1, positiveInteger(env.SQS_MAX_MESSAGES, 10, 10)),
  };
};

export const createEventBroker = (env = process.env) => {
  const config = getSqsConfig(env);
  const client = new SQSClient({ region: config.region });
  const isFifoQueue = config.queueUrl.split("?")[0].endsWith(".fifo");
  let running = false;
  let pollPromise = null;
  let receiveAbortController = null;

  const processMessage = async (message, handler) => {
    let event = null;
    try {
      event = parseSqsEvent(message);
      await handler({
        broker: "sqs",
        event,
        message,
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
      });

      await client.send(new DeleteMessageCommand({
        QueueUrl: config.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }));

      logInfo("SQS message processed", {
        queue: config.queueUrl,
        messageId: message.MessageId,
        eventId: event.eventId,
        tenantId: event.tenantId,
        result: "deleted",
      });
    } catch (error) {
      // Deliberately do not delete failed messages. Visibility timeout and the
      // queue redrive policy provide SQS-level retry/DLQ behavior.
      logWarn("SQS message processing failed; leaving message for retry", {
        queue: config.queueUrl,
        messageId: message.MessageId,
        eventId: event?.eventId ?? null,
        tenantId: event?.tenantId ?? null,
        result: "retry",
        retry: "visibility_timeout",
        error: error.message,
      });
    }
  };

  const poll = async (handler) => {
    while (running) {
      receiveAbortController = new AbortController();
      try {
        const response = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: config.queueUrl,
            WaitTimeSeconds: config.waitTimeSeconds,
            VisibilityTimeout: config.visibilityTimeoutSeconds,
            MaxNumberOfMessages: config.maxMessages,
            MessageSystemAttributeNames: ["ApproximateReceiveCount"],
          }),
          { abortSignal: receiveAbortController.signal }
        );

        const messages = response.Messages || [];
        // Standard queues can use bounded parallelism. Keep FIFO batches
        // serial so tenant/message-group ordering is not violated by the
        // worker even when WORKER_CONCURRENCY is greater than one.
        const messageConcurrency = isFifoQueue ? 1 : getWorkerConcurrency();
        await mapWithConcurrency(messages, messageConcurrency, (message) => processMessage(message, handler));
      } catch (error) {
        if (running) {
          logError("SQS receive failed", {
            queue: config.queueUrl,
            error: error.message,
          });
        }
      } finally {
        receiveAbortController = null;
      }
    }
  };

  return {
    mode: "sqs",
    config,

    async initializePublisher() {
      logInfo("event broker initialized", { broker: "sqs" });
    },

    async publishEvent(events, options = {}) {
      const records = Array.isArray(events) ? events : [events];
      const concurrency = Math.max(1, Number(options.concurrency) || 1);
      const results = [];
      await mapWithConcurrency(records, concurrency, async (event, index) => {
        const messageInput = {
          QueueUrl: config.queueUrl,
          MessageBody: JSON.stringify({
            eventId: String(event._id ?? event.eventId),
            tenantId: String(event.tenantId),
            type: event.type,
            channel: event.channel,
            payload: event.payload,
            createdAt: event.createdAt,
            attempt: event.attempt ?? 0,
          }),
        };
        if (isFifoQueue) {
          // Match Kafka's tenant-key partitioning when an AWS FIFO queue is
          // selected: each tenant is an ordered message group and eventId is
          // the stable deduplication identity.
          messageInput.MessageGroupId = String(event.tenantId);
          messageInput.MessageDeduplicationId = String(event._id ?? event.eventId);
        }
        results[index] = await client.send(new SendMessageCommand(messageInput));
      });
      return results;
    },

    async initializeWorker() {
      logInfo("event broker initialized", { broker: "sqs" });
    },

    async startConsumer(handler) {
      if (running) return;
      running = true;
      pollPromise = poll(handler);
      pollPromise.catch((error) => {
        if (running) logError("SQS consumer stopped unexpectedly", error);
      });
    },

    async stopConsumer() {
      running = false;
      receiveAbortController?.abort();
      if (pollPromise) await pollPromise.catch(() => {});
      pollPromise = null;
    },

    async disconnectWorker() {},
    async disconnectPublisher() {},
    async publishDlq() {
      return { ok: false, error: "SQS redrive policy owns queue-level DLQ delivery" };
    },
  };
};
