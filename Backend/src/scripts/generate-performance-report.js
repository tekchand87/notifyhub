// Usage: node src/scripts/generate-performance-report.js <rate> <k6> <telemetry> <out>
import fs from "node:fs/promises";

const [rate, k6File, telemetryFile, outFile] = process.argv.slice(2);
if (!rate || !k6File || !telemetryFile || !outFile) throw new Error("Usage: <rate> <k6> <telemetry> <out>");
const [k6, telemetry] = await Promise.all([fs.readFile(k6File, "utf8").then(JSON.parse), fs.readFile(telemetryFile, "utf8").then(JSON.parse)]);
const metric = (name) => k6.metrics[name]?.values ?? {};
const report = {
  targetEventsPerSecond: Number(rate),
  apiIngestion: {
    requestsPerSecond: metric("http_reqs").rate,
    successfulRequests: metric("checks").passes,
    failedRequests: metric("checks").fails,
    latencyMs: { p50: metric("http_req_duration")["p(50)"], p90: metric("http_req_duration")["p(90)"], p95: metric("http_req_duration")["p(95)"], p99: metric("http_req_duration")["p(99)"] },
  },
  pipeline: telemetry,
};
await fs.writeFile(outFile, JSON.stringify(report, null, 2));
