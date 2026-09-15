// src/modules/event/event.transitions.js
// Defines valid Event status transitions as an explicit state machine.
//
// Why this exists:
//   Without explicit transition guards, it is possible to accidentally write code
//   that transitions an event from "delivered" back to "queued", or processes a
//   DLQ event as if it were active. These bugs are silent and hard to detect.
//
// Valid state graph:
//
//   queued ──────────────────────────────→ processing
//   processing ─────────────────────────→ delivered    (success)
//   processing ─────────────────────────→ failed       (non-retryable error)
//   processing ─────────────────────────→ retry_wait   (retryable error, attempts < max)
//   processing ─────────────────────────→ dlq          (retryable error, attempts >= max)
//   retry_wait ─────────────────────────→ processing   (retry poller picks it up)
//
//   delivered, failed, dlq are TERMINAL — no further transitions.
//
// Admin replay:
//   Transitioning out of DLQ would require an explicit administrative action
//   (e.g., PUT /admin/events/:id/replay). This is not yet implemented.
//   To prevent accidental replay, DLQ is enforced as terminal here.

import { EVENT_STATUS } from "./event.constants.js";
import { AppError } from "../../utils/AppError.js";

const VALID_TRANSITIONS = new Map([
  [EVENT_STATUS.QUEUED,      new Set([EVENT_STATUS.PROCESSING])],
  [EVENT_STATUS.PROCESSING,  new Set([
    EVENT_STATUS.DELIVERED,
    EVENT_STATUS.FAILED,
    EVENT_STATUS.RETRY_WAIT,
    EVENT_STATUS.DLQ,
  ])],
  [EVENT_STATUS.RETRY_WAIT,  new Set([EVENT_STATUS.PROCESSING])],
  [EVENT_STATUS.DELIVERED,   new Set()],  // terminal
  [EVENT_STATUS.FAILED,      new Set()],  // terminal
  [EVENT_STATUS.DLQ,         new Set()],  // terminal
]);

/**
 * Assert that a state transition is valid.
 * Throws AppError(400) if the transition is not in the valid transition map.
 *
 * @param {string} from - Current status
 * @param {string} to   - Target status
 * @throws {AppError} 400 if invalid
 */
export const assertValidTransition = (from, to) => {
  const allowed = VALID_TRANSITIONS.get(from);

  if (allowed === undefined) {
    throw new AppError(
      `Unknown event status: "${from}"`,
      400
    );
  }

  if (!allowed.has(to)) {
    const allowedList = [...allowed].join(", ") || "none (terminal state)";
    throw new AppError(
      `Invalid event status transition: "${from}" → "${to}". Allowed: ${allowedList}`,
      400
    );
  }
};

/**
 * Check if a status is terminal (no further transitions allowed).
 * @param {string} status
 * @returns {boolean}
 */
export const isTerminalStatus = (status) => {
  const allowed = VALID_TRANSITIONS.get(status);
  return allowed !== undefined && allowed.size === 0;
};

/**
 * Get all valid next statuses from a given status.
 * @param {string} status
 * @returns {string[]}
 */
export const getAllowedTransitions = (status) => {
  const allowed = VALID_TRANSITIONS.get(status);
  return allowed ? [...allowed] : [];
};
