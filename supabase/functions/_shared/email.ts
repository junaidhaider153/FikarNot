// Transactional email for Edge Functions, sent through the Gmail REST API over
// HTTPS (port 443).
//
// WHY NOT SMTP/nodemailer: Supabase Edge Functions block outbound connections
// on ports 25 and 587, and raw-socket SMTP on Deno is unproven. HTTPS always
// works. (Auth emails — signup/reset — are separate: configure Supabase Auth ->
// SMTP with your Gmail App Password; that runs outside Edge Functions.)
//
// Secrets (supabase secrets set ...):
//   GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN
//   GMAIL_SENDER_EMAIL   (e.g. fikarnotofficial.shop@gmail.com)
//   GMAIL_SENDER_NAME    (optional, default "FikarNot")
//
// Provider-agnostic on purpose: only sendEmail() knows about Gmail.

export type EmailInput = { to: string; subject: string; html: string; text: string; replyTo?: string };
export type EmailResult = { sent: boolean; reason?: string };

const clean = (s: string) =>
  String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64Text = (s: string) => (b64(new TextEncoder().encode(s)).match(/.{1,76}/g) || []).join("\r\n");
const b64url = (s: string) => b64(new TextEncoder().encode(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const id = Deno.env.get("GMAIL_OAUTH_CLIENT_ID");
  const secret = Deno.env.get("GMAIL_OAUTH_CLIENT_SECRET");
  const refresh = Deno.env.get("GMAIL_OAUTH_REFRESH_TOKEN");
  if (!id || !secret || !refresh) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`Google token endpoint returned ${res.status}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3000) * 1000 };
  return cachedToken.value;
}

export function buildMime(input: EmailInput, from: string, fromName: string): string {
  const boundary = `fk_${crypto.randomUUID().replace(/-/g, "")}`;
  const subject = `=?UTF-8?B?${b64(new TextEncoder().encode(clean(input.subject)))}?=`;
  return [
    `From: "${clean(fromName).replace(/"/g, "")}" <${clean(from)}>`,
    `To: ${clean(input.to)}`,
    `Reply-To: ${clean(input.replyTo || from)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Text(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Text(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const from = Deno.env.get("GMAIL_SENDER_EMAIL");
  const fromName = Deno.env.get("GMAIL_SENDER_NAME") || "FikarNot";
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    console.warn(`[email] skipped "${input.subject}": sender not configured or invalid recipient`);
    return { sent: false, reason: "not_configured_or_invalid" };
  }
  try {
    const token = await accessToken();
    if (!token) {
      console.warn(`[email] Gmail OAuth secrets missing; skipped "${input.subject}"`);
      return { sent: false, reason: "not_configured" };
    }
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(buildMime(input, from, fromName)) }),
    });
    if (!res.ok) {
      console.error(`[email] Gmail API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 401) cachedToken = null;
      return { sent: false, reason: `gmail_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed:", e instanceof Error ? e.message : e);
    return { sent: false, reason: "error" };
  }
}

/**
 * Fire-and-forget: a mail problem must NEVER fail or roll back an order.
 * Uses EdgeRuntime.waitUntil so the send finishes after the response is returned.
 */
export function queueEmail(input: EmailInput): void {
  const p = sendEmail(input).catch((e) => console.error("[email] unexpected:", e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}
