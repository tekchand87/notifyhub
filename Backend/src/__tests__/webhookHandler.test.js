import { describe, expect, it, vi } from "vitest";

const getTenantForWebhook = vi.fn().mockResolvedValue({
  webhookUrl: "https://hooks.example.test/notify",
  webhookSecret: "test-secret",
});
const deliverWebhook = vi.fn().mockResolvedValue({
  success: true, statusCode: 200, durationMs: 1, providerResponse: "ok",
});

vi.mock("../modules/tenant/tenant.service.js", () => ({ tenantService: { getTenantForWebhook } }));
vi.mock("../modules/notifications/webhook.service.js", () => ({ deliverWebhook }));

const { handleWebhook } = await import("../modules/notifications/webhook.handler.js");

describe("webhook delivery identity", () => {
  it("uses the stable Event ID as the delivery ID on every retry", async () => {
    const event = {
      eventId: "64eac8d9a000000000000001",
      tenantId: "64eac8d9a000000000000002",
      type: "order.paid",
      payload: { orderId: "o-1" },
      attempt: 3,
    };

    await handleWebhook(event);
    expect(deliverWebhook).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        eventId: event.eventId,
        deliveryId: event.eventId,
      }),
    }));
  });
});
