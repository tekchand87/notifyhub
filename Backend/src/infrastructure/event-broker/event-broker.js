const SUPPORTED_BROKERS = new Set(["kafka", "sqs"]);

export const getEventBrokerMode = (value = process.env.EVENT_BROKER) => {
  const mode = (value ?? "kafka").trim().toLowerCase();
  if (!SUPPORTED_BROKERS.has(mode)) {
    throw new Error(`Invalid EVENT_BROKER: ${mode}. Expected kafka or sqs`);
  }
  return mode;
};

export const validateEventBrokerConfig = (env = process.env) => {
  const mode = getEventBrokerMode(env.EVENT_BROKER);

  if (mode === "sqs") {
    if (!env.AWS_REGION?.trim()) {
      throw new Error("AWS_REGION is required when EVENT_BROKER=sqs");
    }
    if (!env.SQS_EVENTS_QUEUE_URL?.trim()) {
      throw new Error("SQS_EVENTS_QUEUE_URL is required when EVENT_BROKER=sqs");
    }
  }

  return mode;
};
