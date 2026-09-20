import { getEventBrokerMode, validateEventBrokerConfig } from "./event-broker.js";

let activeBroker = null;

/**
 * Load only the selected broker adapter. In SQS mode this avoids importing or
 * connecting Kafka infrastructure at all; Kafka remains the default adapter.
 */
export const createEventBroker = async (env = process.env) => {
  const mode = validateEventBrokerConfig(env);
  if (activeBroker?.mode === mode) return activeBroker;

  const module = mode === "sqs"
    ? await import("./sqsEventBroker.js")
    : await import("./kafkaEventBroker.js");

  activeBroker = module.createEventBroker(env);
  return activeBroker;
};

export const getActiveEventBroker = () => activeBroker;

// Used by isolated unit tests when they need to switch broker modes in one process.
export const resetEventBrokerForTests = () => {
  activeBroker = null;
};

export { getEventBrokerMode, validateEventBrokerConfig } from "./event-broker.js";
