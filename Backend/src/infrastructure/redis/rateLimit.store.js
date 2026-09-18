import { getRedisClient } from "./redis.client.js";

// One Redis Lua operation computes all buckets before decrementing any. This
// prevents an API-key/tenant/global partial-consumption race across API nodes.
const TOKEN_BUCKET_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local bucketCount = #KEYS
local available = {}
for i = 1, bucketCount do
  local rate = tonumber(ARGV[(i - 1) * 3 + 1])
  local capacity = tonumber(ARGV[(i - 1) * 3 + 2])
  local ttl = tonumber(ARGV[(i - 1) * 3 + 3])
  local saved = redis.call('GET', KEYS[i])
  local tokens = capacity
  local previous = now
  if saved then
    local separator = string.find(saved, ':')
    if separator then
      tokens = tonumber(string.sub(saved, 1, separator - 1)) or capacity
      previous = tonumber(string.sub(saved, separator + 1)) or now
    end
  end
  tokens = math.min(capacity, tokens + math.max(0, now - previous) * rate / 1000)
  available[i] = tokens
  if tokens < 1 then
    local retry = math.max(1, math.ceil((1 - tokens) * 1000 / rate))
    return { 0, retry, i, math.floor(tokens) }
  end
end
for i = 1, bucketCount do
  local ttl = tonumber(ARGV[(i - 1) * 3 + 3])
  redis.call('SET', KEYS[i], string.format('%.6f:%d', available[i] - 1, now), 'PX', ttl)
end
local minimum = available[1] - 1
for i = 2, bucketCount do minimum = math.min(minimum, available[i] - 1) end
return { 1, 0, 0, math.floor(minimum) }
`;

const ttlFor = ({ ratePerSecond, burst }) => Math.max(1_000, Math.ceil((burst / ratePerSecond) * 2_000));

/**
 * Consume one token from all buckets as one atomic Redis operation.
 * Buckets are trusted server-generated keys and never contain credentials.
 */
export const consumeRateLimitBuckets = async (buckets, { redis = getRedisClient() } = {}) => {
  const keys = buckets.map((bucket) => bucket.key);
  const args = buckets.flatMap((bucket) => [
    String(bucket.ratePerSecond), String(bucket.burst), String(ttlFor(bucket)),
  ]);
  const result = await redis.eval(TOKEN_BUCKET_SCRIPT, { keys, arguments: args });
  const [allowed, retryAfterMs, rejectedIndex, remaining] = result.map(Number);
  return {
    allowed: allowed === 1,
    retryAfterMs,
    rejectedBucket: allowed === 1 ? null : buckets[rejectedIndex - 1]?.type,
    limit: allowed === 1 ? null : buckets[rejectedIndex - 1]?.burst,
    remaining: Math.max(0, remaining),
  };
};

export { TOKEN_BUCKET_SCRIPT };
