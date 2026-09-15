// src/config/env.js
// Central environment configuration for the API server.
//
// All environment variables consumed by the application are declared here.
// Required variables are validated at startup — missing values crash early.
// Never add raw secrets to this file; read them from process.env only.

import dotenv from "dotenv"

dotenv.config();

const requiredEnv = [
  "MONGODB_URI",
  "JWT_SECRET"
];

for(const key of requiredEnv){
  if(!process.env[key]){
    throw new Error(`Missing required environment variable : ${key}`);
  }
}

export const env = {
  PORT         : process.env.PORT || 3000,
  NODE_ENV     : process.env.NODE_ENV || "development",
  MONGODB_URI  : process.env.MONGODB_URI,
  JWT_SECRET   : process.env.JWT_SECRET,
  JWT_EXPIRES_IN : process.env.JWT_EXPIRES_IN || "1d",

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Comma-separated list of allowed origin URLs.
  // Development default: http://localhost:5173 (Vite dev server)
  // Production: set CORS_ORIGINS=https://app.yourdomain.com
  // NEVER use "*" in production — authenticated API must restrict origins.
  CORS_ORIGINS : process.env.CORS_ORIGINS || "http://localhost:5173",

  // ── Webhook SSRF protection ────────────────────────────────────────────────
  // Bug #3: WEBHOOK_ALLOW_LOCALHOST is read lazily by webhook.service.js
  // (via getAllowLocalhost()) so each request reads the live process.env value.
  // This means it IS picked up at runtime — but env vars are always set before
  // the Node.js process starts (dotenv.config() runs at module import time).
  // There is NO dynamic env reloading — a restart is always required to pick up
  // changed .env values, which is standard and expected behaviour.
  //
  // Production default: false (localhost/private-range webhooks are BLOCKED)
  // Development: set WEBHOOK_ALLOW_LOCALHOST=true in .env
  WEBHOOK_ALLOW_LOCALHOST : process.env.WEBHOOK_ALLOW_LOCALHOST === "true",
};