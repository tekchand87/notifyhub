import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { readBoundedResponse } from "../modules/notifications/webhook.service.js";

describe("bounded webhook response reader", () => {
  it("reads a response at the configured limit", async () => {
    const stream = new PassThrough();
    const result = readBoundedResponse(stream, 4);
    stream.end("1234");
    await expect(result).resolves.toBe("1234");
  });
  it("aborts and fails instead of buffering oversized bodies", async () => {
    const stream = new PassThrough();
    const result = readBoundedResponse(stream, 4);
    stream.end("12345".repeat(1000));
    await expect(result).rejects.toMatchObject({ code: "WEBHOOK_RESPONSE_TOO_LARGE" });
  });
});
