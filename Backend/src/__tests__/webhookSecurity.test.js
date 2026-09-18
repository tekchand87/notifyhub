import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "dns";
import {
  classifyIpAddress,
  createPinnedLookup,
  deliverWebhook,
  resolveAndValidateWebhookTarget,
} from "../modules/notifications/webhook.service.js";

const initialEnv = {
  nodeEnv: process.env.NODE_ENV,
  allowLocalhost: process.env.WEBHOOK_ALLOW_LOCALHOST,
  allowHttp: process.env.WEBHOOK_ALLOW_INSECURE_HTTP,
};

const restore = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  vi.restoreAllMocks();
  restore("NODE_ENV", initialEnv.nodeEnv);
  restore("WEBHOOK_ALLOW_LOCALHOST", initialEnv.allowLocalhost);
  restore("WEBHOOK_ALLOW_INSECURE_HTTP", initialEnv.allowHttp);
});

describe("webhook address policy", () => {
  it.each([
    "127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "::", "::1", "fc00::1", "fe80::1", "ff00::1", "::ffff:127.0.0.1", "::127.0.0.1",
  ])("blocks non-public address %s", (address) => {
    expect(classifyIpAddress(address).blocked).toBe(true);
  });

  it("allows globally routable IPv4", () => {
    expect(classifyIpAddress("8.8.8.8")).toMatchObject({ blocked: false, family: 4 });
  });

  it("rejects any hostname with a private answer", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    const result = await resolveAndValidateWebhookTarget(new URL("https://mixed.example/hook"));
    expect(result.error).toContain("non-public");
  });

  it("fails closed and retryably when DNS lookup fails", async () => {
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    const result = await resolveAndValidateWebhookTarget(new URL("https://missing.example/hook"));
    expect(result).toMatchObject({ retryable: true });
    expect(result.error).toContain("DNS resolution failed");
  });

  it("pins a connection lookup to the validated address rather than resolving again", () => {
    const lookup = createPinnedLookup("8.8.8.8", 4);
    let result;
    lookup("rebound.example", {}, (_error, address, family) => { result = { address, family }; });
    expect(result).toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("requires HTTPS in production regardless of development flags", async () => {
    process.env.NODE_ENV = "production";
    process.env.WEBHOOK_ALLOW_LOCALHOST = "true";
    process.env.WEBHOOK_ALLOW_INSECURE_HTTP = "true";
    const result = await deliverWebhook({ webhookUrl: "http://127.0.0.1/hook", webhookSecret: null, payload: {} });
    expect(result).toMatchObject({ success: false, retryable: false });
    expect(result.errorMessage).toContain("HTTPS");
  });

  it("rejects non-HTTP(S) URLs and embedded credentials", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/hook", "https://user:password@example.com/hook"]) {
      const result = await deliverWebhook({ webhookUrl: url, webhookSecret: null, payload: {} });
      expect(result).toMatchObject({ success: false, retryable: false });
    }
  });
});
