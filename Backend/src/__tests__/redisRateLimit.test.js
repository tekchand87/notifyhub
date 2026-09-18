import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeRateLimitBuckets } from "../infrastructure/redis/rateLimit.store.js";

// A deterministic shared Redis-EVAL double. It models Redis's single-threaded
// script execution so concurrent callers exercise the application's atomic-call
// boundary without needing a local Redis daemon in unit tests.
const createSharedRedis = () => {
  const values = new Map();
  const calls = [];
  return {
    calls,
    async eval(_script, { keys, arguments: args }) {
      calls.push({ keys, args });
      const now = Date.now();
      const states = keys.map((key, index) => {
        const rate = Number(args[index * 3]);
        const burst = Number(args[index * 3 + 1]);
        const saved = values.get(key) || { tokens: burst, at: now };
        return { key, rate, burst, tokens: Math.min(burst, saved.tokens + Math.max(0, now - saved.at) * rate / 1000), at: now };
      });
      const rejected = states.findIndex((state) => state.tokens < 1);
      if (rejected >= 0) {
        const state = states[rejected];
        return [0, Math.ceil((1 - state.tokens) * 1000 / state.rate), rejected + 1, Math.floor(state.tokens)];
      }
      states.forEach((state) => values.set(state.key, { tokens: state.tokens - 1, at: now }));
      return [1, 0, 0, Math.floor(Math.min(...states.map((state) => state.tokens - 1)))];
    },
  };
};

const bucket = (key = "notifyhub:rate-limit:tenant:hashed") => ({
  type: "tenant", key, ratePerSecond: 1, burst: 50,
});

describe("Redis token bucket store", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows the first requests, rejects excess concurrent requests, and returns retry metadata", async () => {
    const redis = createSharedRedis();
    const results = await Promise.all(Array.from({ length: 100 }, () => consumeRateLimitBuckets([bucket()], { redis })));
    expect(results.filter((result) => result.allowed)).toHaveLength(50);
    expect(results.filter((result) => !result.allowed)).toHaveLength(50);
    expect(results.find((result) => !result.allowed)).toMatchObject({ rejectedBucket: "tenant" });
  });

  it("shares limits across simulated API instances", async () => {
    const sharedRedis = createSharedRedis();
    const fromInstanceA = await Promise.all(Array.from({ length: 30 }, () => consumeRateLimitBuckets([bucket()], { redis: sharedRedis })));
    const fromInstanceB = await Promise.all(Array.from({ length: 30 }, () => consumeRateLimitBuckets([bucket()], { redis: sharedRedis })));
    expect([...fromInstanceA, ...fromInstanceB].filter((result) => result.allowed)).toHaveLength(50);
  });

  it("keeps different tenant keys isolated", async () => {
    const redis = createSharedRedis();
    const a = await Promise.all(Array.from({ length: 50 }, () => consumeRateLimitBuckets([bucket("notifyhub:rate-limit:tenant:a")], { redis })));
    const b = await consumeRateLimitBuckets([bucket("notifyhub:rate-limit:tenant:b")], { redis });
    expect(a.every((result) => result.allowed)).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("sends one atomic EVAL with expiring key parameters and never raw identifiers", async () => {
    const redis = createSharedRedis();
    await consumeRateLimitBuckets([bucket("notifyhub:rate-limit:tenant:4NXkZ..."), { ...bucket("notifyhub:rate-limit:api-key:abc"), type: "api-key" }], { redis });
    expect(redis.calls).toHaveLength(1);
    expect(redis.calls[0].args).toHaveLength(6);
    expect(Number(redis.calls[0].args[2])).toBeGreaterThanOrEqual(1_000);
    expect(redis.calls[0].keys.join("")).not.toContain("raw-api-key");
  });
});
