// src/modules/notifications/webhook.handler.js
// Orchestrates webhook delivery for a NotifyHub event.
// Loads tenant webhook config from DB, builds the signed payload,
// calls webhook.service.js for the real HTTP POST.
// NEVER logs the webhookSecret.

import { tenantService } from "../tenant/tenant.service.js";
import { deliverWebhook } from "./webhook.service.js";
import {
  logWebhookAttempt,
  logWebhookSuccess,
  logWebhookFailed,
} from "../worker/worker.logger.js";

/**
 * A typed error that carries retry intent from the webhook delivery layer
 * up to the worker service, so the retry engine knows whether to retry.
 */
export class WebhookDeliveryError extends Error {
  constructor(message, { retryable = false, statusCode = null } = {}) {
    super(message);
    this.name = "WebhookDeliveryError";
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

/**
 * Main webhook handler — called by worker.dispatcher.js when channel === "webhook".
 *
 * @param {object} event - Parsed Kafka event
 * @param {string} event.eventId
 * @param {string} event.tenantId
 * @param {string} event.type
 * @param {object} event.payload
 * @param {number} [event.attempt] - Current attempt number (1-based)
 */
export const handleWebhook = async (event) => {
  const attempt = event.attempt ?? 1;

  // ── 1. Load tenant webhook configuration ───────────────────────────────────
  const tenant = await tenantService.getTenantForWebhook(event.tenantId);

  if (!tenant) {
    throw new WebhookDeliveryError(
      `Tenant not found for webhook delivery: ${event.tenantId}`,
      { retryable: false }
    );
  }

  if (!tenant.webhookUrl) {
    throw new WebhookDeliveryError(
      `Tenant ${event.tenantId} has no webhookUrl configured`,
      { retryable: false }
    );
  }

  // Safely extract just the hostname for logging (no credentials, no path)
  let webhookUrlHost;
  try {
    webhookUrlHost = new URL(tenant.webhookUrl).host;
  } catch {
    webhookUrlHost = "(invalid-url)";
  }

  logWebhookAttempt({
    eventId: event.eventId,
    tenantId: event.tenantId,
    attempt,
    webhookUrlHost,
  });

  // ── 2. Build the payload — use existing NotifyHub event schema ─────────────
  const webhookPayload = {
    eventId: event.eventId,
    eventType: event.type,
    tenantId: event.tenantId,
    channel: "webhook",
    data: event.payload,
    timestamp: new Date().toISOString(),
  };

  // ── 3. Perform the real HTTP POST ──────────────────────────────────────────
  const result = await deliverWebhook({
    webhookUrl: tenant.webhookUrl,
    webhookSecret: tenant.webhookSecret ?? null, // secret selected explicitly, never logged
    payload: webhookPayload,
  });

  // ── 4. Log and return or throw ─────────────────────────────────────────────
  if (result.success) {
    logWebhookSuccess({
      eventId: event.eventId,
      tenantId: event.tenantId,
      attempt,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    });

    return {
      channel: "webhook",
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      providerResponse: result.providerResponse,
    };
  }

  // Delivery failed — log and throw so the retry engine can decide
  logWebhookFailed({
    eventId: event.eventId,
    tenantId: event.tenantId,
    attempt,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    retryable: result.retryable,
    reason: result.errorMessage,
  });

  throw new WebhookDeliveryError(result.errorMessage, {
    retryable: result.retryable,
    statusCode: result.statusCode,
  });
};
