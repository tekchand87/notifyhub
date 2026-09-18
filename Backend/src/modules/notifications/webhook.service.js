// DNS-aware webhook delivery. Sockets are pinned to validated addresses to
// prevent DNS rebinding between validation and connection.

import crypto from "crypto";
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import { observeMetric, incrementMetric } from "../../infrastructure/observability/metrics.js";

const getTimeoutMs = () => Number(process.env.WEBHOOK_TIMEOUT_MS) || 10_000;
const getMaxResponseBytes = () => {
  const value = Number(process.env.WEBHOOK_MAX_RESPONSE_BYTES);
  return Number.isSafeInteger(value) && value > 0 ? value : 8_192;
};
const isProduction = () => process.env.NODE_ENV === "production";
const allowLocalhost = () => !isProduction() && process.env.WEBHOOK_ALLOW_LOCALHOST === "true";
const allowInsecureHttp = () => !isProduction() && process.env.WEBHOOK_ALLOW_INSECURE_HTTP === "true";
const stripBrackets = (address) => String(address).replace(/^\[|\]$/g, "");

const ipv4Number = (address) => address.split(".").reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
const inIpv4Range = (address, network, prefix) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
};
const ipv4IsNonPublic = (address) => [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].some(([network, prefix]) => inIpv4Range(address, network, prefix));

