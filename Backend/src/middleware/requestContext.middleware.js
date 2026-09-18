import crypto from "crypto";
import { incrementMetric, observeMetric } from "../infrastructure/observability/metrics.js";

export const requestContext = (req, res, next) => {
  const requestId = /^[a-zA-Z0-9._-]{1,128}$/.test(req.headers["x-request-id"] || "")
    ? req.headers["x-request-id"] : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  const startedAt = performance.now();
  res.on("finish", () => {
    observeMetric("api_request_latency_ms", performance.now() - startedAt, { method: req.method, status: res.statusCode });
    if (res.statusCode >= 500) incrementMetric("api_requests_failed_total", { status: res.statusCode });
  });
  next();
};
