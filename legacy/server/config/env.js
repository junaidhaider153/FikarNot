const ALLOWED_ORIGINS = String(process.env.FIKARNOT_FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const FRONTEND_ORIGIN = ALLOWED_ORIGINS[0] || "http://localhost:5173";
const PORT = process.env.PORT || process.env.FIKARNOT_API_PORT || 8787;
const COOKIE_NAME = "fn_session";
const CSRF_COOKIE_NAME = "fn_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const TRUST_PROXY = process.env.FIKARNOT_TRUST_PROXY === "1";

const isProduction = process.env.NODE_ENV === "production";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const MAX_BODY_BYTES = 1_000_000;
const MAX_REGISTER_ATTEMPTS = 6;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const EMAIL_VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_REQUESTS = 5;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESET_REQUESTS = 5;

const shouldSeedDemoData = process.env.FIKARNOT_SEED_DEMO_DATA === "1" || (!isProduction && process.env.FIKARNOT_SEED_DEMO_DATA !== "0");
// Gmail is reached via the Gmail REST API (HTTPS, port 443) rather than SMTP,
// so outbound email keeps working on hosts (e.g. Railway) that restrict or
// don't guarantee outbound SMTP ports. Auth is a Google Cloud OAuth2 client
// (client id/secret) plus a long-lived refresh token obtained once via a
// one-time interactive consent flow for the sending Gmail account.
const GMAIL_OAUTH_CLIENT_ID = String(process.env.GMAIL_OAUTH_CLIENT_ID || "").trim();
const GMAIL_OAUTH_CLIENT_SECRET = String(process.env.GMAIL_OAUTH_CLIENT_SECRET || "").trim();
const GMAIL_OAUTH_REFRESH_TOKEN = String(process.env.GMAIL_OAUTH_REFRESH_TOKEN || "").trim();
const GMAIL_SENDER_EMAIL = String(process.env.GMAIL_SENDER_EMAIL || "").trim();
const APP_ORIGIN = String(process.env.FIKARNOT_APP_URL || FRONTEND_ORIGIN).replace(/\/$/, "");
const API_PUBLIC_ORIGIN = String(process.env.FIKARNOT_API_PUBLIC_URL || "").trim().replace(/\/$/, "");
const PAYFAST_SECRET_WORD = String(process.env.PAYFAST_SECRET_WORD || "").trim();
const MOCK_PAYMENTS_ENABLED = process.env.FIKARNOT_ENABLE_MOCK_PAYMENTS === "1" && !isProduction;
const UPLOADS_PUBLIC_BASE_URL = String(process.env.FIKARNOT_UPLOADS_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

const emailConfigured = !!(GMAIL_OAUTH_CLIENT_ID && GMAIL_OAUTH_CLIENT_SECRET && GMAIL_OAUTH_REFRESH_TOKEN && GMAIL_SENDER_EMAIL);

// google.auth.OAuth2 caches the short-lived access token in memory and
// transparently exchanges the refresh token for a new one when it expires
// or is missing, so no manual token refresh/scheduling is needed here.


const validateProductionStartupConfig = () => {
  if (!isProduction) return;
  const errors = [];
  if (!String(process.env.FIKARNOT_FRONTEND_ORIGIN || "").trim()) errors.push("FIKARNOT_FRONTEND_ORIGIN is required in production.");
  if (!String(process.env.FIKARNOT_APP_URL || "").trim()) errors.push("FIKARNOT_APP_URL is required in production.");
  if (!emailConfigured) errors.push("GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN and GMAIL_SENDER_EMAIL are required in production.");
  const appUrl = String(process.env.FIKARNOT_APP_URL || "").trim();
  if (appUrl && !appUrl.startsWith("https://")) errors.push("FIKARNOT_APP_URL must use HTTPS in production.");
  if (process.env.FIKARNOT_SEED_DEMO_DATA === "1") errors.push("FIKARNOT_SEED_DEMO_DATA must be 0 in production.");
  if (process.env.FIKARNOT_ENABLE_MOCK_PAYMENTS === "1") errors.push("FIKARNOT_ENABLE_MOCK_PAYMENTS must be disabled in production.");
  if (process.env.FIKARNOT_ALLOW_ONLINE_PAYMENTS === "1") {
    if (!String(process.env.PAYFAST_MERCHANT_ID || "").trim()) errors.push("PAYFAST_MERCHANT_ID is required when online payments are enabled.");
    if (!String(process.env.PAYFAST_SECURED_KEY || "").trim()) errors.push("PAYFAST_SECURED_KEY is required when online payments are enabled.");
    if (!String(process.env.PAYFAST_TOKEN_URL || "").trim()) errors.push("PAYFAST_TOKEN_URL is required when online payments are enabled.");
    if (!String(process.env.PAYFAST_CHECKOUT_URL || "").trim()) errors.push("PAYFAST_CHECKOUT_URL is required when online payments are enabled.");
    if (!API_PUBLIC_ORIGIN) errors.push("FIKARNOT_API_PUBLIC_URL is required when online payments are enabled.");
    if (API_PUBLIC_ORIGIN && !API_PUBLIC_ORIGIN.startsWith("https://")) errors.push("FIKARNOT_API_PUBLIC_URL must use HTTPS when online payments are enabled.");
  }
  if (process.env.FIKARNOT_EXPOSE_RESET_LINKS === "1") errors.push("FIKARNOT_EXPOSE_RESET_LINKS must be disabled in production.");
  if (errors.length) throw new Error(`Production configuration is invalid:\n- ${errors.join("\n- ")}`);
};

validateProductionStartupConfig();

export {
  ALLOWED_ORIGINS, FRONTEND_ORIGIN, PORT, COOKIE_NAME, CSRF_COOKIE_NAME, SESSION_TTL_MS, TRUST_PROXY,
  isProduction, LOGIN_WINDOW_MS, MAX_LOGIN_ATTEMPTS, MAX_BODY_BYTES, MAX_REGISTER_ATTEMPTS,
  RESET_TOKEN_TTL_MS, EMAIL_VERIFY_TOKEN_TTL_MS, VERIFY_WINDOW_MS, MAX_VERIFY_REQUESTS,
  RESET_WINDOW_MS, MAX_RESET_REQUESTS, shouldSeedDemoData, GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN, GMAIL_SENDER_EMAIL, APP_ORIGIN,
  API_PUBLIC_ORIGIN, PAYFAST_SECRET_WORD, MOCK_PAYMENTS_ENABLED, UPLOADS_PUBLIC_BASE_URL, emailConfigured,
};
