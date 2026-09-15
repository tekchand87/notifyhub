// src/modules/notifications/email.handler.js
// Responsibility: validate the NotifyHub email event, then call Email Service.
// Does NOT know about Kafka, SMTP config, or Express routes.
//
// Canonical payload contract (Bug #11 fix):
//   payload.to      — required: recipient address
//   payload.subject — required: email subject line
//   payload.text    — recommended: plain-text body
//   payload.html    — optional: HTML body (can be used alone or with text)
//   payload.body    — legacy alias for payload.text (backward compatible)
//
// At least one of payload.text, payload.body, or payload.html must be present.

import { sendEmail } from "./email.service.js";

export const handleEmail = async (event) => {
  // 1. Validate top-level payload shape
  const payload = event?.payload;

  if (!payload || typeof payload !== "object") {
    throw new Error("Email event payload must be an object");
  }

  // 2. Extract required fields
  const { to, subject, html } = payload;

  // Bug #11 fix: normalize text — accept payload.text (canonical) or
  // payload.body (legacy alias) so existing events are not re-queued.
  const text = payload.text ?? payload.body ?? null;

  if (!to) {
    throw new Error("Email payload.to is required");
  }

  if (!subject) {
    throw new Error("Email payload.subject is required");
  }

  if (!text && !html) {
    throw new Error(
      "Email payload requires at least one of: payload.text, payload.html"
    );
  }

  // 3. Delegate to Email Service (SMTP layer)
  return sendEmail({
    to,
    subject,
    text: text ?? undefined,
    html: html ?? undefined,
  });
};