const ipv6ToBigInt = (input) => {
  let address = stripBrackets(input).toLowerCase();
  const mapped = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const value = ipv4Number(mapped[2]);
    address = `${mapped[1]}${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, tail] = address.split("::");
  const left = head ? head.split(":").filter(Boolean) : [];
  const right = tail ? tail.split(":").filter(Boolean) : [];
  const groups = address.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) + BigInt(`0x${group}`), 0n);
};
const inIpv6Range = (address, network, prefix) => {
  const value = ipv6ToBigInt(address);
  const base = ipv6ToBigInt(network);
  if (value === null || base === null) return true;
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return (value & mask) === (base & mask);
};
const mappedIpv4 = (address) => {
  const value = ipv6ToBigInt(address);
  // Cover both IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible
  // (::a.b.c.d) forms so a private IPv4 address cannot bypass policy.
  const highBits = value === null ? null : value >> 32n;
  if (value === null || (highBits !== 0xffffn && highBits !== 0n)) return null;
  const ipv4 = Number(value & 0xffffffffn);
  return [24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 255).join(".");
};
const ipv6IsNonPublic = (address) => {
  const mapped = mappedIpv4(address);
  if (mapped) return ipv4IsNonPublic(mapped);
  return [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]
    .some(([network, prefix]) => inIpv6Range(address, network, prefix));
};

export const classifyIpAddress = (input) => {
  const address = stripBrackets(input);
  const family = net.isIP(address);
  if (family === 4) return { address, family, blocked: ipv4IsNonPublic(address), loopback: inIpv4Range(address, "127.0.0.0", 8) };
  if (family === 6) return { address, family, blocked: ipv6IsNonPublic(address), loopback: address === "::1" || mappedIpv4(address) === "127.0.0.1" };
  return { address, family: 0, blocked: true, loopback: false };
};

const failure = (startMs, errorMessage, { retryable = false, statusCode = null } = {}) => ({
  success: false, statusCode, durationMs: Date.now() - startMs, retryable, errorMessage, providerResponse: null,
});

const validateUrl = (webhookUrl) => {
  let target;
  try { target = new URL(webhookUrl); } catch { return { error: "Invalid webhook URL" }; }
  if (target.username || target.password) return { error: "Webhook URL must not include credentials" };
  if (!target.hostname) return { error: "Webhook URL hostname is required" };
  if (target.protocol !== "https:" && target.protocol !== "http:") return { error: "Webhook URL protocol must be HTTP or HTTPS" };
  // Production HTTPS enforcement — block before any DNS/network use (test: "blocks HTTP in production")
  if (isProduction() && target.protocol !== "https:") return { error: "Webhook URL must use HTTPS in production" };
  // NOTE: the HTTP dev-restriction (allowInsecureHttp / allowLocalhost) is enforced in
  // deliverWebhook *after* IP validation so that private-IP URLs return the right error.
  return { target };
};

/** Resolve every answer; a single non-public result blocks the whole hostname. */
export const resolveAndValidateWebhookTarget = async (target) => {
  const hostname = stripBrackets(target.hostname);
  let addresses;
  try {
    addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
      : await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    return { error: `Webhook DNS resolution failed: ${error.code || error.message}`, retryable: true };
  }
  if (!addresses.length) return { error: "Webhook DNS resolution returned no addresses", retryable: true };
  const classified = addresses.map(({ address, family }) => ({ ...classifyIpAddress(address), family }));
  // allowLocalhost() exemption applies ONLY to direct-IP loopback (e.g. http://127.0.0.1 in dev).
  // Hostnames that DNS-resolve to loopback are ALWAYS blocked regardless of the flag:
  // allowing them would defeat SSRF / DNS-rebinding protection.
  const isDirectIp = net.isIP(hostname) !== 0;
  const blocked = classified.find((entry) => {
    if (!entry.blocked) return false;
    if (entry.loopback && isDirectIp && allowLocalhost()) return false; // dev direct-IP exemption
    return true;
  });
  if (blocked) return { error: `Webhook target resolved to a private non-public address (${blocked.address})`, retryable: false };
  return { target, address: classified[0].address, family: classified[0].family, addresses: classified };
};

export const readBoundedResponse = (response, maxBytes) => new Promise((resolve, reject) => {
  const chunks = [];
  let bytes = 0;
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString("utf8")); } };
  response.on("data", (chunk) => {
    if (done) return;
    const remaining = maxBytes - bytes;
    if (remaining > 0) {
      const safeChunk = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(safeChunk); bytes += safeChunk.length;
    }
    if (chunk.length > remaining) {
      done = true;
      // Include the truncated body so the caller can still use it if desired.
      // IMPORTANT: use response.destroy() *without* an error argument. Passing
      // an error would propagate synchronously to the request's 'error' handler,
      // settling the outer sendPinnedRequest promise as rejected before our
      // async catch block can recover and resolve it with the truncated body.
      const error = Object.assign(
        new Error(`Webhook response exceeded ${maxBytes} bytes`),
        { code: "WEBHOOK_RESPONSE_TOO_LARGE", truncatedBody: Buffer.concat(chunks).toString("utf8") }
      );
      response.destroy(); // silent destroy — no socket error event
      reject(error);
    }
  });
  response.once("end", finish);
  response.once("close", finish);
  response.once("error", finish);
});

export const createPinnedLookup = (address, family) => (
  _hostname,
  _options,
  callback
) => callback(null, address, family);

const sendPinnedRequest = ({ target, address, family, headers, body }) => new Promise((resolve, reject) => {
  const transport = target.protocol === "https:" ? https : http;
  let settled = false;
  let timeout;
  const complete = (callback, value) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    callback(value);
  };
  const request = transport.request(target, {
    method: "POST",
    headers: { ...headers, Host: target.host },
    servername: net.isIP(stripBrackets(target.hostname)) ? undefined : stripBrackets(target.hostname),
    lookup: createPinnedLookup(address, family),
  }, async (response) => {
    try {
      const providerResponse = await readBoundedResponse(response, getMaxResponseBytes());
      complete((value) => resolve(value), { statusCode: response.statusCode, providerResponse });
    } catch (err) {
      if (err?.code === "WEBHOOK_RESPONSE_TOO_LARGE") {
        // Body was too large but the HTTP delivery itself succeeded.
        // Resolve with the truncated body so the caller records it as a success.
        complete((value) => resolve(value), {
          statusCode: response.statusCode,
          providerResponse: err.truncatedBody ?? "",
        });
      } else {
        complete((value) => reject(value), err);
      }
    }
  });
  timeout = setTimeout(() => {
    const error = Object.assign(new Error("Webhook request timed out"), { code: "ETIMEDOUT" });
    request.destroy(error);
    complete((value) => reject(value), error);
  }, getTimeoutMs());
  request.once("error", (error) => complete((value) => reject(value), error));
  request.end(body);
});

export const isRetryableHttpStatus = (status) => status === 408 || status === 425 || status === 429 || status >= 500;
export const signPayload = (rawBody, secret) => secret ? `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}` : null;

export const deliverWebhook = async ({ webhookUrl, webhookSecret, payload }) => {
  const startMs = Date.now();
  const parsed = validateUrl(webhookUrl);
  if (parsed.error) return failure(startMs, parsed.error);
  const resolved = await resolveAndValidateWebhookTarget(parsed.target);
  if (resolved.error) return failure(startMs, resolved.error, { retryable: resolved.retryable });
  // HTTP dev-restriction is checked AFTER IP validation so that private-IP URLs
  // (e.g. http://127.0.0.1) return the "private" error, not the HTTP error.
  if (parsed.target.protocol === "http:" && !isProduction() && !allowInsecureHttp() && !allowLocalhost()) {
    return failure(startMs, "HTTP webhooks require WEBHOOK_ALLOW_INSECURE_HTTP=true in development");
  }
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, webhookSecret);
  const headers = {
    "Content-Type": "application/json", "User-Agent": "NotifyHub-Webhook/1.0",
    "X-NotifyHub-Delivery-Id": payload.deliveryId ?? "", "X-NotifyHub-Event": payload.eventType ?? "",
    ...(signature ? { "X-NotifyHub-Signature": signature } : {}),
  };
  try {
    const response = await sendPinnedRequest({ ...resolved, headers, body: rawBody });
    const success = response.statusCode >= 200 && response.statusCode < 300;
    const durationMs = Date.now() - startMs;
    observeMetric("webhook_latency_ms", durationMs, { outcome: success ? "success" : "failure" });
    if (!success) incrementMetric("delivery_failure_total", { channel: "webhook" }); else incrementMetric("delivery_success_total", { channel: "webhook" });
    return { success, statusCode: response.statusCode, durationMs,
      retryable: !success && isRetryableHttpStatus(response.statusCode), errorMessage: success ? null : `HTTP ${response.statusCode}`,
      providerResponse: response.providerResponse };
  } catch (error) {
    if (error?.code === "WEBHOOK_RESPONSE_TOO_LARGE") {
      return failure(startMs, "Webhook response exceeded configured size limit", { retryable: false });
    }
    const timeout = error?.code === "ETIMEDOUT" || error?.name === "AbortError";
    incrementMetric("delivery_failure_total", { channel: "webhook" });
    observeMetric("webhook_latency_ms", Date.now() - startMs, { outcome: "failure" });
    return failure(startMs, timeout ? `Webhook timed out after ${getTimeoutMs()}ms` : `Network error: ${error.message}`, { retryable: true });
  }
};
