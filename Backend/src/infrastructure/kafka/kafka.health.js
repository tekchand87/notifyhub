// src/infrastructure/kafka/kafka.health.js
// Real Kafka broker connectivity health check.
//
// Design:
//   - Creates a short-lived admin client, connects, fetches topic metadata, disconnects
//   - A 5-second timeout prevents hanging if Kafka is unreachable
//   - Results are cached for 30 seconds to avoid hammering the broker on every /health call
//   - Returns { status, broker, latencyMs } — NEVER exposes credentials

import { kafka } from "./kafka.js";
import "dotenv/config";

// ─── Cache ────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5_000;    // Cache result for 5 seconds (Bug #9: was 30s — too stale)
const PROBE_TIMEOUT_MS = 5_000; // Hard timeout on the broker probe

let cachedResult = null;
let cachedAt = 0;

// ─── Health probe ─────────────────────────────────────────────────────────────

/**
 * Performs a real Kafka broker connectivity probe.
 *
 * @returns {Promise<{
 *   status: "healthy"|"unhealthy",
 *   broker: string,
 *   latencyMs: number,
 *   error?: string,
 * }>}
 */
const probe = async () => {
  const broker = (process.env.KAFKA_BROKERS || "localhost:9092").split(",")[0].trim();
  const startMs = Date.now();

  // Create a dedicated short-lived admin client for health checks
  const admin = kafka.admin();

  // Race the probe against a timeout
  const probePromise = (async () => {
    await admin.connect();
    // listTopics verifies we can actually talk to the broker
    await admin.listTopics();
    await admin.disconnect();
  })();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Kafka health check timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS)
  );

  try {
    await Promise.race([probePromise, timeoutPromise]);

    return {
      status: "healthy",
      broker,
      latencyMs: Date.now() - startMs,
    };
  } catch (err) {
    // Best-effort disconnect — ignore errors during cleanup
    await admin.disconnect().catch(() => {});

    return {
      status: "unhealthy",
      broker,
      latencyMs: Date.now() - startMs,
      error: err.message,
    };
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the Kafka health status.
 * Uses a 30-second cache so monitoring calls don't hammer the broker.
 *
 * @param {boolean} [forceRefresh=false] - Bypass cache and run a fresh probe
 */
export const checkKafkaHealth = async (forceRefresh = false) => {
  const now = Date.now();

  if (!forceRefresh && cachedResult && (now - cachedAt) < CACHE_TTL_MS) {
    return { ...cachedResult, cached: true };
  }

  const result = await probe();
  cachedResult = result;
  cachedAt = now;

  return { ...result, cached: false };
};
