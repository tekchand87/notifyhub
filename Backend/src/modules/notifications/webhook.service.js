// src/modules/notifications/webhook.service.js
// Real HTTP webhook delivery using Node 18+ native fetch.
// Responsibilities:
//   - Perform a real HTTP POST to the configured webhookUrl
//   - Sign the payload with HMAC-SHA256 (X-NotifyHub-Signature header)
//   - Apply a configurable timeout
//   - Classify responses as retryable or non-retryable
//   - Return structured delivery metadata (never expose the secret)

import crypto from "crypto";

// ─── SSRF protection ─────────────────────────────────────────────────────────
// Block localhost / loopback / private ranges unless explicitly allowed for dev.
// Read lazily from process.env so tests can override without module cache issues
const getAllowLocalhost = () => process.env.WEBHOOK_ALLOW_LOCALHOST === "true";
const getTimeoutMs = () => Number(process.env.WEBHOOK_TIMEOUT_MS) || 10_000;

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

/**
 * Returns true if the hostname looks like a private/loopback address.
 */
const isPrivateHost = (hostname) => {
  if (hostname === "localhost") return true;
  return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
};

/**
 * Classify an HTTP status as retryable or non-retryable.
 *
 * Retryable:   408, 425, 429, 500, 502, 503, 504
 * Non-retryable: 4xx (other), 3xx (we don't follow redirects for webhooks)
 */
export const isRetryableHttpStatus = (status) => {
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  return false;
};

/**
 * Build the HMAC-SHA256 signature over the raw JSON string.
 * Format: sha256=<hex>
 * The signing key is the webhookSecret.
 * Returns null if no secret is configured.
 */
export const signPayload = (rawBody, secret) => {
  if (!secret) return null;
  const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${sig}`;
};

/**
 * Deliver an event to the tenant's webhook endpoint via HTTP POST.
 *
 * @param {object} params
 * @param {string} params.webhookUrl   - Destination URL
 * @param {string|null} params.webhookSecret - HMAC signing secret (never logged)
 * @param {object} params.payload      - The event payload object to POST
 * @returns {Promise<{
 *   success: boolean,
 *   statusCode: number|null,
 *   durationMs: number,
 *   retryable: boolean,
 *   errorMessage: string|null,
 *   providerResponse: string|null,
 * }>}
 */
export const deliverWebhook = async ({ webhookUrl, webhookSecret, payload }) => {
  const startMs = Date.now();

  // ── Validate and SSRF-check the URL ────────────────────────────────────────
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return {
      success: false,
      statusCode: null,
      durationMs: 0,
      retryable: false,
      errorMessage: `Invalid webhook URL: ${webhookUrl}`,
      providerResponse: null,
    };
  }

  if (!getAllowLocalhost() && isPrivateHost(parsedUrl.hostname)) {
    return {
      success: false,
      statusCode: null,
      durationMs: 0,
      retryable: false,
      errorMessage: `Webhook URL targets a private/loopback address (${parsedUrl.hostname}). Set WEBHOOK_ALLOW_LOCALHOST=true to allow this in development.`,
      providerResponse: null,
    };
  }

  // ── Build the signed payload ────────────────────────────────────────────────
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, webhookSecret);

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "NotifyHub-Webhook/1.0",
    "X-NotifyHub-Delivery-Id": payload.deliveryId ?? "",
    "X-NotifyHub-Event": payload.eventType ?? "",
    // Only add signature header if a secret is configured
    ...(signature ? { "X-NotifyHub-Signature": signature } : {}),
  };

  // ── Execute the HTTP POST with timeout ─────────────────────────────────────
  const TIMEOUT_MS = getTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
      // Do NOT follow redirects for webhooks — treat 3xx as non-retryable
      redirect: "manual",
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startMs;

    const success = response.status >= 200 && response.status < 300;
    const retryable = !success && isRetryableHttpStatus(response.status);

    // Read a truncated portion of the body for logging (never full response body for security)
    let providerResponse = null;
    try {
      const text = await response.text();
      providerResponse = text.slice(0, 512); // cap at 512 chars
    } catch {
      // ignore body read errors
    }

    return {
      success,
      statusCode: response.status,
      durationMs,
      retryable,
      errorMessage: success ? null : `HTTP ${response.status}`,
      providerResponse,
    };

  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startMs;

    const isTimeout = err.name === "AbortError";
    const isNetworkError = !isTimeout; // ECONNREFUSED, ENOTFOUND, etc.

    return {
      success: false,
      statusCode: null,
      durationMs,
      // Timeouts and network errors are always retryable
      retryable: isTimeout || isNetworkError,
      errorMessage: isTimeout
        ? `Webhook timed out after ${TIMEOUT_MS}ms`
        : `Network error: ${err.message}`,
      providerResponse: null,
    };
  }
};
