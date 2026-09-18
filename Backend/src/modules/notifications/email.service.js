// email.service.js
// Sends email via the Gmail REST API (googleapis) over HTTPS port 443.
//
// Why not nodemailer + SMTP?
//   All SMTP ports (25, 465, 587) are blocked by the ISP. Even nodemailer with
//   Gmail OAuth2 auth still makes the final delivery over SMTP — same block.
//
//   The Gmail REST API (https://gmail.googleapis.com) uses port 443 (HTTPS),
//   which is never blocked, and sends from your own Gmail address.
//
// Required env vars:
//   SMTP_USER             — your Gmail address (used as sender)
//   GMAIL_CLIENT_ID       — from Google Cloud Console
//   GMAIL_CLIENT_SECRET   — from Google Cloud Console
//   GMAIL_REFRESH_TOKEN   — from OAuth 2.0 Playground

import { google } from "googleapis";
import { z } from "zod";
import { observeMetric, incrementMetric } from "../../infrastructure/observability/metrics.js";
import "dotenv/config";

// Build OAuth2 client once — googleapis auto-refreshes the access token
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a base64url-encoded RFC 2822 message
const rejectHeaderInjection = (value, name) => {
  if (typeof value !== "string" || /[\r\n]/.test(value)) throw new Error(`Invalid ${name}`);
  return value;
};
const emailAddress = z.string().trim().email().max(320);
const validateAddress = (value, name) => {
  rejectHeaderInjection(value, name);
  if (!emailAddress.safeParse(value).success) throw new Error(`Invalid ${name}`);
  return value.trim();
};
const encodeSubject = (value) => `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

export const validateEmailHeaders = ({ from, to, subject, replyTo }) => ({
  from: validateAddress(from, "sender address"),
  to: validateAddress(to, "recipient address"),
  subject: rejectHeaderInjection(subject, "email subject"),
  ...(replyTo ? { replyTo: validateAddress(replyTo, "reply-to address") } : {}),
});

export const buildRawEmail = ({ from, to, subject, text, html, replyTo }) => {
  ({ from, to, subject, replyTo } = validateEmailHeaders({ from, to, subject, replyTo }));
  const boundary = "notifyhub_mime_boundary";
  const hasHtml = !!html;

  let mime;
  if (hasHtml) {
    // multipart/alternative: plain text + HTML
    mime =
      `From: ${from}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodeSubject(subject)}\r\n` +
      (replyTo ? `Reply-To: ${replyTo}\r\n` : "") +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
      (text
        ? `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n`
        : "") +
      `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n` +
      `--${boundary}--`;
  } else {
    // plain text only
    mime =
      `From: ${from}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodeSubject(subject)}\r\n` +
      (replyTo ? `Reply-To: ${replyTo}\r\n` : "") +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      `${text}`;
  }

  return Buffer.from(mime).toString("base64url");
};

// ── Public API ────────────────────────────────────────────────────────────────

// Kept for backward compatibility with email.test-send.js
export const verifyEmailTransporter = async () => {
  // Lightweight check: fetch token to validate credentials
  await oauth2Client.getAccessToken();
  console.log("Gmail API OAuth2 credentials verified ✅");
};

export const sendEmail = async ({ to, subject, text, html, replyTo }) => {
  const startedAt = Date.now();
  if (!to)           throw new Error("Email recipient is required");
  if (!subject)      throw new Error("Email subject is required");
  if (!text && !html) throw new Error("Email content is required");

  const from = process.env.SMTP_USER;
  if (!from || !process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error("Email provider is not configured");
  }

  const raw = buildRawEmail({ from, to, subject, text, html, replyTo });

  let response;
  try {
    response = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    incrementMetric("delivery_success_total", { channel: "email" });
  } catch (error) {
    incrementMetric("delivery_failure_total", { channel: "email" });
    throw error;
  } finally { observeMetric("email_latency_ms", Date.now() - startedAt); }

  const messageId = response.data.id;

  return {
    messageId,
    response: "250 OK",
    accepted: [to],
    rejected: [],
  };
};
