export const EVENT_CHANNELS = {
  EMAIL : "email",
  WEBHOOK  : "webhook"
};

export const EVENT_STATUS = {
  QUEUED : "queued",
  PROCESSING : "processing",
  DELIVERED : "delivered",
  FAILED : "failed",
  DLQ : "dlq"
};

export const EVENT_CHANNELS_VALUES = Object.values(EVENT_CHANNELS);
export const EVENT_STATUS_VALUES = Object.values(EVENT_STATUS);

export const EVENT_WRITE_SCOPE = "events:write"
