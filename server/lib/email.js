import crypto from "node:crypto";
import { google } from "googleapis";
import {
  GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN, GMAIL_SENDER_EMAIL,
  emailConfigured, isProduction,
} from "../config/env.js";

const gmailOAuthClient = emailConfigured
  ? new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
  : null;
if (gmailOAuthClient) gmailOAuthClient.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN });
const gmailApiClient = gmailOAuthClient ? google.gmail({ version: "v1", auth: gmailOAuthClient }) : null;

// Minimal RFC 2822 multipart/alternative MIME builder. This replaces what
// Nodemailer used to assemble for us: since sending now goes through the
// Gmail REST API (which just wants a base64url "raw" RFC 2822 message, not
// a live SMTP connection), there's no SMTP client library needed at all.
const encodeMimeHeaderWord = (value) => `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;

const base64UrlEncode = (input) =>
  Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const buildMimeMessage = ({ from, to, subject, text, html, idempotencyKey }) => {
  const boundary = `fikarnot_${crypto.randomBytes(16).toString("hex")}`;
  const headerLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeaderWord(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (idempotencyKey) headerLines.push(`X-Idempotency-Key: ${idempotencyKey}`);
  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(String(text || ""), "utf8").toString("base64"),
  ].join("\r\n");
  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(String(html || ""), "utf8").toString("base64"),
  ].join("\r\n");
  const message = [headerLines.join("\r\n"), "", textPart, htmlPart, `--${boundary}--`, ""].join("\r\n");
  return base64UrlEncode(message);
};

const sendTransactionalEmail = async ({ to, subject, html, text, idempotencyKey }) => {
  if (!to) return { sent: false, reason: "missing_recipient" };
  if (!gmailApiClient) {
    if (!isProduction) console.log(`[FikarNot] Email not configured. Would send: ${subject} -> ${to}`);
    return { sent: false, reason: "email_not_configured" };
  }
  try {
    const raw = buildMimeMessage({ from: `FikarNot <${GMAIL_SENDER_EMAIL}>`, to, subject, text, html, idempotencyKey });
    const response = await gmailApiClient.users.messages.send({ userId: "me", requestBody: { raw } });
    return { sent: true, id: response?.data?.id || null };
  } catch (error) {
    console.error("[FikarNot] Email provider request failed", error.message);
    return { sent: false, reason: "provider_unreachable" };
  }
};

export { gmailApiClient, encodeMimeHeaderWord, base64UrlEncode, buildMimeMessage, sendTransactionalEmail };
