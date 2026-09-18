import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const failures = new Rate("failed_requests");
const baseUrl = __ENV.K6_BASE_URL || "http://localhost:3000";
const apiKey = __ENV.K6_API_KEY;
const rate = Number(__ENV.K6_RATE || 100);

if (!apiKey) {
  throw new Error("K6_API_KEY is required");
}

export const options = {
  scenarios: {
    ingest: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: Math.max(50, Math.ceil(rate / 4)),
      maxVUs: Math.max(200, rate * 2),
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    failed_requests: ["rate<0.01"],
  },
};

export default function () {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(
    `${baseUrl}/api/v1/events`,
    JSON.stringify({
      type: "loadtest.event",
      channel: "webhook",
      payload: { sequence, generatedAt: new Date().toISOString() },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "Idempotency-Key": `k6-${sequence}`,
      },
      tags: { endpoint: "event-ingestion" },
    }
  );

  const accepted = check(response, {
    "accepted (202)": (result) => result.status === 202,
  });
  failures.add(!accepted);
}

export function handleSummary(data) {
  return {
    [__ENV.K6_SUMMARY_FILE || "load-test-results/k6-summary.json"]: JSON.stringify(data, null, 2),
  };
}
