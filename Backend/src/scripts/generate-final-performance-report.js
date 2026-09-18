// Usage: node src/scripts/generate-final-performance-report.js <baseline.json> <optimized.json> <out.md>
import fs from "node:fs/promises";

const [baselineFile, optimizedFile, outputFile] = process.argv.slice(2);
if (!baselineFile || !optimizedFile || !outputFile) {
  throw new Error("Usage: <baseline.json> <optimized.json> <out.md>");
}
const [baseline, optimized] = await Promise.all([fs.readFile(baselineFile, "utf8").then(JSON.parse), fs.readFile(optimizedFile, "utf8").then(JSON.parse)]);
const value = (report, path) => path.split(".").reduce((current, key) => current?.[key], report);
const improvement = (before, after) => Number.isFinite(before) && before !== 0 && Number.isFinite(after)
  ? `${(((after - before) / before) * 100).toFixed(1)}%`
  : "n/a";
const metrics = [
  ["API ingestion RPS", "apiIngestion.requestsPerSecond"],
  ["Kafka throughput/sec", "pipeline.kafkaThroughputPerSecond"],
  ["Worker throughput/sec", "pipeline.workerThroughputPerSecond"],
  ["Delivery throughput/sec", "pipeline.deliveryThroughputPerSecond"],
];
const rows = metrics.map(([name, path]) => {
  const before = value(baseline, path);
  const after = value(optimized, path);
  return `| ${name} | ${before ?? "n/a"} | ${after ?? "n/a"} | ${improvement(before, after)} |`;
}).join("\n");
const remaining = [
  optimized.pipeline.outboxBacklog.end > optimized.pipeline.outboxBacklog.start && "Outbox backlog grew during the stage.",
  optimized.pipeline.kafkaConsumerLag.end > 0 && "Kafka consumer lag remained after the stage.",
  optimized.apiIngestion.failedRequests > 0 && "API rejected or failed requests; inspect HTTP status distribution and configured quotas.",
].filter(Boolean).join("\n") || "No automated saturation condition was detected; inspect provider errors and p99 latency before increasing rate.";
const report = `# NotifyHub performance report\n\n- Baseline target: ${baseline.targetEventsPerSecond} events/sec\n- Optimized target: ${optimized.targetEventsPerSecond} events/sec\n\n| Metric | Baseline | Optimized | Improvement |\n|---|---:|---:|---:|\n${rows}\n\n## Remaining bottlenecks\n\n${remaining}\n\n## Recommended configuration\n\nUse the highest stage with zero failed requests, a stable or falling outbox backlog, final Kafka lag of zero, and delivery throughput adequate for the workload. API ingestion RPS is not delivery RPS; size workers and external-provider quotas from \`deliveryThroughputPerSecond\`.\n`;
await fs.writeFile(outputFile, report);
