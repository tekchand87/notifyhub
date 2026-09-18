# NotifyHub k6 performance test

Each stage is a fixed **60-second** arrival-rate test: 100, 250, 500, 750, 1,000, and 1,250 accepted-event attempts per second. It reports API ingestion independently from outbox, Kafka, worker, and delivery progress.

## Prerequisites

- `k6` installed and on `PATH`.
- API, outbox publisher, Kafka, MongoDB, and notification worker already running.
- A dedicated active API key with `events:write`, supplied as `K6_API_KEY`.
- The target environment must authorize these rates. The checked-in app limit is 60 requests/minute per key and 100/minute per IP, so it will otherwise report 429s rather than service capacity. Do not disable production abuse controls; use a staging-only distributed load-test policy or explicitly approved test-key exemption.

## Run

From `Backend/`:

```bash
export K6_API_KEY='...'
export K6_BASE_URL='http://localhost:3000'
for rate in 100 250 500 750 1000 1250; do
  scripts/run-k6-stage.sh "$rate"
done
```

Each run writes k6, telemetry, and merged stage JSON under `load-test-results/`. The telemetry collector samples MongoDB `ping` latency, outbox pending count, Kafka high-watermark throughput and consumer lag, terminal worker throughput, and delivered-event throughput. `deliveryThroughputPerSecond` is deliberately separate from API requests/sec.

To compare any two collected stages (for example, an archived pre-optimization stage and its same-rate optimized replacement):

```bash
node src/scripts/generate-final-performance-report.js \
  baseline-report.json optimized-report.json load-test-results/final-report.md
```

## Final report

Use the generated stage JSONs to populate the report table below. Do not call ingestion rate email or webhook delivery rate unless the delivery metric shows it.

| Target | API RPS | Successful / failed | p50/p90/p95/p99 ms | Mongo p50/p95 ms | Outbox end backlog | Kafka msg/s | Kafka max/end lag | Worker msg/s | Delivered msg/s |
|---:|---:|---:|---|---|---:|---:|---:|---:|---:|
| 100 | | | | | | | | | |
| 250 | | | | | | | | | |
| 500 | | | | | | | | | |
| 750 | | | | | | | | | |
| 1,000 | | | | | | | | | |
| 1,250 | | | | | | | | | |
