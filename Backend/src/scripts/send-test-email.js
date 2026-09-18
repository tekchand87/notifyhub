// One-off script: creates a temp API key and sends a test email event end-to-end
// Usage: node src/scripts/send-test-email.js
import "dotenv/config";
import mongoose from "mongoose";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { apiKey as ApiKeyModel } from "../modules/apiKey/apiKey.models.js";
import { Tenant } from "../modules/tenant/tenant.model.js";

const MONGO_URI = process.env.MONGODB_URI;
const API_BASE  = `http://localhost:${process.env.PORT || 3000}`;

const run = async () => {
  // 1. Connect to MongoDB to create a temp API key
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");

  // 2. Pick the first active tenant
  const tenant = await Tenant.findOne({ status: "active" }).lean();
  if (!tenant) {
    console.error("❌ No active tenant found. Create one via the UI first.");
    process.exit(1);
  }
  console.log(`✅ Using tenant: ${tenant.name} (${tenant._id})`);

  // 3. Generate a fresh raw API key
  const { rawApiKey, keyPrefix } = generateApiKey();
  const keyHash = hashApiKey(rawApiKey);
  const tempKey = await ApiKeyModel.create({
    tenantId: tenant._id,
    name: "temp-test-key",
    keyPrefix,
    keyHash,
    scopes: ["events:write"],
    expiresAt: null,
  });
  console.log(`✅ Temp API key created: ${keyPrefix}… (id: ${tempKey._id})`);

  await mongoose.disconnect();

  // 4. POST the email event
  console.log("\n📤 Sending event to API...");
  const payload = {
    type: "user.welcome",
    channel: "email",
    payload: {
      to: "tekchandyadav45@gmail.com",
      subject: "Hello from NotifyHub",
      text: "This is a test email sent via NotifyHub!",
      html: "<h1>Hello!</h1><p>This is a test email sent via <b>NotifyHub</b>.</p>",
    },
  };

  const res = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": rawApiKey,
      "Idempotency-Key": `test-email-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (res.ok) {
    console.log("✅ Event accepted!");
    console.log(`   eventId : ${json.data.eventId}`);
    console.log(`   status  : ${json.data.status}`);
    console.log("\n⏳ Watch worker logs — email should arrive in seconds.");
  } else {
    console.error(`❌ API error ${res.status}:`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
};

run().catch((err) => {
  console.error("❌ Script failed:", err.message);
  process.exit(1);
});
