// One-off script: sets tenant webhookUrl and sends a test webhook event end-to-end
// Usage: node src/scripts/send-test-webhook.js
import "dotenv/config";
import mongoose from "mongoose";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { apiKey as ApiKeyModel } from "../modules/apiKey/apiKey.models.js";
import { Tenant } from "../modules/tenant/tenant.model.js";

const MONGO_URI = process.env.MONGODB_URI;
const API_BASE  = `http://localhost:${process.env.PORT || 3000}`;

// Free public echo endpoint — always returns 200 + mirrors request body
const TEST_WEBHOOK_URL = "https://httpbin.org/post";

const run = async () => {
  // 1. Connect to MongoDB
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");

  // 2. Pick the first active tenant
  const tenant = await Tenant.findOneAndUpdate(
    { status: "active" },
    { webhookUrl: TEST_WEBHOOK_URL, webhookSecret: "notifyhub-test-secret" },
    { new: true }
  ).lean();

  if (!tenant) {
    console.error("❌ No active tenant found.");
    process.exit(1);
  }
  console.log(`✅ Tenant: ${tenant.name}`);
  console.log(`✅ webhookUrl set to: ${TEST_WEBHOOK_URL}`);

  // 3. Generate a fresh raw API key
  const { rawApiKey, keyPrefix } = generateApiKey();
  const keyHash = hashApiKey(rawApiKey);
  await ApiKeyModel.create({
    tenantId: tenant._id,
    name: "temp-webhook-test-key",
    keyPrefix,
    keyHash,
    scopes: ["events:write"],
    expiresAt: null,
  });
  console.log(`✅ Temp API key created: ${keyPrefix}…`);

  await mongoose.disconnect();

  // 4. POST the webhook event
  console.log("\n📤 Sending webhook event to API...");
  const payload = {
    type: "order.completed",
    channel: "webhook",
    payload: {
      orderId: "ORD-12345",
      customerId: "CUST-987",
      amount: 1499.99,
      currency: "INR",
      status: "completed",
    },
  };

  const res = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": rawApiKey,
      "Idempotency-Key": `test-webhook-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (res.ok) {
    console.log("✅ Webhook event accepted!");
    console.log(`   eventId : ${json.data.eventId}`);
    console.log(`   status  : ${json.data.status}`);
    console.log(`\n⏳ Watch worker logs — webhook will POST to ${TEST_WEBHOOK_URL} shortly.`);
    console.log("   You can also verify at: https://httpbin.org (any POST echo)");
  } else {
    console.error(`❌ API error ${res.status}:`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
};

run().catch((err) => {
  console.error("❌ Script failed:", err.message);
  process.exit(1);
});
