// Minimal process-local metrics foundation. It deliberately has no exporter or
// I/O on request paths; an OpenTelemetry/Prometheus adapter can consume this API.
const counters = new Map();
const observations = new Map();
const key = (name, labels = {}) => `${name}{${Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(",")}}`;

export const incrementMetric = (name, labels = {}, value = 1) => {
  const metricKey = key(name, labels);
  counters.set(metricKey, (counters.get(metricKey) || 0) + value);
};
export const observeMetric = (name, milliseconds, labels = {}) => {
  const metricKey = key(name, labels);
  const previous = observations.get(metricKey) || { count: 0, sum: 0, max: 0 };
  observations.set(metricKey, { count: previous.count + 1, sum: previous.sum + milliseconds, max: Math.max(previous.max, milliseconds) });
};
export const metricsSnapshot = () => ({ counters: Object.fromEntries(counters), observations: Object.fromEntries(observations) });
export const clearMetrics = () => { counters.clear(); observations.clear(); };
