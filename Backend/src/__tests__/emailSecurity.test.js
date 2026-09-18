import { describe, expect, it } from "vitest";
import { buildRawEmail, validateEmailHeaders } from "../modules/notifications/email.service.js";

describe("email MIME header security", () => {
  const valid = { from: "sender@example.com", to: "recipient@example.com", subject: "Hello" };
  it("accepts valid recipient and subject", () => expect(validateEmailHeaders(valid)).toMatchObject(valid));
  it.each(["Hello\rBcc: attacker@example.com", "Hello\nBcc: attacker@example.com"])("rejects injected subject", (subject) => {
    expect(() => buildRawEmail({ ...valid, subject, text: "body" })).toThrow("Invalid email subject");
  });
  it.each(["recipient@example.com\r\nBcc: attacker@example.com", "recipient@example.com\nBcc: attacker@example.com"])("rejects injected recipient", (to) => {
    expect(() => validateEmailHeaders({ ...valid, to })).toThrow("Invalid recipient address");
  });
  it("rejects injected reply-to", () => {
    expect(() => validateEmailHeaders({ ...valid, replyTo: "reply@example.com\r\nBcc: attacker@example.com" })).toThrow("Invalid reply-to address");
  });
  it("encodes a valid UTF-8 subject rather than interpolating it", () => {
    const raw = Buffer.from(buildRawEmail({ ...valid, subject: "Résumé", text: "body" }), "base64url").toString();
    expect(raw).toContain("Subject: =?UTF-8?B?");
  });
});
