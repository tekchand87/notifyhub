import nodemailer from "nodemailer";
import "dotenv/config";

const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true";

if (!process.env.SMTP_HOST) {
  throw new Error("SMTP_HOST is not defined in the environment variables");
}

if (!process.env.SMTP_USER) {
  throw new Error("SMTP_USER is not configured");
}

if (!process.env.SMTP_PASSWORD) {
  throw new Error("SMTP_PASSWORD is not configured");
}

export const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const verifyEmailTransporter = async () => {
  await emailTransporter.verify();

  console.log("SMTP connection verified");
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    throw new Error("Email recipient is required");
  }

  if (!subject) {
    throw new Error("Email subject is required");
  }

  if (!text && !html) {
    throw new Error("Email content is required");
  }

  const info = await emailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });

  return {
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  };
};