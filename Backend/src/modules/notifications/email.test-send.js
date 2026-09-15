// src/modules/notifications/email.test-send.js
// One-off SMTP verification script — run BEFORE end-to-end Kafka testing.
// Usage:
//   TEST_EMAIL=you@example.com node src/modules/notifications/email.test-send.js
//
// Delete or gitignore this file once SMTP is confirmed working.

import "dotenv/config";
import { verifyEmailTransporter, sendEmail } from "./email.service.js";

const run = async () => {
  const to = process.env.TEST_EMAIL;

  if (!to) {
    console.error(
      "ERROR: Set TEST_EMAIL environment variable before running this script.\n" +
      "Example: TEST_EMAIL=you@example.com node src/modules/notifications/email.test-send.js"
    );
    process.exitCode = 1;
    return;
  }

  console.log("─── SMTP Verification ───────────────────────────────────");
  console.log(`Host     : ${process.env.SMTP_HOST}`);
  console.log(`Port     : ${process.env.SMTP_PORT}`);
  console.log(`Secure   : ${process.env.SMTP_SECURE}`);
  console.log(`From     : ${process.env.SMTP_FROM || process.env.SMTP_USER}`);
  console.log(`To       : ${to}`);
  console.log("─────────────────────────────────────────────────────────");

  try {
    // Step 1: verify the transporter can reach the SMTP server
    await verifyEmailTransporter();

    // Step 2: send a real test email
    const result = await sendEmail({
      to,
      subject: "NotifyHub SMTP Test",
      text:
        "This is an automated SMTP verification email from NotifyHub.\n\n" +
        "If you received this, the SMTP channel is working correctly.",
    });

    console.log("\n✅ Email sent successfully!");
    console.log("Message ID :", result.messageId);
    console.log("Response   :", result.response);
    console.log("Accepted   :", result.accepted);

    if (result.rejected?.length) {
      console.warn("Rejected   :", result.rejected);
    }

  } catch (error) {
    console.error("\n❌ SMTP test failed:", error.message);
    process.exitCode = 1;
  }
};

run();
