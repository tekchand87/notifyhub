export const handleWebhook = async (event) => {
console.log(
`[PHASE 6 MOCK] Webhook received ${event.eventId}`
);
return {
success: true,
channel: "webhook",
providerResponse: "mock-webhook-accepted"
};
};