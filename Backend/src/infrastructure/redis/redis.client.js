import { createClient } from "redis";

let client;
let connectPromise;
let lastError = null;

const enabled = () => process.env.RATE_LIMIT_ENABLED !== "false";
const redisUrl = () => process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connectTimeout = () => Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 1_000;

const buildClient = () => {
  const nextClient = createClient({
    url: redisUrl(),
    disableOfflineQueue: true,
    socket: {
      connectTimeout: connectTimeout(),
      reconnectStrategy: (retries) => Math.min(50 * (2 ** retries), 2_000),
    },
  });
  nextClient.on("error", (error) => { lastError = error; });
  return nextClient;
};

export const isRedisRateLimitingEnabled = enabled;

export const getRedisClient = () => {
  if (!client) client = buildClient();
  return client;
};

// Called once during startup. Request middleware never opens a connection itself.
export const connectRedis = async () => {
  if (!enabled()) return { status: "disabled" };
  const redis = getRedisClient();
  if (redis.isReady) return { status: "healthy" };
  if (!connectPromise) {
    connectPromise = redis.connect()
      .then(() => ({ status: "healthy" }))
      .catch((error) => {
        lastError = error;
        throw error;
      })
      .finally(() => { connectPromise = null; });
  }
  return connectPromise;
};

export const disconnectRedis = async () => {
  if (!client?.isOpen) return;
  await client.quit().catch(async () => client.disconnect());
};

export const checkRedisHealth = async () => {
  if (!enabled()) return { status: "disabled" };
  if (!client?.isReady) {
    return { status: "unhealthy", error: "Redis is not connected" };
  }
  const startedAt = Date.now();
  try {
    await client.ping();
    return { status: "healthy", latencyMs: Date.now() - startedAt };
  } catch (error) {
    lastError = error;
    return { status: "unhealthy", error: "Redis health check failed" };
  }
};
