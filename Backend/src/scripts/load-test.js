// Load test: measures NotifyHub API ingestion throughput (events/sec)
// Usage: node src/scripts/load-test.js [total] [concurrency]
// Example: node src/scripts/load-test.js 200 20
import "dotenv/config";
import mongoose from "mongoose";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { apiKey as ApiKeyModel } from "../modules/apiKey/apiKey.models.js";
import { Tenant } from "../modules/tenant/tenant.model.js";

const TOTAL       = parseInt(process.argv[2] || "100");  // total events
const CONCURRENCY = parseInt(process.argv[3] || "20");   // parallel requests
const API_BASE    = `http://localhost:${process.env.PORT || 3000}`;

// ── helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run fn() with max `concurrency` in parallel, returning all results
const pMap = async (items, fn, concurrency) => {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
};

// ── main ─────────────────────────────────────────────────────────────────────

const run = async () => {
  // 1. Create temp API key
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ status: "active" }).lean();
  if (!tenant) { console.error("No tenant"); process.exit(1); }

  const { rawApiKey, keyPrefix } = generateApiKey();
  await ApiKeyModel.create({
    tenantId: tenant._id, name: "load-test-key",
    keyPrefix, keyHash: hashApiKey(rawApiKey),
    scopes: ["events:write"], expiresAt: null,
  });
  await mongoose.disconnect();
  console.log(`\n🔑 API key: ${keyPrefix}…`);
  console.log(`📊 Load test: ${TOTAL} events, concurrency ${CONCURRENCY}\n`);

  // 2. Build event list with unique idempotency keys
  const events = Array.from({ length: TOTAL }, (_, i) => ({
    body: JSON.stringify({
      type: "load.test",
      channel: "webhook",
      payload: { seq: i, ts: Date.now() },
    }),
    idempotencyKey: `load-test-${Date.now()}-${i}`,
  }));

  // 3. Fire requests
  const stats = { ok: 0, err: 0, latencies: [] };
  const globalStart = performance.now();

  await pMap(events, async ({ body, idempotencyKey }) => {
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/api/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": rawApiKey,
          "Idempotency-Key": idempotencyKey,
        },
        body,
      });
      const latency = performance.now() - t0;
      stats.latencies.push(latency);
      if (res.ok) stats.ok++;
      else { stats.err++; console.error(`  ❌ ${res.status}`); }
    } catch (e) {
      stats.err++;
      console.error(`  ❌ fetch error: ${e.message}`);
    }
  }, CONCURRENCY);

  const totalMs = performance.now() - globalStart;
  const rps = (stats.ok / (totalMs / 1000)).toFixed(1);

  // 4. Compute percentiles
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p = (pct) => sorted[Math.floor(sorted.length * pct / 100)] ?? 0;

  console.log("═".repeat(50));
  console.log(`  RESULTS — NotifyHub API Ingestion Throughput`);
  console.log("═".repeat(50));
  console.log(`  Total events sent : ${TOTAL}`);
  console.log(`  Concurrency       : ${CONCURRENCY}`);
  console.log(`  ✅ Accepted        : ${stats.ok}`);
  console.log(`  ❌ Errors          : ${stats.err}`);
  console.log(`  Total time        : ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`  Throughput        : ${rps} events/sec`);
  console.log("─".repeat(50));
  console.log(`  Latency (per request):`);
  console.log(`    p50  : ${p(50).toFixed(0)}ms`);
  console.log(`    p90  : ${p(90).toFixed(0)}ms`);
  console.log(`    p99  : ${p(99).toFixed(0)}ms`);
  console.log(`    min  : ${sorted[0].toFixed(0)}ms`);
  console.log(`    max  : ${sorted[sorted.length - 1].toFixed(0)}ms`);
  console.log("═".repeat(50));
  console.log(`\n  NOTE: These ${stats.ok} events are now queued in MongoDB.`);
  console.log(`  Worker will deliver them asynchronously.\n`);
};

run().catch((e) => { console.error(e.message); process.exit(1); });
