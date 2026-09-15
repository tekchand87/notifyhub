// src/__tests__/email.test.js
// Unit tests for the email handler — Bug #11: payload.text vs payload.body contract.
// No SMTP connection needed — we mock the email service.

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mock the SMTP layer so no real connection is made ──────────────────────────
vi.mock("../modules/notifications/email.service.js", () => ({
  sendEmail: vi.fn().mockResolvedValue({
    messageId: "test-message-id",
    response: "250 OK",
    accepted: ["to@example.com"],
    rejected: [],
  }),
}));

const { handleEmail } = await import("../modules/notifications/email.handler.js");
const { sendEmail } = await import("../modules/notifications/email.service.js");

describe("Bug #11 — Email payload contract (text vs body)", () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  it("payload.text (canonical) works correctly", async () => {
    await handleEmail({
      payload: {
        to: "customer@example.com",
        subject: "Order Created",
        text: "Your order was created.",
      },
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com",
        subject: "Order Created",
        text: "Your order was created.",
      })
    );
  });

  it("payload.body (legacy alias) still works", async () => {
    vi.clearAllMocks();
    await handleEmail({
      payload: {
        to: "customer@example.com",
        subject: "Legacy Email",
        body: "Legacy body text.",
      },
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Legacy body text.",
      })
    );
  });

  it("payload.text takes priority over payload.body", async () => {
    vi.clearAllMocks();
    await handleEmail({
      payload: {
        to: "customer@example.com",
        subject: "Priority Test",
        text: "canonical text",
        body: "legacy body",
      },
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "canonical text",
      })
    );
  });

  it("payload.html (HTML-only email) works", async () => {
    vi.clearAllMocks();
    await handleEmail({
      payload: {
        to: "customer@example.com",
        subject: "HTML Email",
        html: "<p>Hello</p>",
      },
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "<p>Hello</p>",
      })
    );
  });

  it("payload.text + payload.html multipart email works", async () => {
    vi.clearAllMocks();
    await handleEmail({
      payload: {
        to: "customer@example.com",
        subject: "Multipart Email",
        text: "Plain text version",
        html: "<p>HTML version</p>",
      },
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Plain text version",
        html: "<p>HTML version</p>",
      })
    );
  });

  it("missing to → throws", async () => {
    await expect(
      handleEmail({
        payload: { subject: "Test", text: "Body" },
      })
    ).rejects.toThrow("to");
  });

  it("missing subject → throws", async () => {
    await expect(
      handleEmail({
        payload: { to: "a@b.com", text: "Body" },
      })
    ).rejects.toThrow("subject");
  });

  it("missing text, body, and html → throws with descriptive error", async () => {
    await expect(
      handleEmail({
        payload: { to: "a@b.com", subject: "Test" },
      })
    ).rejects.toThrow(/payload\.text|payload\.html/i);
  });

  it("non-object payload → throws", async () => {
    await expect(handleEmail({ payload: "string" })).rejects.toThrow(
      "payload must be an object"
    );
  });

  it("null payload → throws", async () => {
    await expect(handleEmail({ payload: null })).rejects.toThrow(
      "payload must be an object"
    );
  });
});
