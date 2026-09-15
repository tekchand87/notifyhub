// src/config/retry.config.js
// Centralises retry and delivery configuration loaded from environment variables.
// Uses getter functions so values are always read fresh from process.env,
// which allows tests to override them without module cache issues.

export const retryConfig = {
  // Maximum total delivery attempts per event (first attempt + retries)
  get maxAttempts() { return Number(process.env.MAX_DELIVERY_ATTEMPTS) || 5; },

  // Base delay for exponential backoff (milliseconds)
  get baseDelayMs() { return Number(process.env.RETRY_BASE_DELAY_MS) || 1_000; },

  // Maximum delay cap after backoff + jitter (milliseconds, default 5 minutes)
  get maxDelayMs() { return Number(process.env.RETRY_MAX_DELAY_MS) || 300_000; },

  // How often the retry poller runs (milliseconds)
  get pollerIntervalMs() { return Number(process.env.RETRY_POLLER_INTERVAL_MS) || 5_000; },
};
