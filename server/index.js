import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { catalogCategories, catalogProducts } from "./catalogSeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.FIKARNOT_DATA_DIR ? path.resolve(process.env.FIKARNOT_DATA_DIR) : path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const dbPath = path.join(dataDir, "fikarnot.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','editor','admin')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS two_factor_challenges (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user_id ON two_factor_challenges(user_id);
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(user_id);
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
  CREATE TABLE IF NOT EXISTS customer_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cart_json TEXT NOT NULL DEFAULT '[]',
    wishlist_json TEXT NOT NULL DEFAULT '[]',
    recently_viewed_json TEXT NOT NULL DEFAULT '[]',
    comparison_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customer_addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home',
    name TEXT NOT NULL,
    line1 TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);
`);



db.exec(`
  CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    type TEXT NOT NULL CHECK(type IN ('percent','fixed','free_shipping')),
    value REAL NOT NULL DEFAULT 0,
    min_subtotal REAL NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER,
    description TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_address TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT 'card',
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    shipping REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    coupon_json TEXT NOT NULL DEFAULT 'null',
    status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','processing','shipped','delivered','cancelled','return_approved','returned')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    cancelled_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_payment_id TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refunded','partially_refunded')),
    raw_status TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(provider, provider_payment_id)
  );
  CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  CREATE TABLE IF NOT EXISTS payment_proofs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payment_proofs_order_id ON payment_proofs(order_id);
  CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    return_id TEXT REFERENCES return_requests(id) ON DELETE SET NULL,
    payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    currency TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL CHECK(status IN ('pending','processing','refunded','failed')),
    provider_ref TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
  CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0)
  );
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`);

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

ensureColumn("users", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "two_factor_secret", "TEXT");
ensureColumn("orders", "currency", "TEXT NOT NULL DEFAULT 'PKR'");
ensureColumn("orders", "tax", "REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "payment_status", "TEXT NOT NULL DEFAULT 'paid'");
ensureColumn("orders", "courier", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "tracking_number", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "shipped_at", "INTEGER");
ensureColumn("orders", "delivered_at", "INTEGER");
ensureColumn("orders", "shipment_status", "TEXT NOT NULL DEFAULT 'not_created'");
ensureColumn("orders", "tracking_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "shipment_created_at", "INTEGER");
ensureColumn("orders", "invoice_number", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "payment_proof_token_hash", "TEXT");
ensureColumn("orders", "payment_proof_token_expires_at", "INTEGER");
ensureColumn("orders", "updated_at", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
    verified_purchase INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(product_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_support_user_id ON support_tickets(user_id);

  CREATE TABLE IF NOT EXISTS return_requests (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','completed','cancelled')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE(order_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_returns_user_id ON return_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_returns_order_id ON return_requests(order_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, link TEXT NOT NULL DEFAULT '/account',
    order_id TEXT, read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  CREATE TABLE IF NOT EXISTS engagement_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rate_limits (
    scope TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL,
    PRIMARY KEY (scope, bucket_key)
  );
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL UNIQUE,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_assets(created_at DESC);
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#3E8E5A', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE COLLATE NOCASE, category_id TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, stock_threshold INTEGER NOT NULL DEFAULT 10, rating REAL NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '', images_json TEXT NOT NULL DEFAULT '[]', tags_json TEXT NOT NULL DEFAULT '[]', featured INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '', FOREIGN KEY(category_id) REFERENCES categories(id)
  );
  CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
  CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL, previous_stock INTEGER NOT NULL, next_stock INTEGER NOT NULL, change INTEGER NOT NULL, reason TEXT NOT NULL, user_id TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((row) => row.name);
if (!userColumns.includes("email_verified_at")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified_at INTEGER");
}
// One-time migration: accounts that already existed before email verification was introduced
// are trusted so an upgrade does not lock existing customers out. New registrations remain unverified.
const emailVerificationMigration = db.prepare("SELECT value FROM engagement_meta WHERE key='email_verification_v1'").get();
if (!emailVerificationMigration) {
  db.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at, created_at)").run();
  db.prepare("INSERT OR REPLACE INTO engagement_meta(key,value) VALUES ('email_verification_v1','1')").run();
}

const ALLOWED_ORIGINS = String(process.env.FIKARNOT_FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const FRONTEND_ORIGIN = ALLOWED_ORIGINS[0] || "http://localhost:5173";
const port = process.env.PORT || process.env.FIKARNOT_API_PORT || 8787;
const COOKIE_NAME = "fn_session";
const CSRF_COOKIE_NAME = "fn_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const TRUST_PROXY = process.env.FIKARNOT_TRUST_PROXY === "1";
const clientIp = (req) => TRUST_PROXY
  ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim()
  : String(req.socket.remoteAddress || "unknown").trim();

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
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM_EMAIL = String(process.env.RESEND_FROM_EMAIL || "").trim();
const GMAIL_USER = String(process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = String(process.env.GMAIL_APP_PASSWORD || "").trim();
const APP_ORIGIN = String(process.env.FIKARNOT_APP_URL || FRONTEND_ORIGIN).replace(/\/$/, "");
const API_PUBLIC_ORIGIN = String(process.env.FIKARNOT_API_PUBLIC_URL || "").trim().replace(/\/$/, "");
const PAYFAST_SECRET_WORD = String(process.env.PAYFAST_SECRET_WORD || "").trim();
const MOCK_PAYMENTS_ENABLED = process.env.FIKARNOT_ENABLE_MOCK_PAYMENTS === "1" && !isProduction;
const UPLOADS_PUBLIC_BASE_URL = String(process.env.FIKARNOT_UPLOADS_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

const gmailTransporter = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  : null;

const validateProductionStartupConfig = () => {
  if (!isProduction) return;
  const errors = [];
  if (!String(process.env.FIKARNOT_FRONTEND_ORIGIN || "").trim()) errors.push("FIKARNOT_FRONTEND_ORIGIN is required in production.");
  if (!String(process.env.FIKARNOT_APP_URL || "").trim()) errors.push("FIKARNOT_APP_URL is required in production.");
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) errors.push("GMAIL_USER and GMAIL_APP_PASSWORD are required in production.");
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

// Rate-limit counters live in SQLite rather than an in-memory Map. A Map resets
// on every server restart/redeploy (defeating the point of throttling brute-force
// attempts) and can't be shared if this app is ever run as more than one Node
// process — the DB, which is already the single source of truth for everything
// else here, doesn't have either problem.
const checkRateLimit = (scope, bucketKey, { windowMs, max }) => {
  const now = Date.now();
  const row = db.prepare("SELECT * FROM rate_limits WHERE scope=? AND bucket_key=?").get(scope, bucketKey);
  if (!row || now > row.reset_at) {
    db.prepare("INSERT INTO rate_limits (scope,bucket_key,count,reset_at) VALUES (?,?,1,?) ON CONFLICT(scope,bucket_key) DO UPDATE SET count=1,reset_at=excluded.reset_at")
      .run(scope, bucketKey, now + windowMs);
    return { allowed: true };
  }
  if (row.count >= max) return { allowed: false, retryAfterMs: row.reset_at - now };
  db.prepare("UPDATE rate_limits SET count=count+1 WHERE scope=? AND bucket_key=?").run(scope, bucketKey);
  return { allowed: true };
};
// On a successful login, clear that IP's counter so a legitimate user isn't stuck
// half-throttled after a few earlier typos.
const clearRateLimit = (scope, bucketKey) => db.prepare("DELETE FROM rate_limits WHERE scope=? AND bucket_key=?").run(scope, bucketKey);
// Occasionally sweep expired rows so this table doesn't grow forever on a
// long-running server. Cheap: only runs when a limiter is actually consulted.
let lastRateLimitSweep = 0;
const sweepExpiredRateLimits = () => {
  const now = Date.now();
  if (now - lastRateLimitSweep < 60_000) return;
  lastRateLimitSweep = now;
  db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now - 60_000);
};

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const corsHeaders = (req, res) => {
  const requestOrigin = String(req?.headers?.origin || "").replace(/\/$/, "");
  // Checks your dynamic environment variables list directly
  const allowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) 
    ? requestOrigin 
    : FRONTEND_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Authorization, Accept, X-Requested-With");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Vary", "Origin");
};

const send = (req, res, status, payload) => {
  corsHeaders(req, res);
  json(res, status, payload);
};

const sendHtml = (req, res, status, body, { cacheControl = "no-store" } = {}) => {
  corsHeaders(req, res);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
  });
  res.end(body);
};


const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );

const appendSetCookie = (res, cookieStr) => {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) return res.setHeader("Set-Cookie", cookieStr);
  res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
};

// --- CSRF protection (double-submit cookie) --------------------------------
// The session cookie is HttpOnly (JS can't read it), so a malicious site can
// still trigger authenticated cross-origin requests using the browser's
// auto-attached cookie. To block that, every response also carries a second,
// JS-readable token in a separate cookie. The frontend echoes that value back
// as an X-CSRF-Token header on every state-changing request; since a
// cross-origin attacker page cannot read our cookie (browsers enforce
// same-origin on document.cookie) or set a custom header on a simple
// cross-origin form/fetch without triggering CORS, it cannot forge a match.
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const ensureCsrfCookie = (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  let value = cookies[CSRF_COOKIE_NAME];
  if (!value) {
    value = crypto.randomBytes(24).toString("base64url");
    const secure = isProduction ? "; Secure" : "";
    const sameSite = isProduction ? "None" : "Lax";
    appendSetCookie(res, `${CSRF_COOKIE_NAME}=${value}; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
  }
  return value;
};

const verifyCsrf = (req, res, cookieValue) => {
  if (CSRF_SAFE_METHODS.has(req.method)) return true;
  const header = req.headers["x-csrf-token"];
  if (!cookieValue || !header || header !== cookieValue) {
    send(req, res, 403, { error: "CSRF_VALIDATION_FAILED", message: "Your session could not be verified. Please refresh the page and try again." });
    return false;
  }
  return true;
};

const safeUser = (row) => (row ? { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at, emailVerifiedAt: row.email_verified_at || null } : null);
const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const customerStateRow = (row) => ({
  cart: parseJsonArray(row?.cart_json),
  wishlist: parseJsonArray(row?.wishlist_json),
  recentlyViewed: parseJsonArray(row?.recently_viewed_json),
  comparison: parseJsonArray(row?.comparison_json).slice(0, 3),
  addresses: [],
  updatedAt: row?.updated_at || null,
});
const addressRow = (row) => ({
  id: row.id,
  label: row.label,
  name: row.name,
  line1: row.line1,
  city: row.city,
  region: row.region,
  postalCode: row.postal_code,
  country: row.country,
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
const uid = (prefix = "u") => `${prefix}${crypto.randomBytes(8).toString("hex")}`;
const token = () => crypto.randomBytes(32).toString("base64url");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 64);

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = scrypt(password, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
};

const verifyPassword = (password, encoded) => {
  const [algorithm, salt, hex] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scrypt(password, salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};


const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};
const base32Decode = (input) => {
  const cleaned = String(input || "").toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid Base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};
const totpCode = (secret, timestamp = Date.now()) => {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
};
const verifyTotp = (secret, code) => {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (const drift of [-30_000, 0, 30_000]) if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, now + drift)), Buffer.from(normalized))) return true;
  return false;
};
const createTwoFactorChallenge = (userId) => {
  const raw = token();
  const now = Date.now();
  db.prepare("DELETE FROM two_factor_challenges WHERE expires_at<=?").run(now);
  db.prepare("DELETE FROM two_factor_challenges WHERE user_id=?").run(userId);
  db.prepare("INSERT INTO two_factor_challenges(token_hash,user_id,created_at,expires_at,attempts) VALUES (?,?,?,?,0)").run(sha256(raw), userId, now, now + 5 * 60_000);
  return raw;
};
const getTwoFactorChallenge = (raw) => raw ? db.prepare("SELECT * FROM two_factor_challenges WHERE token_hash=? AND expires_at>? AND attempts<5").get(sha256(raw), Date.now()) : null;
const consumeTwoFactorChallenge = (raw) => { const row = getTwoFactorChallenge(raw); if (!row) return null; db.prepare("DELETE FROM two_factor_challenges WHERE token_hash=?").run(sha256(raw)); return row; };
const otpauthUri = (secret, email) => `otpauth://totp/FikarNot:${encodeURIComponent(email)}?secret=${secret}&issuer=FikarNot&algorithm=SHA1&digits=6&period=30`;

const validatePassword = (password) => typeof password === "string" && password.length >= 6;
const validateName = (name) => typeof name === "string" && name.trim().length >= 2;
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

// Checks a password against the Have I Been Pwned breach corpus using the
// k-anonymity range API: only the first 5 chars of the SHA-1 hash are ever sent,
// so the real password/hash never leaves the server. This is a *soft* check —
// on any network error, timeout, or non-2xx response we fail OPEN (allow the
// password through) rather than blocking registration/reset because a third
// party is unreachable.
//
// Disabled by default (opt-in) since it was blocking real customer signups
// whose passwords happened to appear in a breach corpus with no way to
// override it in the UI. Set FIKARNOT_ENABLE_BREACH_CHECK=1 in your
// environment to turn it back on.
const isPasswordPwned = async (password) => {
  if (process.env.FIKARNOT_ENABLE_BREACH_CHECK !== "1") return false;
  try {
    const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" },
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return false;
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [lineSuffix, count] = line.trim().split(":");
      return lineSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.warn("[FikarNot] Breach check unavailable, allowing password:", error.message);
    return false;
  }
};

const ensureSeedUsers = () => {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (Number(existing) > 0) return;

  // Never auto-create well-known demo credentials on a production deploy. If the
  // users table is empty in production, generate one random admin password and
  // print it once to the server log instead of shipping a guessable default.
  if (isProduction) {
    if (process.env.FIKARNOT_SEED_DEMO_USERS === "1") {
      console.warn("[FikarNot] FIKARNOT_SEED_DEMO_USERS=1 in production — seeding well-known demo credentials. Do not leave this set.");
    } else {
      const now = Date.now();
      const email = process.env.FIKARNOT_ADMIN_EMAIL || "admin@fikarnot.shop";
      const password = crypto.randomBytes(12).toString("base64url");
      db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at,email_verified_at) VALUES (?,?,?,?,?,?,?,?)").run(
        uid("u-"), "Admin", normalizeEmail(email), hashPassword(password), "admin", now, now, now,
      );
      console.warn(
        `[FikarNot] No users found. Created a one-time admin account.\n  email: ${normalizeEmail(email)}\n  password: ${password}\nChange this password immediately after first login — it will not be shown again.`,
      );
      return;
    }
  }

  if (!shouldSeedDemoData) return;
  const now = Date.now();
  const seed = [
    { id: "u1", name: "Junaid Haider", email: "junaid@fikarnot.shop", password: "admin123", role: "admin" },
    { id: "u2", name: "FikarNot Editor", email: "editor@fikarnot.shop", password: "editor123", role: "editor" },
    { id: "u3", name: "Urwa", email: "urwa@fikarnot.shop", password: "maya123", role: "customer" },
  ];
  const insert = db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at,email_verified_at) VALUES (?,?,?,?,?,?,?,?)");
  for (const user of seed) insert.run(user.id, user.name, user.email, hashPassword(user.password), user.role, now, now, now);
};
ensureSeedUsers();

const catalogRow = (row) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  categoryId: row.category_id,
  price: Number(row.price),
  stock: Number(row.stock),
  stockThreshold: Number(row.stock_threshold),
  rating: Number(row.rating),
  image: row.image,
  images: JSON.parse(row.images_json || "[]"),
  tags: JSON.parse(row.tags_json || "[]"),
  featured: Boolean(row.featured),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  description: row.description,
});

const categoryRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const seedCatalogIfEmpty = () => {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM products").get().count);
  if (count > 0) return;
  const now = Date.now();
  const insertCategory = db.prepare(
    "INSERT OR IGNORE INTO categories (id,name,description,color,created_at,updated_at) VALUES (?,?,?,?,?,?)",
  );
  for (const c of catalogCategories) insertCategory.run(c.id, c.name, c.description, c.color, c.createdAt || now, now);
  const insertProduct = db.prepare(
    "INSERT OR IGNORE INTO products (id,name,sku,category_id,price,stock,stock_threshold,rating,image,images_json,tags_json,featured,created_at,updated_at,description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  for (const p of catalogProducts)
    insertProduct.run(
      p.id,
      p.name,
      p.sku,
      p.categoryId,
      p.price,
      p.stock,
      p.stockThreshold ?? 10,
      p.rating,
      p.image,
      JSON.stringify(p.images || [p.image]),
      JSON.stringify(p.tags || []),
      p.featured ? 1 : 0,
      p.createdAt || now,
      now,
      p.description || "",
    );
  db.prepare("INSERT OR IGNORE INTO catalog_meta (key,value) VALUES ('seeded','1')").run();
};

// actorId is passed by every caller (the acting admin's user.id) but there's no updated_by
// column or audit-log write yet to record it. Flagging rather than silently dropping the
// parameter, since the intent to track this is already there in the callers.
// eslint-disable-next-line no-unused-vars
const saveCatalogProduct = (p, actorId) => {
  const now = Date.now();
  const sku = String(p.sku || "")
    .trim()
    .toUpperCase();
  if (!sku) throw new Error("SKU is required");
  const name = String(p.name || "").trim();
  const categoryId = String(p.categoryId || "").trim();
  const price = Number(p.price);
  const stock = Number(p.stock);
  const stockThreshold = Number(p.stockThreshold ?? 10);
  if (name.length < 2 || name.length > 160) throw Object.assign(new Error("Product name must be between 2 and 160 characters."), { code: "INVALID_PRODUCT" });
  if (!categoryId || !db.prepare("SELECT id FROM categories WHERE id=?").get(categoryId)) throw Object.assign(new Error("A valid product category is required."), { code: "INVALID_CATEGORY" });
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) throw Object.assign(new Error("Product price is invalid."), { code: "INVALID_PRICE" });
  if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) throw Object.assign(new Error("Product stock is invalid."), { code: "INVALID_STOCK" });
  if (!Number.isFinite(stockThreshold) || stockThreshold < 0 || !Number.isInteger(stockThreshold)) throw Object.assign(new Error("Stock threshold is invalid."), { code: "INVALID_STOCK_THRESHOLD" });
  const duplicate = db.prepare("SELECT id FROM products WHERE sku=? COLLATE NOCASE AND id<>?").get(sku, p.id);
  if (duplicate) {
    const e = new Error("SKU is already in use.");
    e.code = "DUPLICATE_SKU";
    throw e;
  }
  db.prepare(
    `INSERT INTO products (id,name,sku,category_id,price,stock,stock_threshold,rating,image,images_json,tags_json,featured,created_at,updated_at,description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,category_id=excluded.category_id,price=excluded.price,stock=excluded.stock,stock_threshold=excluded.stock_threshold,rating=excluded.rating,image=excluded.image,images_json=excluded.images_json,tags_json=excluded.tags_json,featured=excluded.featured,updated_at=excluded.updated_at,description=excluded.description`,
  ).run(
    p.id,
    name,
    sku,
    categoryId,
    price,
    stock,
    stockThreshold,
    Math.max(0, Math.min(5, Number(p.rating) || 0)),
    String(p.image || ""),
    JSON.stringify(Array.isArray(p.images) && p.images.length ? p.images : [String(p.image || "")]),
    JSON.stringify(Array.isArray(p.tags) ? p.tags : []),
    p.featured ? 1 : 0,
    p.createdAt || now,
    now,
    String(p.description || ""),
  );
  return catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(p.id));
};



const couponSeed = [
  { id: "cp1", code: "WELCOME10", type: "percent", value: 10, minSubtotal: 50, maxUses: 100, usedCount: 0, active: 1, expiresAt: Date.now() + 30 * 864e5, description: "10% off orders over PKR 5,000." },
  { id: "cp2", code: "FREESHIP", type: "free_shipping", value: 0, minSubtotal: 50, maxUses: 0, usedCount: 0, active: 1, expiresAt: Date.now() + 60 * 864e5, description: "Free standard shipping on orders over PKR 5,000." },
  { id: "cp3", code: "SAVE20", type: "fixed", value: 20, minSubtotal: 120, maxUses: 50, usedCount: 0, active: 1, expiresAt: Date.now() + 45 * 864e5, description: "PKR 2,000 off orders over PKR 12,000." },
];

const seedCouponsIfEmpty = () => {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM coupons").get().count);
  if (count > 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO coupons (id,code,type,value,min_subtotal,max_uses,used_count,active,expires_at,description) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const c of couponSeed) insert.run(c.id, c.code, c.type, c.value, c.minSubtotal, c.maxUses, c.usedCount, c.active, c.expiresAt, c.description);
};

const paymentProofDir = path.join(uploadsDir, "payment-proofs");
fs.mkdirSync(paymentProofDir, { recursive: true });
const MAX_PAYMENT_PROOF_BYTES = 3 * 1024 * 1024;

const savePaymentProof = (dataUrl, { orderId, uploadedBy = null, originalName = "" } = {}) => {
  const match = DATA_URL_RE.exec(String(dataUrl || "").trim());
  if (!match) throw Object.assign(new Error("Only JPEG, PNG, WebP, or GIF payment slips are accepted."), { code: "INVALID_PAYMENT_PROOF" });
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_PAYMENT_PROOF_BYTES) throw Object.assign(new Error("Payment slip must be a valid image under 3MB."), { code: "PAYMENT_PROOF_TOO_LARGE" });
  if (!imageMatchesMagicBytes(mimeType, buffer)) throw Object.assign(new Error("The payment slip does not match its declared image type."), { code: "INVALID_PAYMENT_PROOF_CONTENT" });
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const existing = db.prepare("SELECT * FROM payment_proofs WHERE order_id=?").get(orderId);
  if (existing) throw Object.assign(new Error("A payment slip has already been submitted for this order."), { code: "PAYMENT_PROOF_EXISTS" });
  const ext = ALLOWED_IMAGE_TYPES[mimeType];
  const filename = `${uid("proof-")}.${ext}`;
  const filePath = path.join(paymentProofDir, filename);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, buffer, { flag: "wx" });
  fs.renameSync(tempPath, filePath);
  const id = uid("proof-");
  try {
    db.prepare("INSERT INTO payment_proofs (id,order_id,original_name,filename,mime_type,byte_size,sha256,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, orderId, String(originalName || "").slice(0, 255), filename, mimeType, buffer.length, sha256, uploadedBy, Date.now());
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch (err) {}
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") throw Object.assign(new Error("This payment image has already been submitted."), { code: "PAYMENT_PROOF_DUPLICATE" });
    throw error;
  }
  return db.prepare("SELECT * FROM payment_proofs WHERE id=?").get(id);
};

const orderRow = (row, items) => ({
  id: row.id,
  customer: {
    ...(row.user_id ? { userId: row.user_id } : {}),
    name: row.customer_name,
    email: row.customer_email,
    address: row.customer_address,
    paymentMethod: row.payment_method,
  },
  items,
  subtotal: Number(row.subtotal),
  discount: Number(row.discount),
  shipping: Number(row.shipping),
  tax: Number(row.tax || 0),
  total: Number(row.total),
  currency: row.currency || "PKR",
  paymentStatus: row.payment_status || (row.status === "paid" ? "paid" : "pending"),
  paymentMethod: row.payment_method,
  courier: row.courier || "",
  trackingNumber: row.tracking_number || "",
  trackingUrl: row.tracking_url || "",
  shipmentStatus: row.shipment_status || (row.tracking_number ? "shipped" : "not_created"),
  shipmentCreatedAt: row.shipment_created_at || null,
  shippedAt: row.shipped_at || null,
  deliveredAt: row.delivered_at || null,
  invoiceNumber: row.invoice_number || "",
  paymentProof: row.payment_proof_id ? { id: row.payment_proof_id, status: "submitted", originalName: row.payment_proof_original_name || "" } : null,
  coupon: JSON.parse(row.coupon_json || "null"),
  status: row.payment_status === "pending" && ["payfast", "card"].includes(row.payment_method) ? "pending_payment" : row.status,
  createdAt: row.created_at,
  ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
});

const invoiceHtml = (order, items) => {
  const currency = escapeHtml(order.currency || "PKR");
  const money = (value) => `${currency} ${Number(value).toFixed(2)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(order.id)} · FikarNot</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#111}header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #ddd;padding-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:10px;border-bottom:1px solid #eee}th:last-child,td:last-child{text-align:right}.totals{margin:24px 0 0 auto;max-width:320px}.row{display:flex;justify-content:space-between;padding:6px 0}.grand{font-weight:700;font-size:18px;border-top:2px solid #111;margin-top:8px;padding-top:10px}@media print{body{margin:0}.print{display:none}}</style></head><body><header><div><h1 style="margin:0">FikarNot</h1><p>Invoice / receipt</p></div><div><strong>${escapeHtml(order.invoice_number || `INV-${order.id.replace(/^FN-/, "")}`)}</strong><br>Order ${escapeHtml(order.id)}<br>${new Date(order.created_at).toLocaleDateString("en-PK")}</div></header><section style="margin-top:24px"><strong>Bill to</strong><p>${escapeHtml(order.customer_name)}<br>${escapeHtml(order.customer_email)}<br>${escapeHtml(order.customer_address)}</p></section><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(item.product_name)}</td><td>${item.qty}</td><td>${money(item.price)}</td><td>${money(item.price * item.qty)}</td></tr>`).join("")}</tbody></table><div class="totals"><div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div><div class="row"><span>Discount</span><span>−${money(order.discount)}</span></div><div class="row"><span>Shipping</span><span>${money(order.shipping)}</span></div><div class="row"><span>Tax</span><span>${money(order.tax)}</span></div><div class="row grand"><span>Total</span><span>${money(order.total)}</span></div></div><p style="margin-top:32px">Payment: ${escapeHtml(order.payment_method)} · Status: ${escapeHtml(order.payment_status || order.status)}</p><button class="print" onclick="window.print()">Print invoice</button></body></html>`;
};

const listOrders = (user, { limit = 200, offset = 0 } = {}) => {
  const isStaff = ["admin", "editor"].includes(user.role);
  const total = isStaff
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM orders").get().count)
    : Number(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE user_id=?").get(user.id).count);
  const rows = isStaff
    ? db.prepare("SELECT o.*, pp.id AS payment_proof_id, pp.original_name AS payment_proof_original_name FROM orders o LEFT JOIN payment_proofs pp ON pp.order_id=o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?").all(limit, offset)
    : db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(user.id, limit, offset);
  const itemsByOrder = new Map();
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY rowid`).all(...ids);
    for (const item of items) {
      const bucket = itemsByOrder.get(item.order_id) || [];
      bucket.push({ productId: item.product_id, name: item.product_name, price: Number(item.price), qty: Number(item.qty) });
      itemsByOrder.set(item.order_id, bucket);
    }
  }
  const inventoryLog = db.prepare("SELECT * FROM inventory_logs ORDER BY created_at DESC LIMIT 100").all().map((r) => ({
    id: r.id, productId: r.product_id, productName: r.product_name, previousStock: r.previous_stock,
    nextStock: r.next_stock, change: r.change, reason: r.reason, userId: r.user_id, createdAt: r.created_at,
  }));
  return { orders: rows.map((row) => orderRow(row, itemsByOrder.get(row.id) || [])), inventoryLog, total, limit, offset };
};

const nextOrderNumber = () => {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,4) AS INTEGER)) AS max_no FROM orders WHERE id GLOB 'FN-[0-9]*'").get();
  return `FN-${String(Number(row?.max_no || 0) + 1).padStart(4, "0")}`;
};
const nextTicketNumber = () => {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,5) AS INTEGER)) AS max_no FROM support_tickets WHERE id GLOB 'TKT-[0-9]*'").get();
  return `TKT-${String(Number(row?.max_no || 0) + 1).padStart(4, "0")}`;
};

const validateCouponServer = (code, subtotal) => {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return { coupon: null, discount: 0, shippingFree: false };
  const coupon = db.prepare("SELECT * FROM coupons WHERE code=? COLLATE NOCASE").get(normalized);
  if (!coupon) throw Object.assign(new Error("That coupon code is not valid"), { code: "INVALID_COUPON" });
  if (!coupon.active || (coupon.expires_at && coupon.expires_at <= Date.now()) || (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses)) {
    throw Object.assign(new Error("That coupon is expired, inactive, or has reached its usage limit"), { code: "INVALID_COUPON" });
  }
  if (subtotal < Number(coupon.min_subtotal || 0)) throw Object.assign(new Error(`Spend at least ${Number(coupon.min_subtotal).toFixed(2)} to use ${normalized}`), { code: "COUPON_MIN_SUBTOTAL" });
  const shippingFree = coupon.type === "free_shipping";
  let discount = 0;
  if (coupon.type === "percent") discount = Math.min(subtotal, subtotal * Number(coupon.value) / 100);
  else if (coupon.type === "fixed") discount = Math.min(subtotal, Number(coupon.value));
  return { coupon, discount: +discount.toFixed(2), shippingFree };
};


const reviewRow = (row) => ({
  id: row.id, productId: row.product_id, userId: row.user_id, authorName: row.author_name,
  rating: Number(row.rating), title: row.title, body: row.body, status: row.status,
  verifiedPurchase: Boolean(row.verified_purchase), createdAt: row.created_at, updatedAt: row.updated_at,
});
const supportRow = (row) => ({
  id: row.id, userId: row.user_id, name: row.name, email: row.email, subject: row.subject, message: row.message,
  category: row.category, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
});
const returnRow = (row) => ({
  id: row.id, orderId: row.order_id, userId: row.user_id, reason: row.reason, note: row.note,
  status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  refund: row.refund_id ? { id: row.refund_id, amount: Number(row.refund_amount), currency: row.refund_currency, status: row.refund_status, providerRef: row.refund_provider_ref || null, method: row.refund_method || 'manual', note: row.refund_note || '' } : null,
});
const notificationRow = (row) => ({
  id: row.id, type: row.type, title: row.title, message: row.message, link: row.link, orderId: row.order_id || null,
  read: Boolean(row.read), createdAt: row.created_at,
});
const couponRow = (row) => ({
  id: row.id, code: row.code, type: row.type, value: Number(row.value), minSubtotal: Number(row.min_subtotal),
  maxUses: Number(row.max_uses), usedCount: Number(row.used_count), active: Boolean(row.active),
  expiresAt: row.expires_at, description: row.description,
});
const createNotification = (userId, { type, title, message, link = '/account', orderId = null }) => {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (id,user_id,type,title,message,link,order_id,read,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(uid('n-'), userId, type, title, message, link, orderId, 0, Date.now());
};
const notificationsFor = (userId) => db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId).map(notificationRow);
const auditLog = (actorUserId, action, entityType, entityId = null, details = {}) => {
  db.prepare('INSERT INTO audit_logs (id,actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uid('audit-'), actorUserId || null, action, entityType, entityId, JSON.stringify(details), Date.now());
};
// Reviews/support/returns are still consumed as full client-side lists today (product
// review averages, admin tables), so we keep a generous cap rather than a small page —
// see the /api/catalog comment above for the same trade-off, applied here too.
const ENGAGEMENT_LIST_CAP = 2000;
const listEngagement = (user) => ({
  reviews: db.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT ?').all(ENGAGEMENT_LIST_CAP).map(reviewRow),
  coupons: db.prepare(`SELECT * FROM coupons ${['admin','editor'].includes(user.role) ? '' : 'WHERE active=1 AND (expires_at IS NULL OR expires_at>?)'} ORDER BY code LIMIT ?`).all(...(['admin','editor'].includes(user.role) ? [] : [Date.now()]), ENGAGEMENT_LIST_CAP).map(couponRow),
  supportTickets: db.prepare(`SELECT * FROM support_tickets ${['admin','editor'].includes(user.role) ? '' : 'WHERE user_id=?'} ORDER BY updated_at DESC LIMIT ?`).all(...(['admin','editor'].includes(user.role) ? [] : [user.id]), ENGAGEMENT_LIST_CAP).map(supportRow),
  returnRequests: db.prepare(`SELECT * FROM return_requests ${['admin','editor'].includes(user.role) ? '' : 'WHERE user_id=?'} ORDER BY updated_at DESC LIMIT ?`).all(...(['admin','editor'].includes(user.role) ? [] : [user.id]), ENGAGEMENT_LIST_CAP).map(returnRow),
  notifications: notificationsFor(user.id),
});

const DEFAULT_SITE_SETTINGS = {
  storeName: "FikarNot",
  supportEmail: "support@fikarnot.shop",
  heroKicker: "Curated essentials · Free shipping over PKR 5,000",
  heroEyebrow: "FikarNot — objects for the everyday",
  heroTitle: "Everyday essentials,",
  heroHighlight: "beautifully chosen.",
  heroSubtitle: "Discover a refined mix of tech, desk and everyday carry — selected for utility, character and the way they fit into real life.",
  heroSticker: "NEW SEASON DROP",
  heroImage: "",
  heroImages: "[]",
  logoUrl: "",
  navLinks: "[]",
  announcement: "Free shipping over PKR 5,000 · 30-day returns",
  aboutTitle: "Thoughtful things for everyday life.",
  aboutIntro: "FikarNot is a curated e-commerce project built around a calmer, more considered way to discover useful products.",
  aboutBody: "FikarNot brings together everyday technology, desk essentials and carry goods with an emphasis on clear information, practical value and a pleasant shopping experience.",
  whatsappNumber: "923709072688",
  instagramUrl: "",
  facebookUrl: "",
  metaTitle: "FikarNot — Everyday essentials, beautifully chosen.",
  metaDescription: "Discover a refined mix of tech, desk and everyday carry at FikarNot.",
  currency: "PKR",
  currencyLocale: "en-PK",
  freeShippingThreshold: "5000",
  shippingFlatRate: "500",
  taxRate: "0",
  taxLabel: "GST",
  allowCod: "1",
  allowOnlinePayments: "0",
  allowManualPayments: "1",
  jazzcashNumber: "923709072688",
  easypaisaNumber: "923709072688",
  bankName: "",
  bankAccountTitle: "",
  bankAccountNumber: "",
  bankIban: "",
  bankInstructions: "",
  privacyPolicy: "FikarNot stores only the information required to operate accounts, orders, support and delivery. Payment credentials are handled by the payment provider and are not stored by FikarNot.",
  termsOfService: "Use of FikarNot is subject to applicable laws. Product descriptions, prices, availability and delivery estimates may change before an order is accepted.",
  shippingPolicy: "Orders are processed after successful payment or COD confirmation. Shipping thresholds, rates and delivery windows are controlled by the current site settings and may vary by destination.",
  returnPolicy: "Eligible delivered orders may be requested for return within 30 days. Approved returns are inspected before completion and any eligible refund is issued through the original payment method.",
};

const getSiteSettings = () => {
  const rows = db.prepare("SELECT key,value FROM site_settings").all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULT_SITE_SETTINGS, ...stored };
};

const getCommerceConfig = () => {
  const settings = getSiteSettings();
  const currency = String(settings.currency || "PKR").toUpperCase();
  const currencyLocale = String(settings.currencyLocale || "en-PK");
  const freeShippingThreshold = Math.max(0, Number(settings.freeShippingThreshold) || 0);
  const shippingFlatRate = Math.max(0, Number(settings.shippingFlatRate) || 0);
  const taxRate = Math.max(0, Math.min(100, Number(settings.taxRate) || 0));
  const payFastConfigured = Boolean(
    String(process.env.PAYFAST_MERCHANT_ID || "").trim() &&
    String(process.env.PAYFAST_SECURED_KEY || "").trim() &&
    String(process.env.PAYFAST_TOKEN_URL || "").trim() &&
    String(process.env.PAYFAST_CHECKOUT_URL || "").trim() &&
    API_PUBLIC_ORIGIN,
  );
  const onlinePaymentsRequested = String(settings.allowOnlinePayments) === "1" || process.env.FIKARNOT_ALLOW_ONLINE_PAYMENTS === "1";
  const allowManualPayments = String(settings.allowManualPayments) !== "0";
  const manualPaymentDetails = {
    jazzcashNumber: String(settings.jazzcashNumber || ""),
    easypaisaNumber: String(settings.easypaisaNumber || ""),
    bankName: String(settings.bankName || ""),
    bankAccountTitle: String(settings.bankAccountTitle || ""),
    bankAccountNumber: String(settings.bankAccountNumber || ""),
    bankIban: String(settings.bankIban || ""),
    bankInstructions: String(settings.bankInstructions || ""),
  };
  return { currency, currencyLocale, freeShippingThreshold, shippingFlatRate, taxRate, taxLabel: String(settings.taxLabel || "Tax"), allowCod: String(settings.allowCod) !== "0", allowOnlinePayments: onlinePaymentsRequested && payFastConfigured, allowManualPayments, manualPaymentDetails };
};

const seedSiteSettingsIfEmpty = () => {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM site_settings").get().count);
  if (count > 0) return;
  const now = Date.now();
  const insert = db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES (?,?,?,NULL)");
  for (const [key, value] of Object.entries(DEFAULT_SITE_SETTINGS)) insert.run(key, String(value), now);
};
seedSiteSettingsIfEmpty();

const seedCatalog = () => { if (shouldSeedDemoData) seedCatalogIfEmpty(); };
seedCatalog();
if (shouldSeedDemoData) seedCouponsIfEmpty();

const createSession = (userId) => {
  const raw = token();
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(
    sha256(raw),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return raw;
};

const setSessionCookie = (res, rawToken) => {
  const secure = isProduction ? "; Secure" : "";
  const sameSite = isProduction ? "None" : "Lax";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
  );
};

const clearSessionCookie = (res) => {
  const secure = isProduction ? "; Secure" : "";
  const sameSite = isProduction ? "None" : "Lax";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`);
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);

const reportOperationalError = async (error, req) => {
  const endpoint = String(process.env.FIKARNOT_ERROR_WEBHOOK_URL || "").trim();
  if (!endpoint) return;
  try {
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.FIKARNOT_ERROR_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.FIKARNOT_ERROR_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ service: "fikarnot-api", timestamp: new Date().toISOString(), method: req.method, path: new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname, error: String(error?.message || error), stack: isProduction ? undefined : String(error?.stack || "") }) });
  } catch (reportError) {
    console.warn("[FikarNot] Error webhook unavailable:", reportError.message);
  }
};

const sendTransactionalEmail = async ({ to, subject, html, text, idempotencyKey }) => {
  if (!to) return { sent: false, reason: "missing_recipient" };
  if (!gmailTransporter) {
    if (!isProduction) console.log(`[FikarNot] Email not configured. Would send: ${subject} -> ${to}`);
    return { sent: false, reason: "email_not_configured" };
  }
  try {
    const info = await gmailTransporter.sendMail({
      from: `FikarNot <${GMAIL_USER}>`,
      to,
      subject,
      html,
      text,
      headers: idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : undefined,
    });
    return { sent: true, id: info?.messageId || null };
  } catch (error) {
    console.error("[FikarNot] Email provider request failed", error.message);
    return { sent: false, reason: "provider_unreachable" };
  }
};

const sendWelcomeEmail = async (user) => sendTransactionalEmail({
  to: user.email,
  subject: "Welcome to FikarNot",
  html: `<div><h1>Welcome to FikarNot, ${escapeHtml(user.name)}</h1><p>Your account is ready. You can now browse products, save favourites and manage your orders from your account.</p><p><a href="${APP_ORIGIN}/account">Open your FikarNot account</a></p></div>`,
  text: `Welcome to FikarNot, ${user.name}. Your account is ready. Open ${APP_ORIGIN}/account to get started.`,
  idempotencyKey: `welcome-user/${user.id}`,
});

const sendPasswordResetEmail = async (user, resetUrl) => sendTransactionalEmail({
  to: user.email,
  subject: "Reset your FikarNot password",
  html: `<div><h1>Password reset</h1><p>Hi ${escapeHtml(user.name)}, we received a request to reset your FikarNot password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes and can only be used once.</p></div>`,
  text: `Reset your FikarNot password: ${resetUrl}\nThis link expires in 30 minutes and can only be used once.`,
  idempotencyKey: `password-reset/${user.id}/${sha256(resetUrl).slice(0, 12)}`,
});

const sendOrderConfirmationEmail = async (order, items) => {
  const pendingManual = ["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method) && order.payment_status === "pending";
  const subject = pendingManual ? `FikarNot order ${order.id} received — payment pending` : `FikarNot order ${order.id} confirmed`;
  const lead = pendingManual ? "Your order has been received and is awaiting payment verification." : "Your order has been received.";
  return sendTransactionalEmail({
    to: order.customer_email,
    subject,
    html: `<div><h1>Thanks for your order</h1><p>${lead} Order <strong>${escapeHtml(order.id)}</strong>.</p><ul>${items.map((item) => `<li>${escapeHtml(item.name)} × ${item.qty} — ${escapeHtml(order.currency || "PKR")} ${Number(item.price * item.qty).toFixed(2)}</li>`).join("")}</ul><p><strong>Total: ${escapeHtml(order.currency || "PKR")} ${Number(order.total).toFixed(2)}</strong></p>${pendingManual ? '<p>We will verify your payment proof before preparing the order.</p>' : ''}<p><a href="${APP_ORIGIN}/account">View your orders</a></p></div>`,
    text: `${pendingManual ? `Your FikarNot order ${order.id} has been received and is awaiting payment verification.` : `Your FikarNot order ${order.id} is confirmed.`} Total: ${order.currency || "PKR"} ${Number(order.total).toFixed(2)}. View orders at ${APP_ORIGIN}/account.`,
    idempotencyKey: `order-confirmation/${order.id}`,
  });
};

const sendReturnStatusEmail = async (order, request, status) => {
  const labels = { requested: "Your return request was received", approved: "Your return request was approved", rejected: "Your return request was declined", completed: "Your return has been completed", cancelled: "Your return request was cancelled" };
  const subject = labels[status] || `Return update for ${order.id}`;
  return sendTransactionalEmail({
    to: order.customer_email,
    subject: `${subject} · FikarNot`,
    html: `<div><h1>${escapeHtml(subject)}</h1><p>Return request <strong>${escapeHtml(request.id)}</strong> for order <strong>${escapeHtml(order.id)}</strong> is now <strong>${escapeHtml(status)}</strong>.</p><p><a href="${APP_ORIGIN}/account">View your order</a></p></div>`,
    text: `Return request ${request.id} for order ${order.id} is now ${status}. View your order at ${APP_ORIGIN}/account.`,
    idempotencyKey: `return-status/${request.id}/${status}/${request.updated_at || Date.now()}`,
  });
};

const sendOrderStatusEmail = async (order, status) => {
  const labels = { shipped: "Your order is on the way", delivered: "Your order has been delivered", cancelled: "Your order was cancelled" };
  const subject = labels[status] || `Order ${order.id} updated`;
  const tracking = order.tracking_number ? `<p><strong>Courier:</strong> ${escapeHtml(order.courier || "—")}<br><strong>Tracking:</strong> ${escapeHtml(order.tracking_number)}${order.tracking_url ? `<br><a href="${escapeHtml(order.tracking_url)}">Track shipment</a>` : ""}</p>` : "";
  return sendTransactionalEmail({
    to: order.customer_email,
    subject: `${subject} · FikarNot`,
    html: `<div><h1>${escapeHtml(subject)}</h1><p>Order <strong>${escapeHtml(order.id)}</strong> is now <strong>${escapeHtml(status)}</strong>.</p>${tracking}<p><a href="${APP_ORIGIN}/account">View your order</a></p></div>`,
    text: `Your FikarNot order ${order.id} is now ${status}.${order.tracking_number ? ` Courier: ${order.courier || ""}. Tracking: ${order.tracking_number}.${order.tracking_url ? ` Track shipment: ${order.tracking_url}.` : ""}` : ""} View your order at ${APP_ORIGIN}/account.`,
    idempotencyKey: `order-status/${order.id}/${status}/${order.updated_at || order.created_at}`,
  });
};


const createEmailVerificationToken = (userId) => {
  const raw = token();
  const now = Date.now();
  db.prepare("DELETE FROM email_verification_tokens WHERE expires_at <= ? OR used_at IS NOT NULL").run(now);
  db.prepare("DELETE FROM email_verification_tokens WHERE user_id=?").run(userId);
  db.prepare("INSERT INTO email_verification_tokens (token_hash,user_id,created_at,expires_at,used_at) VALUES (?,?,?,?,NULL)").run(sha256(raw), userId, now, now + EMAIL_VERIFY_TOKEN_TTL_MS);
  return raw;
};

const getEmailVerificationToken = (rawToken) => db
  .prepare("SELECT * FROM email_verification_tokens WHERE token_hash=? AND expires_at>? AND used_at IS NULL")
  .get(sha256(rawToken), Date.now());

const consumeEmailVerificationToken = (rawToken) => {
  const row = getEmailVerificationToken(rawToken);
  if (!row) return null;
  db.prepare("UPDATE email_verification_tokens SET used_at=? WHERE token_hash=?").run(Date.now(), sha256(rawToken));
  return row;
};

const sendVerificationEmail = async (user, verifyUrl) => sendTransactionalEmail({
  to: user.email,
  subject: "Verify your FikarNot email",
  html: `<div><h1>Verify your FikarNot email</h1><p>Hi ${escapeHtml(user.name)}, please verify your email address to finish setting up your account.</p><p><a href="${verifyUrl}">Verify my email</a></p><p>This link expires in 24 hours and can only be used once.</p></div>`,
  text: `Verify your FikarNot email: ${verifyUrl}\nThis link expires in 24 hours and can only be used once.`,
  idempotencyKey: `verify-email/${user.id}/${sha256(verifyUrl).slice(0, 12)}`,
});

const createPasswordResetToken = (userId) => {
  const raw = token();
  const now = Date.now();
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL").run(now);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").run(userId);
  db.prepare("INSERT INTO password_reset_tokens (token_hash,user_id,created_at,expires_at,used_at) VALUES (?,?,?,?,NULL)").run(
    sha256(raw),
    userId,
    now,
    now + RESET_TOKEN_TTL_MS,
  );
  return raw;
};

const getPasswordResetToken = (rawToken) => {
  if (!rawToken) return null;
  return (
    db
      .prepare(`SELECT * FROM password_reset_tokens WHERE token_hash=? AND expires_at>? AND used_at IS NULL`)
      .get(sha256(rawToken), Date.now()) || null
  );
};

const consumePasswordResetToken = (rawToken) => {
  const row = getPasswordResetToken(rawToken);
  if (!row) return null;
  db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?").run(Date.now(), sha256(rawToken));
  return row;
};

const _buildDevResetUrl = (req, rawToken) => {
  // Two independent conditions must hold before we ever put a live, unhashed
  // reset token in an HTTP response body: we must not be in production, AND
  // the operator must have explicitly opted in. Relying on NODE_ENV alone means
  // a misconfigured deploy (NODE_ENV unset) silently leaks account-takeover
  // tokens to anyone who knows a registered email address.
  if (isProduction) return null;
  if (process.env.FIKARNOT_EXPOSE_RESET_LINKS !== "1") return null;
  const origin = FRONTEND_ORIGIN || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost"}`;
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
};

const getSessionUser = (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  const row = db
    .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`)
    .get(sha256(raw), Date.now());
  return row || null;
};

const readRawBody = (req, maxBytes = 1_000_000) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Request body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const readBody = (req, maxBytes = 1_000_000) =>
  new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Request body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

// --- Image upload support -------------------------------------------------
// Product images arrive from the browser as compressed data: URLs. Rather than
// storing that base64 text inline in the products table (which bloats every
// /api/catalog response and blows past the JSON body-size limit for multi-image
// products), we decode them once here and persist plain files on disk, storing
// only the resulting /uploads/<file> URL in the database.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB decoded, generous headroom over the 4MB client-side cap
const ALLOWED_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=]+)$/;

const mediaRow = (row, usageCount = 0) => ({
  id: row.id,
  filename: row.filename,
  originalName: row.original_name,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  sha256: row.sha256,
  url: row.url,
  uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at,
  usageCount: Number(usageCount),
});

const imageMatchesMagicBytes = (mimeType, buffer) => {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
};

const saveUploadedImage = (dataUrl, { uploadedBy = null, originalName = "" } = {}) => {
  const match = DATA_URL_RE.exec(String(dataUrl || "").trim());
  if (!match) {
    throw Object.assign(new Error("Only JPEG, PNG, WebP, or GIF images are accepted."), { code: "INVALID_IMAGE" });
  }
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("Image is too large. Please use a file under 8MB."), { code: "IMAGE_TOO_LARGE" });
  }
  if (!imageMatchesMagicBytes(mimeType, buffer)) {
    throw Object.assign(new Error("The uploaded file does not match its declared image type."), { code: "INVALID_IMAGE_CONTENT" });
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const existing = db.prepare("SELECT * FROM media_assets WHERE sha256=?").get(sha256);
  if (existing) return mediaRow(existing);
  const ext = ALLOWED_IMAGE_TYPES[mimeType];
  const filename = `${uid("img-")}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, buffer, { flag: "wx" });
  fs.renameSync(tempPath, filePath);
  const now = Date.now();
  const id = uid("media-");
  const url = `${UPLOADS_PUBLIC_BASE_URL || ""}/uploads/${filename}`;
  try {
    db.prepare("INSERT INTO media_assets (id,filename,original_name,mime_type,byte_size,sha256,url,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, filename, String(originalName || "").slice(0, 255), mimeType, buffer.length, sha256, url, uploadedBy, now);
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch (err) {}
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const duplicate = db.prepare("SELECT * FROM media_assets WHERE sha256=?").get(sha256);
      if (duplicate) return mediaRow(duplicate);
    }
    throw error;
  }
  return mediaRow(db.prepare("SELECT * FROM media_assets WHERE id=?").get(id));
};

const syncExistingMediaFiles = () => {
  let files = [];
  try { files = fs.readdirSync(uploadsDir); } catch { return; }
  const insert = db.prepare("INSERT OR IGNORE INTO media_assets (id,filename,original_name,mime_type,byte_size,sha256,url,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const mimeType = IMAGE_CONTENT_TYPES[ext];
    if (!mimeType || filename.includes(".tmp-")) continue;
    const filePath = path.join(uploadsDir, path.basename(filename));
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_UPLOAD_BYTES) continue;
      const buffer = fs.readFileSync(filePath);
      if (!imageMatchesMagicBytes(mimeType, buffer)) continue;
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const existing = db.prepare("SELECT filename FROM media_assets WHERE sha256=?").get(sha256);
      if (existing && existing.filename !== filename) {
        try { fs.unlinkSync(filePath); } catch (err) {}
        continue;
      }
      const url = `${UPLOADS_PUBLIC_BASE_URL || ""}/uploads/${filename}`;
      insert.run(uid("media-"), filename, filename, mimeType, buffer.length, sha256, url, null, Math.floor(stat.mtimeMs) || Date.now());
    } catch {
      // A single unreadable legacy file should not prevent the server from starting.
    }
  }
};

const mediaUsageCount = (url) => {
  const products = db.prepare("SELECT images_json, image FROM products").all();
  let count = 0;
  for (const row of products) {
    if (row.image === url) count += 1;
    let images = [];
    try { images = JSON.parse(row.images_json || "[]"); } catch (err) {}
    count += images.filter((item) => item === url).length;
  }
  const setting = db.prepare("SELECT COUNT(*) AS count FROM site_settings WHERE value=?").get(url);
  count += Number(setting.count);
  return count;
};

const deleteMediaAsset = (id) => {
  const row = db.prepare("SELECT * FROM media_assets WHERE id=?").get(id);
  if (!row) return { missing: true };
  const usageCount = mediaUsageCount(row.url);
  if (usageCount > 0) {
    return { blocked: true, usageCount };
  }
  const filePath = path.join(uploadsDir, path.basename(row.filename));
  try { fs.unlinkSync(filePath); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  db.prepare("DELETE FROM media_assets WHERE id=?").run(id);
  return { deleted: true };
};

const IMAGE_CONTENT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

syncExistingMediaFiles();

const serveUploadedFile = (req, res, pathname) => {
  const filename = path.basename(decodeURIComponent(pathname.slice("/uploads/".length)));
  // path.basename strips any ../ traversal attempts, so filename can only refer to a file directly inside uploadsDir
  const filePath = path.join(uploadsDir, filename);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      corsHeaders(req, res);
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND", message: "Image not found." }));
      return;
    }
    corsHeaders(req, res);
    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, {
      "Content-Type": IMAGE_CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
};

const requireUser = (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    send(req, res, 401, { error: "AUTH_REQUIRED", message: "Authentication required." });
    return null;
  }
  return user;
};

// Parses ?limit=&offset= for list endpoints. Defaults are generous enough that
// normal-sized stores never notice pagination is happening, but a hard ceiling
// (maxLimit) prevents a single request from pulling an unbounded number of rows
// as the table grows. Returned alongside `total` on each response so a future
// paginated UI can page through the rest without another API change.
const parsePagination = (url, { defaultLimit = 200, maxLimit = 500 } = {}) => {
  const rawLimit = Number(url.searchParams.get("limit"));
  const rawOffset = Number(url.searchParams.get("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(maxLimit, Math.floor(rawLimit)) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
};

const parseCatalogQuery = (url) => {
  const hasCatalogQuery = ["q", "category", "stock", "rating", "maxPrice", "sort", "limit", "offset"].some((key) => url.searchParams.has(key));
  const { limit, offset } = hasCatalogQuery
    ? parsePagination(url, { defaultLimit: 24, maxLimit: 100 })
    : parsePagination(url, { defaultLimit: 2000, maxLimit: 5000 });
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
  const category = String(url.searchParams.get("category") || "").trim();
  const inStock = url.searchParams.get("stock") === "1";
  const ratingValue = Number(url.searchParams.get("rating"));
  const minRating = Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0;
  const maxPriceParam = url.searchParams.get("maxPrice");
  const maxPriceValue = Number(maxPriceParam);
  const maxPrice = maxPriceParam !== null && Number.isFinite(maxPriceValue) && maxPriceValue >= 0 ? Math.min(1_000_000, maxPriceValue) : null;
  const sortOptions = new Set(["featured", "newest", "rating", "price-asc", "price-desc", "name"]);
  const sort = sortOptions.has(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "featured";
  return { limit, offset, q, category, inStock, minRating, maxPrice, sort };
};

const catalogSortSql = {
  featured: "featured DESC, rating DESC, created_at DESC",
  newest: "created_at DESC",
  rating: "rating DESC, created_at DESC",
  "price-asc": "price ASC, created_at DESC",
  "price-desc": "price DESC, created_at DESC",
  name: "name COLLATE NOCASE ASC, created_at DESC",
};

const catalogWhere = ({ q, category, inStock, minRating, maxPrice }) => {
  const clauses = [];
  const args = [];
  if (q) {
    const pattern = `%${q}%`;
    clauses.push("(name LIKE ? OR description LIKE ? OR sku LIKE ? OR tags_json LIKE ?)");
    args.push(pattern, pattern, pattern, pattern);
  }
  if (category && category !== "all") { clauses.push("category_id=?"); args.push(category); }
  if (inStock) clauses.push("stock>0");
  if (minRating > 0) { clauses.push("rating>=?"); args.push(minRating); }
  if (maxPrice !== null) { clauses.push("price<=?"); args.push(maxPrice); }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
};

const server = http.createServer(async (req, res) => {
  corsHeaders(req, res);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("X-XSS-Protection", "0");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
    return serveUploadedFile(req, res, url.pathname);
  }

  const isPaymentWebhook = req.method === "POST" && url.pathname === "/api/payments/webhook/payfast";
  const csrfCookieValue = ensureCsrfCookie(req, res);
  if (!isPaymentWebhook && !verifyCsrf(req, res, csrfCookieValue)) return;

  try {
    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      const siteUrl = (process.env.SITE_URL || APP_ORIGIN).replace(/\/$/, "");
      const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      const categories = db.prepare("SELECT id FROM categories ORDER BY name").all();
      const products = db.prepare("SELECT id,updated_at FROM products ORDER BY updated_at DESC").all();
      const today = new Date().toISOString().slice(0, 10);
      const urls = [
        { loc: "/", priority: "1.0", lastmod: today },
        { loc: "/products", priority: "0.9", lastmod: today },
        ...categories.map((c) => ({ loc: `/products?cat=${encodeURIComponent(c.id)}`, priority: "0.7", lastmod: today })),
        ...products.map((p) => ({ loc: `/product/${encodeURIComponent(p.id)}`, priority: "0.8", lastmod: new Date(p.updated_at || Date.now()).toISOString().slice(0, 10) })),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url>\n    <loc>${xmlEscape(`${siteUrl}${item.loc}`)}</loc>\n    <lastmod>${item.lastmod}</lastmod>\n    <priority>${item.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" });
      res.end(xml);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      try {
        const row = db.prepare("SELECT 1 AS ok").get();
        if (!row?.ok) throw new Error("Database health check failed.");
        send(req, res, 200, { ok: true, service: "FikarNot API", database: "ok", timestamp: new Date().toISOString() });
      } catch (error) {
        send(req, res, 503, { ok: false, service: "FikarNot API", database: "unavailable", message: error.message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getSessionUser(req);
      send(req, res, 200, { authenticated: Boolean(user), user: safeUser(user) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const ip = clientIp(req);
      sweepExpiredRateLimits();
      const limitCheck = checkRateLimit("register", ip, { windowMs: LOGIN_WINDOW_MS, max: MAX_REGISTER_ATTEMPTS });
      if (!limitCheck.allowed) {
        return send(req, res, 429, { error: "TOO_MANY_ATTEMPTS", message: "Too many accounts created from this network. Please try again later." });
      }
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      if (!validateName(name)) return send(req, res, 400, { error: "INVALID_NAME", message: "Name must be at least 2 characters." });
      if (!validateEmail(email)) return send(req, res, 400, { error: "INVALID_EMAIL", message: "Enter a valid email address." });
      if (!validatePassword(password))
        return send(req, res, 400, { error: "WEAK_PASSWORD", message: "Password must be at least 6 characters." });
      if (await isPasswordPwned(password))
        return send(req, res, 400, { error: "PASSWORD_COMPROMISED", message: "That password has appeared in a known data breach. Please choose a different one." });
      const exists = db.prepare("SELECT id FROM users WHERE email=?").get(email);
      if (exists) return send(req, res, 409, { error: "EMAIL_IN_USE", message: "Email is already registered." });
      const id = uid();
      const now = Date.now();
      db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at,email_verified_at) VALUES (?,?,?,?,?,?,?,NULL)").run(
        id,
        name,
        email,
        hashPassword(password),
        "customer",
        now,
        now,
      );
      const createdUser = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      const rawVerifyToken = createEmailVerificationToken(id);
      const verifyUrl = `${APP_ORIGIN}/verify-email?token=${encodeURIComponent(rawVerifyToken)}`;
      void sendWelcomeEmail(createdUser);
      void sendVerificationEmail(createdUser, verifyUrl);
      const response = { user: safeUser(createdUser), requiresVerification: true };
      if (!isProduction && !gmailTransporter) response.devVerificationUrl = verifyUrl;
      send(req, res, 201, response);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const ip = clientIp(req);
      sweepExpiredRateLimits();
      const limitCheck = checkRateLimit("login", ip, { windowMs: LOGIN_WINDOW_MS, max: MAX_LOGIN_ATTEMPTS });
      if (!limitCheck.allowed) {
        return send(req, res, 429, { error: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Please try again later." });
      }
      const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return send(req, res, 401, { error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      }
      if (!user.email_verified_at) {
        return send(req, res, 403, { error: "EMAIL_NOT_VERIFIED", message: "Please verify your email before signing in." });
      }
      if (["admin", "editor"].includes(user.role) && Boolean(user.two_factor_enabled)) {
        const code = String(body.totp || "").replace(/\s+/g, "");
        if (!verifyTotp(user.two_factor_secret, code)) {
          return send(req, res, 401, { error: "TWO_FACTOR_REQUIRED", message: "Enter the 6-digit authenticator code." });
        }
      }
      clearRateLimit("login", ip);
      const session = createSession(user.id);
      setSessionCookie(res, session);
      send(req, res, 200, { user: safeUser(user) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/verify-email") {
      const rawToken = url.searchParams.get("token") || "";
      const row = getEmailVerificationToken(rawToken);
      if (!row) return send(req, res, 400, { error: "INVALID_VERIFICATION_TOKEN", message: "This verification link is invalid, expired, or already used." });
      return send(req, res, 200, { valid: true, expiresAt: row.expires_at });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/verify-email") {
      const body = await readBody(req);
      const rawToken = String(body.token || "");
      const row = consumeEmailVerificationToken(rawToken);
      if (!row) return send(req, res, 400, { error: "INVALID_VERIFICATION_TOKEN", message: "This verification link is invalid, expired, or already used." });
      const now = Date.now();
      db.prepare("UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?").run(now, now, row.user_id);
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
      const session = createSession(row.user_id);
      setSessionCookie(res, session);
      return send(req, res, 200, { verified: true, user: safeUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/resend-verification") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const ip = clientIp(req);
      sweepExpiredRateLimits();
      const limitCheck = checkRateLimit("verify", ip, { windowMs: VERIFY_WINDOW_MS, max: MAX_VERIFY_REQUESTS });
      if (!limitCheck.allowed) return send(req, res, 429, { error: "TOO_MANY_VERIFICATION_REQUESTS", message: "Too many verification requests. Please try again later." });
      const user = validateEmail(email) ? db.prepare("SELECT * FROM users WHERE email=?").get(email) : null;
      let verificationUrl = null;
      if (user && !user.email_verified_at) {
        const rawToken = createEmailVerificationToken(user.id);
        verificationUrl = `${APP_ORIGIN}/verify-email?token=${encodeURIComponent(rawToken)}`;
        void sendVerificationEmail(user, verificationUrl);
        if (!isProduction && !gmailTransporter) console.log(`[FikarNot] Email verification link for ${email}: ${verificationUrl}`);
      }
      const response = { ok: true, message: "If the account exists and still needs verification, a new verification link has been prepared." };
      if (verificationUrl && !isProduction && !gmailTransporter) response.devVerificationUrl = verificationUrl;
      return send(req, res, 200, response);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const ip = clientIp(req);
      sweepExpiredRateLimits();
      const limitCheck = checkRateLimit("reset", ip, { windowMs: RESET_WINDOW_MS, max: MAX_RESET_REQUESTS });
      if (!limitCheck.allowed) {
        return send(req, res, 429, { error: "TOO_MANY_RESET_REQUESTS", message: "Too many password reset requests. Please try again later." });
      }

      const user = validateEmail(email) ? db.prepare("SELECT id FROM users WHERE email=?").get(email) : null;
      let resetUrl = null;
      if (user) {
        const rawToken = createPasswordResetToken(user.id);
        resetUrl = `${APP_ORIGIN}/reset-password?token=${encodeURIComponent(rawToken)}`;
        void sendPasswordResetEmail(db.prepare("SELECT * FROM users WHERE id=?").get(user.id), resetUrl);
        if (!isProduction && !gmailTransporter) console.log(`[FikarNot] Password reset link for ${email}: ${resetUrl}`);
      }

      const response = { ok: true, message: "If an account exists for that email, a password reset link has been prepared." };
      if (resetUrl && !gmailTransporter && !isProduction) response.devResetUrl = resetUrl;
      return send(req, res, 200, response);
    }

    if (req.method === "GET" && url.pathname === "/api/auth/reset-password") {
      const rawToken = url.searchParams.get("token") || "";
      const resetRow = getPasswordResetToken(rawToken);
      if (!resetRow) return send(req, res, 400, { error: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired." });
      return send(req, res, 200, { valid: true, expiresAt: resetRow.expires_at });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      const body = await readBody(req);
      const rawToken = String(body.token || "");
      const newPassword = String(body.newPassword || "");
      const resetRow = consumePasswordResetToken(rawToken);
      if (!resetRow) return send(req, res, 400, { error: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired." });
      if (!validatePassword(newPassword)) {
        db.prepare("UPDATE password_reset_tokens SET used_at=NULL WHERE token_hash=?").run(sha256(rawToken));
        return send(req, res, 400, { error: "WEAK_PASSWORD", message: "Password must be at least 6 characters." });
      }
      if (await isPasswordPwned(newPassword)) {
        db.prepare("UPDATE password_reset_tokens SET used_at=NULL WHERE token_hash=?").run(sha256(rawToken));
        return send(req, res, 400, { error: "PASSWORD_COMPROMISED", message: "That password has appeared in a known data breach. Please choose a different one." });
      }
      db.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(hashPassword(newPassword), Date.now(), resetRow.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(resetRow.user_id);
      db.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").run(resetRow.user_id);
      const session = createSession(resetRow.user_id);
      setSessionCookie(res, session);
      return send(req, res, 200, { user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(resetRow.user_id)) });
    }

    if (req.method === "GET" && url.pathname === "/api/auth/2fa/status") {
      const user = requireUser(req, res);
      if (!user) return;
      return send(req, res, 200, { enabled: Boolean(user.two_factor_enabled), required: ["admin", "editor"].includes(user.role) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/2fa/setup") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const row = db.prepare("SELECT password_hash,email,two_factor_enabled FROM users WHERE id=?").get(user.id);
      if (!row || !verifyPassword(currentPassword, row.password_hash)) return send(req, res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      const secret = base32Encode(crypto.randomBytes(20));
      return send(req, res, 200, { secret, otpauthUrl: otpauthUri(secret, row.email) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/2fa/enable") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const secret = String(body.secret || "").trim().toUpperCase();
      const code = String(body.code || "").trim();
      const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id);
      if (!row || !verifyPassword(currentPassword, row.password_hash)) return send(req, res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      try { base32Decode(secret); } catch { return send(req, res, 400, { error: "INVALID_2FA_SECRET", message: "Invalid authenticator secret." }); }
      if (!verifyTotp(secret, code)) return send(req, res, 400, { error: "INVALID_2FA_CODE", message: "The authenticator code is invalid or expired." });
      db.prepare("UPDATE users SET two_factor_enabled=1,two_factor_secret=?,updated_at=? WHERE id=?").run(secret, Date.now(), user.id);
      auditLog(user.id, "security.2fa_enabled", "user", user.id, {});
      return send(req, res, 200, { enabled: true });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/2fa/disable") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const code = String(body.code || "").trim();
      const row = db.prepare("SELECT password_hash,two_factor_secret FROM users WHERE id=?").get(user.id);
      if (!row || !verifyPassword(currentPassword, row.password_hash)) return send(req, res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      if (!row.two_factor_secret || !verifyTotp(row.two_factor_secret, code)) return send(req, res, 400, { error: "INVALID_2FA_CODE", message: "The authenticator code is invalid or expired." });
      db.prepare("UPDATE users SET two_factor_enabled=0,two_factor_secret=NULL,updated_at=? WHERE id=?").run(Date.now(), user.id);
      auditLog(user.id, "security.2fa_disabled", "user", user.id, {});
      return send(req, res, 200, { enabled: false });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const cookies = parseCookies(req.headers.cookie || "");
      const raw = cookies[COOKIE_NAME];
      if (raw) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha256(raw));
      clearSessionCookie(res);
      send(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/profile") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      if (!validateName(name)) return send(req, res, 400, { error: "INVALID_NAME", message: "Name must be at least 2 characters." });
      if (!validateEmail(email)) return send(req, res, 400, { error: "INVALID_EMAIL", message: "Enter a valid email address." });
      const duplicate = db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, user.id);
      if (duplicate) return send(req, res, 409, { error: "EMAIL_IN_USE", message: "Email is already in use." });
      db.prepare("UPDATE users SET name=?,email=?,updated_at=? WHERE id=?").run(name, email, Date.now(), user.id);
      send(req, res, 200, { user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const current = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id);
      if (!current || !verifyPassword(currentPassword, current.password_hash)) {
        return send(req, res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      }
      if (!validatePassword(newPassword))
        return send(req, res, 400, { error: "WEAK_PASSWORD", message: "New password must be at least 6 characters." });
      if (await isPasswordPwned(newPassword))
        return send(req, res, 400, { error: "PASSWORD_COMPROMISED", message: "That password has appeared in a known data breach. Please choose a different one." });
      db.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(hashPassword(newPassword), Date.now(), user.id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      const session = createSession(user.id);
      setSessionCookie(res, session);
      send(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/delete-account") {
      const user = requireUser(req, res);
      if (!user) return;
      if (["admin", "editor"].includes(user.role)) {
        return send(req, res, 403, { error: "STAFF_DELETE_BLOCKED", message: "Staff accounts cannot be deleted here." });
      }
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const confirmationText = String(body.confirmationText || "");
      const current = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id);
      if (!current || !verifyPassword(currentPassword, current.password_hash)) {
        return send(req, res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      }
      if (confirmationText !== "DELETE") return send(req, res, 400, { error: "CONFIRMATION_REQUIRED", message: "Type DELETE to confirm." });
      db.prepare("DELETE FROM users WHERE id=?").run(user.id);
      clearSessionCookie(res);
      send(req, res, 200, { ok: true });
      return;
    }


    if (req.method === "GET" && url.pathname === "/api/account/state") {
      const user = requireUser(req, res);
      if (!user) return;
      const stateRow = db.prepare("SELECT * FROM customer_state WHERE user_id=?").get(user.id);
      const addresses = db.prepare("SELECT * FROM customer_addresses WHERE user_id=? ORDER BY is_default DESC, updated_at DESC").all(user.id).map(addressRow);
      const current = customerStateRow(stateRow);
      return send(req, res, 200, { ...current, addresses });
    }

    if (req.method === "PUT" && url.pathname === "/api/account/state") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const cart = Array.isArray(body.cart) ? body.cart : [];
      const wishlist = Array.isArray(body.wishlist) ? body.wishlist : [];
      const recentlyViewed = Array.isArray(body.recentlyViewed) ? body.recentlyViewed.slice(0, 8) : [];
      const comparison = Array.isArray(body.comparison) ? body.comparison.slice(0, 3) : [];
      const now = Date.now();
      db.prepare("INSERT INTO customer_state (user_id,cart_json,wishlist_json,recently_viewed_json,comparison_json,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET cart_json=excluded.cart_json,wishlist_json=excluded.wishlist_json,recently_viewed_json=excluded.recently_viewed_json,comparison_json=excluded.comparison_json,updated_at=excluded.updated_at")
        .run(user.id, JSON.stringify(cart), JSON.stringify(wishlist), JSON.stringify(recentlyViewed), JSON.stringify(comparison), now);
      return send(req, res, 200, { ok: true, ...customerStateRow(db.prepare("SELECT * FROM customer_state WHERE user_id=?").get(user.id)) });
    }

    if (req.method === "PUT" && url.pathname === "/api/account/addresses") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const address = body.address || {};
      if (!String(address.name || '').trim() || !String(address.line1 || '').trim() || !String(address.city || '').trim() || !String(address.country || '').trim()) {
        return send(req, res, 400, { error: "INVALID_ADDRESS", message: "Name, address, city and country are required." });
      }
      const id = String(address.id || uid('addr-'));
      const now = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        if (address.isDefault) db.prepare("UPDATE customer_addresses SET is_default=0 WHERE user_id=?").run(user.id);
        db.prepare("INSERT INTO customer_addresses (id,user_id,label,name,line1,city,region,postal_code,country,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,name=excluded.name,line1=excluded.line1,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,country=excluded.country,is_default=excluded.is_default,updated_at=excluded.updated_at")
          .run(id, user.id, String(address.label || 'Home').trim(), String(address.name).trim(), String(address.line1).trim(), String(address.city).trim(), String(address.region || '').trim(), String(address.postalCode || '').trim(), String(address.country).trim(), address.isDefault ? 1 : 0, now, now);
        const count = Number(db.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE user_id=?").get(user.id).count);
        if (count === 1) db.prepare("UPDATE customer_addresses SET is_default=1 WHERE user_id=? AND id=?").run(user.id, id);
        db.exec("COMMIT");
        const addresses = db.prepare("SELECT * FROM customer_addresses WHERE user_id=? ORDER BY is_default DESC, updated_at DESC").all(user.id).map(addressRow);
        return send(req, res, 200, { address: addresses.find((item) => item.id === id), addresses });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/account/addresses/")) {
      const user = requireUser(req, res);
      if (!user) return;
      const id = decodeURIComponent(url.pathname.split('/').pop());
      db.exec("BEGIN IMMEDIATE");
      try {
        const existing = db.prepare("SELECT * FROM customer_addresses WHERE id=? AND user_id=?").get(id, user.id);
        if (!existing) { db.exec('ROLLBACK'); return send(req, res, 404, { error: 'ADDRESS_NOT_FOUND', message: 'Address not found.' }); }
        db.prepare("DELETE FROM customer_addresses WHERE id=? AND user_id=?").run(id, user.id);
        const count = Number(db.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE user_id=?").get(user.id).count);
        const hasDefault = db.prepare("SELECT id FROM customer_addresses WHERE user_id=? AND is_default=1 LIMIT 1").get(user.id);
        if (count && !hasDefault) {
          const next = db.prepare("SELECT id FROM customer_addresses WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").get(user.id);
          if (next) db.prepare("UPDATE customer_addresses SET is_default=1 WHERE id=? AND user_id=?").run(next.id, user.id);
        }
        db.exec("COMMIT");
        return send(req, res, 200, { addresses: db.prepare("SELECT * FROM customer_addresses WHERE user_id=? ORDER BY is_default DESC, updated_at DESC").all(user.id).map(addressRow) });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/audit-logs") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(req, res, 403, { error: 'FORBIDDEN', message: 'Admin permission required.' });
      const { limit, offset } = parsePagination(url, { defaultLimit: 100, maxLimit: 250 });
      const total = Number(db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get().count);
      const rows = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset).map((row) => {
        let details = {};
        try { details = JSON.parse(row.details_json || '{}'); } catch (err) {}
        return { id: row.id, actorUserId: row.actor_user_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, details, createdAt: row.created_at };
      });
      return send(req, res, 200, { logs: rows, total, limit, offset });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(req, res, 403, { error: 'FORBIDDEN', message: 'Admin permission required.' });
      const { limit, offset } = parsePagination(url);
      const total = Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count);
      const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset).map(safeUser);
      return send(req, res, 200, { users, total, limit, offset });
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(req, res, 403, { error: 'FORBIDDEN', message: 'Admin permission required.' });
      const body = await readBody(req);
      const payload = body.user || {};
      const id = String(payload.id || uid());
      const name = String(payload.name || '').trim();
      const email = normalizeEmail(payload.email);
      const role = ['customer','editor','admin'].includes(payload.role) ? payload.role : 'customer';
      const password = payload.password == null ? '' : String(payload.password);
      if (!validateName(name)) return send(req, res, 400, { error: 'INVALID_NAME', message: 'Name must be at least 2 characters.' });
      if (!validateEmail(email)) return send(req, res, 400, { error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
      const existing = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      const duplicate = db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, id);
      if (duplicate) return send(req, res, 409, { error: 'EMAIL_IN_USE', message: 'Email is already in use.' });
      const now = Date.now();
      if (existing) {
        if (password && !validatePassword(password)) return send(req, res, 400, { error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters.' });
        if (user.id === existing.id && role !== existing.role) return send(req, res, 400, { error: 'SELF_ROLE_CHANGE', message: 'You cannot change your own role.' });
        if (password) {
          db.prepare("UPDATE users SET name=?,email=?,role=?,password_hash=?,updated_at=? WHERE id=?").run(name,email,role,hashPassword(password),now,id);
        } else {
          db.prepare("UPDATE users SET name=?,email=?,role=?,updated_at=? WHERE id=?").run(name,email,role,now,id);
        }
      } else {
        if (!validatePassword(password)) return send(req, res, 400, { error: 'WEAK_PASSWORD', message: 'A password of at least 6 characters is required.' });
        db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at,email_verified_at) VALUES (?,?,?,?,?,?,?,?)").run(id,name,email,hashPassword(password),role,now,now,now);
      }
      if (existing) {
        const roleChanged = role !== existing.role;
        const emailChanged = email !== existing.email;
        const passwordChanged = Boolean(password);
        if ((roleChanged || emailChanged || passwordChanged) && id !== user.id) {
          db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        }
        auditLog(user.id, existing ? "user.update" : "user.create", "user", id, { role, changed: { role: roleChanged, email: emailChanged, password: passwordChanged } });
      } else {
        auditLog(user.id, "user.create", "user", id, { role });
      }
      const saved = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      return send(req, res, existing ? 200 : 201, { user: safeUser(saved) });
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/users\/[^/]+\/role$/)) {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(req, res, 403, { error: 'FORBIDDEN', message: 'Admin permission required.' });
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      if (!['customer','editor','admin'].includes(body.role)) return send(req, res, 400,{error:'INVALID_ROLE',message:'Invalid user role.'});
      if (id === user.id) return send(req, res, 400,{error:'SELF_ROLE_CHANGE',message:'You cannot change your own role.'});
      const result = db.prepare("UPDATE users SET role=?,updated_at=? WHERE id=?").run(body.role,Date.now(),id);
      if (!result.changes) return send(req, res, 404,{error:'USER_NOT_FOUND',message:'User not found.'});
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      auditLog(user.id, "user.role_change", "user", id, { role: body.role });
      return send(req, res, 200,{user:safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id))});
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/users/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(req, res, 403, { error: 'FORBIDDEN', message: 'Admin permission required.' });
      const id = decodeURIComponent(url.pathname.split('/').pop());
      if (id === user.id) return send(req, res, 400,{error:'SELF_DELETE_BLOCKED',message:'You cannot delete yourself.'});
      const target = db.prepare("SELECT id,role FROM users WHERE id=?").get(id);
      if (!target) return send(req, res, 404,{error:'USER_NOT_FOUND',message:'User not found.'});
      if (target.role === 'admin') return send(req, res, 403,{error:'ADMIN_DELETE_BLOCKED',message:'Admin accounts cannot be deleted from this screen.'});
      db.prepare("DELETE FROM users WHERE id=?").run(id);
      auditLog(user.id, "user.delete", "user", id);
      return send(req, res, 200,{ok:true});
    }

    if (req.method === "GET" && url.pathname === "/api/orders") {
      const user = requireUser(req, res);
      if (!user) return;
      const remote = listOrders(user, parsePagination(url));
      return send(req, res, 200, { ...remote, migrated: db.prepare("SELECT value FROM catalog_meta WHERE key='orders_migrated'").get()?.value === "1" });
    }

    if (req.method === "DELETE" && url.pathname.match(/^\/api\/orders\/[^/]+$/)) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const order = db.prepare("SELECT id FROM orders WHERE id=?").get(id);
      if (!order) return send(req, res, 404, { error: "ORDER_NOT_FOUND", message: "Order not found." });
      db.prepare("DELETE FROM orders WHERE id=?").run(id);
      auditLog(user.id, "order.delete", "order", id);
      return send(req, res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname.match(/^\/api\/orders\/[^/]+\/invoice$/)) {
      const user = getSessionUser(req);
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (!order) return send(req, res, 404, { error: "ORDER_NOT_FOUND", message: "Order not found." });
      if (!user || (!["admin", "editor"].includes(user.role) && order.user_id !== user.id)) return send(req, res, 403, { error: "FORBIDDEN", message: "You do not have access to this invoice." });
      const items = db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").all(id);
      return sendHtml(req, res, 200, invoiceHtml(order, items));
    }

    if (req.method === "POST" && url.pathname === "/api/orders/migrate") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!['admin','editor'].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const already = db.prepare("SELECT value FROM catalog_meta WHERE key='orders_migrated'").get()?.value === "1";
      if (already) return send(req, res, 200, { ok: true, migrated: true });
      const body = await readBody(req);
      const legacyOrders = Array.isArray(body.orders) ? body.orders : [];
      const legacyCoupons = Array.isArray(body.coupons) ? body.coupons : [];
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const c of legacyCoupons) {
          db.prepare("INSERT INTO coupons (id,code,type,value,min_subtotal,max_uses,used_count,active,expires_at,description) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,min_subtotal=excluded.min_subtotal,max_uses=excluded.max_uses,used_count=excluded.used_count,active=excluded.active,expires_at=excluded.expires_at,description=excluded.description")
            .run(c.id || uid('cp-'), String(c.code || '').trim().toUpperCase(), c.type || 'percent', Number(c.value || 0), Number(c.minSubtotal || 0), Number(c.maxUses || 0), Number(c.usedCount || 0), c.active === false ? 0 : 1, c.expiresAt ? Number(c.expiresAt) : null, String(c.description || ''));
        }
        for (const order of legacyOrders) {
          const customer = order.customer || {};
          const normalizedEmail = String(customer.email || '').trim().toLowerCase();
          const mappedUser = customer.userId ? db.prepare("SELECT id FROM users WHERE id=?").get(customer.userId) : db.prepare("SELECT id FROM users WHERE email=?").get(normalizedEmail);
          const orderId = String(order.id || nextOrderNumber());
          db.prepare("INSERT OR IGNORE INTO orders (id,user_id,customer_name,customer_email,customer_address,payment_method,subtotal,discount,shipping,total,coupon_json,status,created_at,cancelled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run(orderId, mappedUser?.id || null, String(customer.name || 'Guest'), normalizedEmail, String(customer.address || ''), customer.paymentMethod || 'card', Number(order.subtotal || 0), Number(order.discount || 0), Number(order.shipping || 0), Number(order.total || 0), JSON.stringify(order.coupon || null), order.status || 'paid', Number(order.createdAt || Date.now()), order.cancelledAt || null);
          for (const item of Array.isArray(order.items) ? order.items : []) {
            db.prepare("INSERT OR IGNORE INTO order_items (id,order_id,product_id,product_name,price,qty) VALUES (?,?,?,?,?,?)")
              .run(`${orderId}-${item.productId}`, orderId, item.productId, item.name, Number(item.price || 0), Math.max(1, Math.floor(Number(item.qty || 1))));
          }
        }
        db.prepare("INSERT INTO catalog_meta(key,value) VALUES('orders_migrated','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return send(req, res, 200, { ok: true, migrated: true });
    }

    if (req.method === "POST" && url.pathname === "/api/orders") {
      const user = getSessionUser(req);
      const ip = clientIp(req);
      sweepExpiredRateLimits();
      const limitCheck = checkRateLimit("order_create", ip, { windowMs: 10 * 60 * 1000, max: 20 });
      if (!limitCheck.allowed) {
        return send(req, res, 429, { error: "TOO_MANY_ORDERS", message: "Too many orders placed from this network recently. Please try again in a few minutes." });
      }
      const body = await readBody(req);
      const customer = body.customer || {};
      const paymentMethod = String(customer.paymentMethod || "cod").trim().toLowerCase();
      const commerce = getCommerceConfig();
      const isOnline = paymentMethod === "payfast" || paymentMethod === "card";
      const isManual = ["jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod);
      if (!new Set(["cod", "payfast", "card", "jazzcash", "easypaisa", "bank_transfer"]).has(paymentMethod)) {
        return send(req, res, 400, { error: "INVALID_PAYMENT_METHOD", message: "Unsupported payment method." });
      }
      if (paymentMethod === "cod" && !commerce.allowCod) {
        return send(req, res, 409, { error: "PAYMENT_METHOD_DISABLED", message: "Cash on delivery is currently unavailable." });
      }
      if (paymentMethod === "card" && !MOCK_PAYMENTS_ENABLED) {
        return send(req, res, 503, { error: "PAYMENT_PROVIDER_NOT_CONFIGURED", message: "Card payments are not currently available. Please choose an enabled payment method." });
      }
      if (isManual && !commerce.allowManualPayments) {
        return send(req, res, 503, { error: "PAYMENT_METHOD_DISABLED", message: "Manual payment methods are currently unavailable." });
      }
      if (paymentMethod === "payfast" && !commerce.allowOnlinePayments) {
        return send(req, res, 503, { error: "PAYMENT_PROVIDER_NOT_CONFIGURED", message: "Online payments are not currently available." });
      }
      const email = normalizeEmail(customer.email);
      if (!validateEmail(email)) return send(req, res, 400, { error: "INVALID_EMAIL", message: "A valid customer email is required." });
      const requestedItems = Array.isArray(body.items) ? body.items : [];
      if (!requestedItems.length) return send(req, res, 400, { error: "EMPTY_ORDER", message: "Your order has no items." });
      db.exec("BEGIN IMMEDIATE");
      try {
        const items = [];
        for (const requested of requestedItems) {
          const product = db.prepare("SELECT * FROM products WHERE id=?").get(requested.productId);
          const qty = Math.max(0, Math.floor(Number(requested.qty || 0)));
          if (!product) throw Object.assign(new Error(`Product ${requested.productId} was not found.`), { code: "PRODUCT_NOT_FOUND" });
          if (!qty) continue;
          if (product.stock < qty) throw Object.assign(new Error(`${product.name} only has ${product.stock} item(s) left.`), { code: "INSUFFICIENT_STOCK" });
          items.push({ productId: product.id, name: product.name, price: Number(product.price), qty });
        }
        if (!items.length) throw Object.assign(new Error("Your cart is empty or unavailable."), { code: "EMPTY_ORDER" });
        const subtotal = +items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2);
        const baseShipping = subtotal === 0 ? 0 : subtotal >= commerce.freeShippingThreshold ? 0 : commerce.shippingFlatRate;
        const couponResult = validateCouponServer(body.couponCode || "", subtotal);
        const shipping = couponResult.shippingFree ? 0 : baseShipping;
        const discount = couponResult.discount;
        const taxable = Math.max(0, subtotal - discount);
        const tax = +(taxable * commerce.taxRate / 100).toFixed(2);
        const total = +(taxable + shipping + tax).toFixed(2);
        const id = nextOrderNumber();
        const now = Date.now();
        const paymentStatus = (isOnline || isManual) ? "pending" : "unpaid";
        const paymentProofToken = isManual ? token() : null;
        const paymentProofTokenHash = paymentProofToken ? sha256(paymentProofToken) : null;
        const paymentProofExpiry = paymentProofToken ? now + 7 * 86400000 : null;
        db.prepare("INSERT INTO orders (id,user_id,customer_name,customer_email,customer_address,payment_method,subtotal,discount,shipping,tax,total,coupon_json,status,payment_status,currency,invoice_number,payment_proof_token_hash,payment_proof_token_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(id, user?.id || null, String(customer.name || 'Guest').trim(), email, String(customer.address || ''), paymentMethod, subtotal, discount, shipping, tax, total, JSON.stringify(couponResult.coupon ? { code: couponResult.coupon.code, type: couponResult.coupon.type, value: couponResult.coupon.value, discount, shippingFree: couponResult.shippingFree } : null), paymentMethod === 'cod' ? 'processing' : 'paid', paymentStatus, commerce.currency, `INV-${id.replace(/^FN-/, '')}`, paymentProofTokenHash, paymentProofExpiry, now, now);
        const itemInsert = db.prepare("INSERT INTO order_items (id,order_id,product_id,product_name,price,qty) VALUES (?,?,?,?,?,?)");
        const stockUpdate = db.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock>=?");
        const invInsert = db.prepare("INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
        for (const item of items) {
          itemInsert.run(`${id}-${item.productId}`, id, item.productId, item.name, item.price, item.qty);
          const product = db.prepare("SELECT stock FROM products WHERE id=?").get(item.productId);
          const changed = stockUpdate.run(item.qty, now, item.productId, item.qty).changes;
          if (changed !== 1) throw Object.assign(new Error(`${item.name} is no longer available in that quantity.`), { code: "INSUFFICIENT_STOCK" });
          invInsert.run(uid('inv-'), item.productId, item.name, Number(product.stock), Number(product.stock) - item.qty, -item.qty, `Order ${id}`, user?.id || null, now);
        }
        if (couponResult.coupon && couponResult.coupon.max_uses > 0) {
          const usageUpdate = db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE id=? AND active=1 AND used_count < max_uses");
          if (usageUpdate.run(couponResult.coupon.id).changes !== 1) throw Object.assign(new Error("That coupon has reached its usage limit."), { code: "INVALID_COUPON" });
        } else if (couponResult.coupon) {
          db.prepare("UPDATE coupons SET used_count=used_count+1 WHERE id=?").run(couponResult.coupon.id);
        }
        if (isOnline || isManual) db.prepare("INSERT INTO payments (id,order_id,provider,provider_payment_id,amount,currency,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(uid("pay-"), id, paymentMethod === "payfast" ? "payfast" : isManual ? "manual" : "mock", null, total, commerce.currency, paymentMethod === "card" ? "paid" : "pending", now, now);
        db.exec("COMMIT");
        const row = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        if (user?.id && !isOnline) createNotification(user.id, { type: 'order', title: `Order ${id} received`, message: 'Thanks for your order. We are preparing it for dispatch.', link: '/account', orderId: id });
        if (!isOnline || isManual) void sendOrderConfirmationEmail(row, items);
        for (const staff of db.prepare("SELECT id,email FROM users WHERE role IN ('admin','editor') LIMIT 20").all()) {
          void sendTransactionalEmail({
            to: staff.email,
            subject: `New FikarNot order ${id}`,
            html: `<div><h1>New order ${escapeHtml(id)}</h1><p>A new ${escapeHtml(paymentMethod)} order for ${escapeHtml(commerce.currency)} ${Number(total).toFixed(2)} is ready for review.</p><p><a href="${APP_ORIGIN}/admin/orders">Open admin orders</a></p></div>`,
            text: `New FikarNot order ${id}: ${commerce.currency} ${Number(total).toFixed(2)}. Open ${APP_ORIGIN}/admin/orders`,
            idempotencyKey: `staff-new-order/${id}/${staff.id}`,
          });
        }
        return send(req, res, 201, { order: orderRow(row, items), payment: (isOnline || isManual) ? { provider: paymentMethod === "payfast" ? "payfast" : isManual ? "manual" : "mock", status: paymentMethod === "card" ? "paid" : "pending", currency: commerce.currency, amount: total, orderId: id } : null, paymentProofToken, manualPaymentDetails: isManual ? commerce.manualPaymentDetails : null });
      } catch (e) {
        db.exec("ROLLBACK");
        const status = ["INVALID_COUPON","COUPON_MIN_SUBTOTAL","PRODUCT_NOT_FOUND","INSUFFICIENT_STOCK","EMPTY_ORDER","PAYMENT_METHOD_DISABLED","ONLINE_PAYMENT_NOT_CONFIGURED"].includes(e.code) ? 409 : 400;
        return send(req, res, status, { error: e.code || "ORDER_CREATE_FAILED", message: e.message || "Order could not be created." });
      }
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/orders\/[^/]+\/cancel$/)) {
      const user = requireUser(req, res); if (!user) return;
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        if (!order) { db.exec('ROLLBACK'); return send(req, res, 404, { error:'ORDER_NOT_FOUND', message:'Order not found.' }); }
        if (!(['admin','editor'].includes(user.role) || order.user_id === user.id)) { db.exec('ROLLBACK'); return send(req, res, 403, { error:'FORBIDDEN', message:'You cannot cancel this order.' }); }
        if (!['paid','processing'].includes(order.status)) { db.exec('ROLLBACK'); return send(req, res, 409, { error:'ORDER_NOT_CANCELLABLE', message:'This order can no longer be cancelled.' }); }
        const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(id);
        const updateStock = db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?");
        const invInsert = db.prepare("INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
        const now = Date.now();
        for (const item of items) {
          const product = db.prepare("SELECT stock FROM products WHERE id=?").get(item.product_id);
          updateStock.run(item.qty, now, item.product_id);
          invInsert.run(uid('inv-'), item.product_id, item.product_name, Number(product.stock), Number(product.stock) + Number(item.qty), Number(item.qty), `Order ${id} cancelled`, user.id, now);
        }
        db.prepare("UPDATE orders SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?").run(now, now, id);
        db.exec("COMMIT");
        auditLog(user.id, "order.cancel", "order", id, { previousStatus: order.status });
        if (order.user_id) createNotification(order.user_id, { type:'order', title:`Order ${id} cancelled`, message:'Your cancellation was completed and the items were returned to stock.', link:'/account', orderId:id });
        const updated = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        return send(req, res, 200, { order: orderRow(updated, items.map(i=>({productId:i.product_id,name:i.product_name,price:Number(i.price),qty:Number(i.qty)}))) });
      } catch (e) { db.exec('ROLLBACK'); return send(req, res, 500,{error:'ORDER_CANCEL_FAILED',message:e.message}); }
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/orders\/[^/]+\/status$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!['admin','editor'].includes(user.role)) return send(req, res, 403,{error:'FORBIDDEN',message:'Staff permission required.'});
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const allowed = new Set(['paid','processing','shipped','delivered','cancelled']);
      if (!allowed.has(body.status)) return send(req, res, 400,{error:'INVALID_STATUS',message:'Invalid order status.'});
      const previous = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (!previous) return send(req, res, 404,{error:'ORDER_NOT_FOUND',message:'Order not found.'});
      if (previous.status === body.status) return send(req, res, 200,{ok:true,orderId:id,status:body.status});
      if (previous.status === 'cancelled') return send(req, res, 409,{error:'INVALID_STATUS_TRANSITION',message:'A cancelled order cannot be moved back into fulfilment.'});
      if (previous.payment_status === 'pending' && body.status !== 'cancelled') return send(req, res, 409,{error:'PAYMENT_REQUIRED',message:'An online order must be paid before it can enter fulfilment.'});
      if (body.status === 'cancelled') {
        if (!['paid','processing'].includes(previous.status)) {
          return send(req, res, 409,{error:'ORDER_NOT_CANCELLABLE',message:'Only paid or processing orders can be cancelled.'});
        }
        db.exec("BEGIN IMMEDIATE");
        try {
          const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(id);
          const now = Date.now();
          const updateStock = db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?");
          const invInsert = db.prepare("INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
          for (const item of items) {
            const product = db.prepare("SELECT stock FROM products WHERE id=?").get(item.product_id);
            if (product) {
              updateStock.run(item.qty, now, item.product_id);
              invInsert.run(uid('inv-'), item.product_id, item.product_name, Number(product.stock), Number(product.stock) + Number(item.qty), Number(item.qty), `Order ${id} cancelled by staff`, user.id, now);
            }
          }
          db.prepare("UPDATE orders SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?").run(now, now, id);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      } else {
        const now = Date.now();
        db.prepare("UPDATE orders SET status=?,updated_at=?,cancelled_at=NULL,shipped_at=CASE WHEN ?='shipped' THEN COALESCE(shipped_at,?) ELSE shipped_at END,delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) ELSE delivered_at END WHERE id=?").run(body.status, now, body.status, now, body.status, now, id);
      }
      auditLog(user.id, "order.status_change", "order", id, { from: previous.status, to: body.status });
      const updatedOrder = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (previous.user_id) createNotification(previous.user_id, { type:'order', title:`Order ${id} is ${body.status === 'paid' ? 'confirmed' : body.status}`, message:`Your order status has been updated to ${body.status}.`, link:'/account', orderId:id });
      if (["processing", "shipped", "delivered", "cancelled"].includes(body.status)) void sendOrderStatusEmail(updatedOrder, body.status);
      return send(req, res, 200,{ok:true,orderId:id,status:body.status,order:orderRow(updatedOrder, db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").all(id).map(i=>({productId:i.product_id,name:i.product_name,price:Number(i.price),qty:Number(i.qty)})))});
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      try {
        db.prepare("SELECT 1 AS ok").get();
        return send(req, res, 200, { status: "ok", service: "fikarnot-api", timestamp: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) });
      } catch {
        return send(req, res, 503, { status: "error", service: "fikarnot-api" });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/commerce-settings") {
      const commerce = getCommerceConfig();
      return send(req, res, 200, { commerce });
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/orders\/[^/]+\/payment-proof$/)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req, MAX_PAYMENT_PROOF_BYTES + 150_000);
      const user = getSessionUser(req);
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (!order) return send(req, res, 404, { error: "ORDER_NOT_FOUND", message: "Order not found." });
      if (!["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method) || order.payment_status !== "pending") return send(req, res, 409, { error: "PAYMENT_PROOF_NOT_ALLOWED", message: "A payment slip is only accepted for a pending manual payment." });
      const authorized = user?.id === order.user_id || (String(body.email || '').trim().toLowerCase() === String(order.customer_email).toLowerCase() && body.token && order.payment_proof_token_hash && order.payment_proof_token_expires_at > Date.now() && sha256(String(body.token)) === order.payment_proof_token_hash);
      if (!authorized) return send(req, res, 403, { error: "FORBIDDEN", message: "This order cannot accept a payment slip from this account." });
      try {
        const proof = savePaymentProof(body.dataUrl, { orderId: id, uploadedBy: user?.id || null, originalName: body.originalName });
        auditLog(user?.id || null, "payment.proof_upload", "order", id, { proofId: proof.id, byteSize: proof.byte_size });
        return send(req, res, 201, { proof: { id: proof.id, originalName: proof.original_name, mimeType: proof.mime_type, byteSize: Number(proof.byte_size), status: "submitted" } });
      } catch (e) {
        const status = e.code === "PAYMENT_PROOF_TOO_LARGE" ? 413 : e.code === "PAYMENT_PROOF_EXISTS" || e.code === "PAYMENT_PROOF_DUPLICATE" ? 409 : 400;
        return send(req, res, status, { error: e.code || "PAYMENT_PROOF_FAILED", message: e.message });
      }
    }

    if (req.method === "GET" && url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/payment-proof$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const proof = db.prepare("SELECT * FROM payment_proofs WHERE order_id=?").get(id);
      if (!proof) return send(req, res, 404, { error: "PAYMENT_PROOF_NOT_FOUND", message: "No payment slip has been submitted." });
      const filePath = path.join(paymentProofDir, path.basename(proof.filename));
      if (!fs.existsSync(filePath)) return send(req, res, 404, { error: "PAYMENT_PROOF_FILE_MISSING", message: "The payment slip file is missing from storage." });
      const buffer = fs.readFileSync(filePath);
      corsHeaders(req, res);
      res.writeHead(200, { "Content-Type": proof.mime_type, "Content-Length": buffer.length, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${String(proof.original_name || 'payment-proof').replace(/[^a-zA-Z0-9._-]/g, '_')}"` });
      return res.end(buffer);
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/confirm-payment$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const body = await readBody(req);
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        if (!order) throw Object.assign(new Error("Order not found."), { code: "ORDER_NOT_FOUND" });
        if (!["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method)) throw Object.assign(new Error("Only manual payment orders can be confirmed here."), { code: "INVALID_MANUAL_PAYMENT" });
        if (order.payment_status === "paid") { db.exec("COMMIT"); return send(req, res, 200, { ok: true, alreadyConfirmed: true, order: orderRow(db.prepare("SELECT * FROM orders WHERE id=?").get(id), db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").all(id).map(i=>({productId:i.product_id,name:i.product_name,price:Number(i.price),qty:Number(i.qty)}))) }); }
        const proof = db.prepare("SELECT id FROM payment_proofs WHERE order_id=?").get(id);
        if (!proof && body.requireProof !== false) throw Object.assign(new Error("Review the payment slip before confirming this payment."), { code: "PAYMENT_PROOF_REQUIRED" });
        const now = Date.now();
        const payment = db.prepare("SELECT * FROM payments WHERE order_id=? AND provider='manual' ORDER BY created_at DESC LIMIT 1").get(id);
        if (!payment) throw Object.assign(new Error("Manual payment record not found."), { code: "PAYMENT_NOT_FOUND" });
        db.prepare("UPDATE payments SET status='paid',provider_payment_id=?,raw_status=?,updated_at=? WHERE id=?").run(String(body.providerReference || '').trim() || `manual-${id}`, String(body.note || 'Verified by staff'), now, payment.id);
        db.prepare("UPDATE orders SET status='processing',payment_status='paid',payment_proof_token_hash=NULL,payment_proof_token_expires_at=NULL,updated_at=? WHERE id=?").run(now, id);
        auditLog(user.id, "payment.confirm", "order", id, { method: order.payment_method, providerReference: String(body.providerReference || '').trim() || null });
        db.exec("COMMIT");
        const updated = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
        if (updated.user_id) createNotification(updated.user_id, { type: 'order', title: `Payment confirmed for ${id}`, message: 'Your payment was verified and your order is now being prepared.', link: '/account', orderId: id });
        void sendOrderStatusEmail(updated, "processing");
        return send(req, res, 200, { ok: true, order: orderRow(updated, db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").all(id).map(i=>({productId:i.product_id,name:i.product_name,price:Number(i.price),qty:Number(i.qty)}))) });
      } catch (e) {
        db.exec("ROLLBACK");
        const status = e.code === "ORDER_NOT_FOUND" || e.code === "PAYMENT_NOT_FOUND" ? 404 : e.code === "PAYMENT_PROOF_REQUIRED" ? 409 : 400;
        return send(req, res, status, { error: e.code || "PAYMENT_CONFIRM_FAILED", message: e.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/payments/payfast/session") {
      const user = getSessionUser(req);
      const body = await readBody(req);
      const orderId = String(body.orderId || "");
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
      if (!order || (order.user_id && (!user || user.id !== order.user_id))) return send(req, res, 404, { error: "ORDER_NOT_FOUND", message: "Order not found." });
      if (order.payment_method !== "payfast" || order.payment_status !== "pending") return send(req, res, 409, { error: "PAYMENT_NOT_PENDING", message: "This order is not awaiting a PayFast payment." });
      const tokenUrl = String(process.env.PAYFAST_TOKEN_URL || "").trim();
      const checkoutUrl = String(process.env.PAYFAST_CHECKOUT_URL || "").trim();
      const merchantId = String(process.env.PAYFAST_MERCHANT_ID || "").trim();
      const securedKey = String(process.env.PAYFAST_SECURED_KEY || "").trim();
      if (!tokenUrl || !checkoutUrl || !merchantId || !securedKey) return send(req, res, 503, { error: "PAYMENT_PROVIDER_NOT_CONFIGURED", message: "PayFast credentials are not configured." });
      try {
        const tokenParams = new URLSearchParams({ MERCHANT_ID: merchantId, SECURED_KEY: securedKey, BASKET_ID: order.id, TXNAMT: Number(order.total).toFixed(2), CURRENCY_CODE: String(order.currency || getCommerceConfig().currency).toUpperCase() });
        const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "FikarNot/1.7.2" }, body: tokenParams });
        const payload = await tokenResponse.json().catch(() => ({}));
        const accessToken = String(payload.ACCESS_TOKEN || payload.token || "").trim();
        if (!tokenResponse.ok || !accessToken) throw new Error("PayFast access-token request failed.");
        const commerce = getCommerceConfig();
        const orderDate = new Date(order.created_at).toISOString().slice(0, 10);
        const fields = { CURRENCY_CODE: commerce.currency, MERCHANT_ID: merchantId, MERCHANT_NAME: getSiteSettings().storeName || "FikarNot", TOKEN: accessToken, BASKET_ID: order.id, TXNAMT: Number(order.total).toFixed(2), ORDER_DATE: orderDate, SUCCESS_URL: `${APP_ORIGIN}/payment/success?order=${encodeURIComponent(order.id)}`, FAILURE_URL: `${APP_ORIGIN}/payment/failure?order=${encodeURIComponent(order.id)}`, CHECKOUT_URL: `${API_PUBLIC_ORIGIN}/api/payments/webhook/payfast`, CUSTOMER_EMAIL_ADDRESS: order.customer_email, SIGNATURE: crypto.randomBytes(16).toString("hex"), VERSION: "FIKARNOT-1.7.2", TXNDESC: `FikarNot order ${order.id}`, PROCCODE: "00", TRAN_TYPE: "ECOMM_PURCHASE" };
        return send(req, res, 200, { action: checkoutUrl, fields });
      } catch (error) {
        return send(req, res, 502, { error: "PAYMENT_PROVIDER_ERROR", message: error.message });
      }
    }

    if ((req.method === "POST" || req.method === "GET") && url.pathname === "/api/payments/webhook/payfast") {
      let event = {};
      if (req.method === "GET") {
        event = Object.fromEntries(url.searchParams.entries());
      } else {
        const rawBody = await readRawBody(req, MAX_BODY_BYTES);
        const contentType = String(req.headers["content-type"] || "").toLowerCase();
        if (contentType.includes("application/x-www-form-urlencoded")) {
          event = Object.fromEntries(new URLSearchParams(rawBody.toString("utf8")).entries());
        } else {
          try { event = JSON.parse(rawBody.toString("utf8") || "{}"); } catch { return send(req, res, 400, { error: "INVALID_WEBHOOK", message: "Webhook payload must be valid JSON or form data." }); }
        }
      }
      const merchantId = String(process.env.PAYFAST_MERCHANT_ID || "").trim();
      const securedKey = String(process.env.PAYFAST_SECURED_KEY || "").trim();
      if (!merchantId || !securedKey) return send(req, res, 503, { error: "PAYMENT_WEBHOOK_NOT_CONFIGURED", message: "PayFast webhook verification is not configured." });
      const merchantEventId = String(event.MERCHANT_ID || event.merchant_id || "").trim();
      if (merchantEventId && merchantEventId !== merchantId) return send(req, res, 401, { error: "INVALID_WEBHOOK_SIGNATURE", message: "Payment merchant identity did not match." });
      const orderId = String(event.basket_id || event.BASKET_ID || event.orderId || event.basketId || "").trim();
      const transactionId = String(event.transaction_id || event.transactionId || event.paymentId || "").trim();
      const errorCode = String(event.err_code || event.error_code || "").trim();
      const rawAmount = String(event.txnamt || event.TXNAMT || event.amount || "").trim();
      if (!orderId || !transactionId || rawAmount === "" || !errorCode) return send(req, res, 400, { error: "INVALID_WEBHOOK", message: "Missing PayFast transaction fields." });
      const responseValidationHash = String(event.validation_hash || event.validationHash || "").trim().toLowerCase();
      const expectedValidationHash = crypto.createHash("sha256").update(`${orderId}|${securedKey}|${merchantId}|${errorCode}`).digest("hex").toLowerCase();
      let signatureValid = responseValidationHash === expectedValidationHash;
      if (!signatureValid && PAYFAST_SECRET_WORD && event.Response_Key) {
        const expectedResponseKey = crypto.createHash("md5").update(`${merchantId}${orderId}${PAYFAST_SECRET_WORD}${rawAmount}${errorCode}`).digest("hex").toLowerCase();
        signatureValid = String(event.Response_Key).trim().toLowerCase() === expectedResponseKey;
      }
      if (!signatureValid) return send(req, res, 401, { error: "INVALID_WEBHOOK_SIGNATURE", message: "PayFast response validation failed." });
      const eventCurrency = String(event.CURRENCY_CODE || event.currency || "PKR").toUpperCase();
      const status = ["000", "00"].includes(errorCode) ? "paid" : "failed";
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
        if (!order) throw Object.assign(new Error("Order not found."), { code: "ORDER_NOT_FOUND" });
        const eventAmount = Number(rawAmount);
        if (!Number.isFinite(eventAmount) || Math.abs(eventAmount - Number(order.total)) > 0.005 || eventCurrency !== String(order.currency || "PKR").toUpperCase()) throw Object.assign(new Error("Payment amount or currency does not match the order."), { code: "PAYMENT_TOTAL_MISMATCH" });
        const payment = db.prepare("SELECT * FROM payments WHERE order_id=? AND provider='payfast' ORDER BY created_at DESC LIMIT 1").get(order.id);
        if (!payment) throw Object.assign(new Error("Payment record not found."), { code: "PAYMENT_NOT_FOUND" });
        if (payment.status === status && payment.provider_payment_id === transactionId) { db.exec("COMMIT"); return send(req, res, 200, { ok: true, orderId, paymentStatus: status, duplicate: true }); }
        if (payment.status === 'paid' && status === 'failed') { db.exec('ROLLBACK'); return send(req,res,409,{error:'PAYMENT_STATE_CONFLICT',message:'A previously confirmed payment cannot be downgraded to failed.'}); }
        if (payment.status === 'refunded' && status !== 'paid') { db.exec('ROLLBACK'); return send(req,res,409,{error:'PAYMENT_STATE_CONFLICT',message:'A refunded payment cannot be changed by a payment callback.'}); }
        const now = Date.now();
        db.prepare("UPDATE payments SET provider_payment_id=?,status=?,raw_status=?,updated_at=? WHERE id=?").run(transactionId, status, String(event.err_msg || event.rawStatus || status), now, payment.id);
        if (status === "failed") {
          const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id);
          const updateStock = db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?");
          const invInsert = db.prepare("INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
          for (const item of items) {
            const product = db.prepare("SELECT * FROM products WHERE id=?").get(item.product_id);
            if (!product) continue;
            updateStock.run(item.qty, now, item.product_id);
            invInsert.run(uid("inv-"), item.product_id, item.product_name, Number(product.stock), Number(product.stock) + Number(item.qty), Number(item.qty), `Payment failed for order ${order.id}`, null, now);
          }
          let coupon;
          try { coupon = JSON.parse(order.coupon_json || "null"); } catch { coupon = null; }
          if (coupon?.code) db.prepare("UPDATE coupons SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END WHERE code=?").run(String(coupon.code).toUpperCase());
        }
        db.prepare("UPDATE orders SET status=?,payment_status=?,cancelled_at=CASE WHEN ?='failed' THEN ? ELSE cancelled_at END,updated_at=? WHERE id=?").run(status === "paid" ? "paid" : "cancelled", status, status, status === "failed" ? now : null, now, order.id);
        db.exec("COMMIT");
        if (order.user_id && status === "paid") createNotification(order.user_id, { type: "order", title: `Payment received for ${order.id}`, message: "Your payment was confirmed and your order is now being prepared.", link: "/account", orderId: order.id });
        if (order.user_id && status === "failed") createNotification(order.user_id, { type: "order", title: `Payment failed for ${order.id}`, message: "Your online payment could not be confirmed. The reserved items were released.", link: "/account", orderId: order.id });
        return send(req, res, 200, { ok: true, orderId, paymentStatus: status });
      } catch (error) {
        db.exec("ROLLBACK");
        const code = error.code || "PAYMENT_WEBHOOK_FAILED";
        return send(req, res, code === "ORDER_NOT_FOUND" || code === "PAYMENT_NOT_FOUND" ? 404 : 409, { error: code, message: error.message });
      }
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/admin\/orders\/[^/]+\/fulfilment$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!['admin','editor'].includes(user.role)) return send(req, res, 403, { error:'FORBIDDEN', message:'Staff permission required.' });
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const body = await readBody(req);
      const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (!order) return send(req, res, 404, { error:'ORDER_NOT_FOUND', message:'Order not found.' });
      const courier = String(body.courier || '').trim().slice(0, 100);
      const trackingNumber = String(body.trackingNumber || '').trim().slice(0, 100);
      const trackingUrl = String(body.trackingUrl || '').trim().slice(0, 500);
      const shipmentStatus = new Set(['not_created','ready_to_ship','shipped','in_transit','delivered','returned']).has(body.shipmentStatus) ? body.shipmentStatus : (trackingNumber ? 'shipped' : 'not_created');
      if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) return send(req, res, 400, { error:'INVALID_TRACKING_URL', message:'Tracking URL must use HTTPS.' });
      if (['shipped','in_transit','delivered'].includes(shipmentStatus) && !trackingNumber) return send(req, res, 400, { error:'TRACKING_NUMBER_REQUIRED', message:'A tracking number is required for this shipment status.' });
      const now = Date.now();
      db.prepare("UPDATE orders SET courier=?,tracking_number=?,tracking_url=?,shipment_status=?,shipment_created_at=CASE WHEN ? <> '' AND shipment_created_at IS NULL THEN ? ELSE shipment_created_at END,updated_at=?,status=CASE WHEN ?='shipped' THEN 'shipped' WHEN ?='delivered' THEN 'delivered' ELSE status END,shipped_at=CASE WHEN ? IN ('shipped','in_transit','delivered') THEN COALESCE(shipped_at,?) ELSE shipped_at END,delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) ELSE delivered_at END WHERE id=?").run(courier, trackingNumber, trackingUrl, shipmentStatus, trackingNumber, now, now, shipmentStatus, shipmentStatus, shipmentStatus, now, shipmentStatus, now, id);
      auditLog(user.id, "order.fulfilment_update", "order", id, { courier, trackingNumber, trackingUrl, shipmentStatus });
      const updated = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
      if (shipmentStatus === 'shipped') void sendOrderStatusEmail(updated, 'shipped');
      if (shipmentStatus === 'in_transit') void sendOrderStatusEmail(updated, 'in transit');
      if (shipmentStatus === 'delivered') void sendOrderStatusEmail(updated, 'delivered');
      return send(req, res, 200, { order: orderRow(updated, db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid").all(id).map(i=>({productId:i.product_id,name:i.product_name,price:Number(i.price),qty:Number(i.qty)}))) });
    }

    if (req.method === "GET" && url.pathname === "/api/reviews") {
      return send(req, res, 200, { reviews: db.prepare("SELECT * FROM reviews WHERE status='published' ORDER BY created_at DESC").all().map(reviewRow) });
    }
    if (req.method === "GET" && url.pathname === "/api/coupons") {
      const rows = db.prepare("SELECT * FROM coupons WHERE active=1 AND (expires_at IS NULL OR expires_at>?) ORDER BY code").all(Date.now());
      return send(req, res, 200, { coupons: rows.map(couponRow) });
    }

    if (req.method === "GET" && url.pathname === "/api/engagement") {
      const user = requireUser(req, res);
      if (!user) return;
      return send(req, res, 200, { ...listEngagement(user), migrated: db.prepare("SELECT value FROM engagement_meta WHERE key='migrated'").get()?.value === "1" });
    }

    if (req.method === "POST" && url.pathname === "/api/engagement/migrate") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      if (db.prepare("SELECT value FROM engagement_meta WHERE key='migrated'").get()?.value === "1") return send(req, res, 200, { ok: true, migrated: true });
      const body = await readBody(req);
      const legacyReviews = Array.isArray(body.reviews) ? body.reviews : [];
      const legacyCoupons = Array.isArray(body.coupons) ? body.coupons : [];
      const legacyTickets = Array.isArray(body.supportTickets) ? body.supportTickets : [];
      const legacyReturns = Array.isArray(body.returnRequests) ? body.returnRequests : [];
      const legacyNotifications = body.notificationsByUser && typeof body.notificationsByUser === "object" ? body.notificationsByUser : {};
      db.exec("BEGIN IMMEDIATE");
      try {
        const mapUser = (userId, email) => {
          if (userId) {
            const row = db.prepare("SELECT id FROM users WHERE id=?").get(userId);
            if (row) return row.id;
          }
          if (email) return db.prepare("SELECT id FROM users WHERE email=?").get(normalizeEmail(email))?.id || null;
          return null;
        };
        for (const review of legacyReviews) {
          const uidValue = mapUser(review.userId, review.authorEmail);
          if (!uidValue) continue;
          db.prepare("INSERT INTO reviews (id,product_id,user_id,author_name,rating,title,body,status,verified_purchase,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
            .run(review.id || uid('r-'), review.productId, uidValue, String(review.authorName || 'Customer'), Math.max(1, Math.min(5, Number(review.rating || 5))), String(review.title || ''), String(review.body || ''), review.status || 'published', review.verifiedPurchase === false ? 0 : 1, Number(review.createdAt || Date.now()), Number(review.updatedAt || review.createdAt || Date.now()));
        }
        for (const c of legacyCoupons) {
          db.prepare("INSERT INTO coupons (id,code,type,value,min_subtotal,max_uses,used_count,active,expires_at,description) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,min_subtotal=excluded.min_subtotal,max_uses=excluded.max_uses,used_count=excluded.used_count,active=excluded.active,expires_at=excluded.expires_at,description=excluded.description")
            .run(c.id || uid('cp-'), String(c.code || '').trim().toUpperCase(), c.type || 'percent', Number(c.value || 0), Number(c.minSubtotal || 0), Number(c.maxUses || 0), Number(c.usedCount || 0), c.active === false ? 0 : 1, c.expiresAt ? Number(c.expiresAt) : null, String(c.description || ''));
        }
        for (const ticket of legacyTickets) {
          const uidValue = mapUser(ticket.userId, ticket.email);
          db.prepare("INSERT INTO support_tickets (id,user_id,name,email,subject,message,category,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
            .run(ticket.id || uid('TKT-'), uidValue, String(ticket.name || 'Customer'), normalizeEmail(ticket.email), String(ticket.subject || ''), String(ticket.message || ''), String(ticket.category || 'general'), ticket.status || 'open', Number(ticket.createdAt || Date.now()), Number(ticket.updatedAt || ticket.createdAt || Date.now()));
        }
        for (const request of legacyReturns) {
          const uidValue = mapUser(request.userId);
          if (!uidValue) continue;
          db.prepare("INSERT INTO return_requests (id,order_id,user_id,reason,note,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
            .run(request.id || uid('ret-'), request.orderId, uidValue, String(request.reason || 'Other'), String(request.note || ''), request.status || 'requested', Number(request.createdAt || Date.now()), Number(request.updatedAt || request.createdAt || Date.now()));
        }
        for (const [userId, notes] of Object.entries(legacyNotifications)) {
          const mappedId = mapUser(userId);
          if (!mappedId || !Array.isArray(notes)) continue;
          for (const note of notes.slice(0, 100)) {
            db.prepare("INSERT INTO notifications (id,user_id,type,title,message,link,order_id,read,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
              .run(note.id || uid('n-'), mappedId, note.type || 'system', String(note.title || 'FikarNot'), String(note.message || ''), note.link || '/account', note.orderId || null, note.read ? 1 : 0, Number(note.createdAt || Date.now()));
          }
        }
        db.prepare("INSERT INTO engagement_meta(key,value) VALUES('migrated','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(req, res, 200, { ok: true, migrated: true });
    }

    if (req.method === "POST" && url.pathname === "/api/reviews") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const productId = String(body.productId || "");
      const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
      if (!product) return send(req, res, 404, { error: "PRODUCT_NOT_FOUND", message: "Product not found." });
      const purchased = db.prepare("SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? AND oi.product_id=? LIMIT 1").get(user.id, productId);
      if (!purchased) return send(req, res, 403, { error: "PURCHASE_REQUIRED", message: "Only customers who purchased this product can review it." });
      const rating = Math.round(Number(body.rating));
      const title = String(body.title || "").trim();
      const reviewBody = String(body.body || "").trim();
      if (rating < 1 || rating > 5 || title.length < 3 || reviewBody.length < 10) return send(req, res, 400, { error: "INVALID_REVIEW", message: "Please provide a rating, a short title, and a review of at least 10 characters." });
      const now = Date.now();
      const id = db.prepare("SELECT id FROM reviews WHERE product_id=? AND user_id=?").get(productId, user.id)?.id || uid('r-');
      db.prepare("INSERT INTO reviews (id,product_id,user_id,author_name,rating,title,body,status,verified_purchase,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET author_name=excluded.author_name,rating=excluded.rating,title=excluded.title,body=excluded.body,status='published',updated_at=excluded.updated_at")
        .run(id, productId, user.id, user.name, rating, title, reviewBody, 'published', 1, now, now);
      const summary = db.prepare("SELECT AVG(rating) AS avg FROM reviews WHERE product_id=? AND status='published'").get(productId);
      db.prepare("UPDATE products SET rating=?,updated_at=? WHERE id=?").run(Number(Number(summary.avg || 0).toFixed(1)), now, productId);
      return send(req, res, 200, { review: reviewRow(db.prepare("SELECT * FROM reviews WHERE id=?").get(id)), product: catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(productId)) });
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/reviews\/[^/]+\/status$/)) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const body = await readBody(req);
      const status = String(body.status || "");
      if (!["published", "hidden"].includes(status)) return send(req, res, 400, { error: "INVALID_STATUS", message: "Invalid review status." });
      const review = db.prepare("SELECT * FROM reviews WHERE id=?").get(id);
      if (!review) return send(req, res, 404, { error: "REVIEW_NOT_FOUND", message: "Review not found." });
      const now = Date.now();
      db.prepare("UPDATE reviews SET status=?,updated_at=? WHERE id=?").run(status, now, id);
      // A hidden review shouldn't count toward the product's visible average rating.
      const summary = db.prepare("SELECT AVG(rating) AS avg FROM reviews WHERE product_id=? AND status='published'").get(review.product_id);
      db.prepare("UPDATE products SET rating=?,updated_at=? WHERE id=?").run(Number(Number(summary.avg || 0).toFixed(1)), now, review.product_id);
      return send(req, res, 200, {
        review: reviewRow(db.prepare("SELECT * FROM reviews WHERE id=?").get(id)),
        product: catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(review.product_id)),
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/reviews/")) {
      const user = requireUser(req, res);
      if (!user) return;
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const review = db.prepare("SELECT * FROM reviews WHERE id=?").get(id);
      if (!review) return send(req, res, 404, { error: "REVIEW_NOT_FOUND", message: "Review not found." });
      if (review.user_id !== user.id && !["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "You cannot remove this review." });
      db.prepare("DELETE FROM reviews WHERE id=?").run(id);
      const summary = db.prepare("SELECT AVG(rating) AS avg FROM reviews WHERE product_id=? AND status='published'").get(review.product_id);
      db.prepare("UPDATE products SET rating=?,updated_at=? WHERE id=?").run(Number(Number(summary.avg || 0).toFixed(1)), Date.now(), review.product_id);
      return send(req, res, 200, { ok: true, product: catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(review.product_id)) });
    }

    if (req.method === "POST" && url.pathname === "/api/coupons") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const c = await readBody(req).then((b) => b.coupon || b);
      const code = String(c.code || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!code) return send(req, res, 400, { error: "INVALID_COUPON", message: "Coupon code is required." });
      const couponType = ['percent','fixed','free_shipping'].includes(c.type) ? c.type : null;
      if (!couponType) return send(req, res, 400, { error: "INVALID_COUPON", message: "Invalid coupon type." });
      const value = Number(c.value || 0);
      const minSubtotal = Number(c.minSubtotal || 0);
      const maxUses = Number(c.maxUses || 0);
      if (!Number.isFinite(value) || value < 0 || (couponType === 'percent' && value > 100)) return send(req, res, 400, { error: "INVALID_COUPON", message: "Invalid coupon value." });
      if (!Number.isFinite(minSubtotal) || minSubtotal < 0 || !Number.isFinite(maxUses) || maxUses < 0 || !Number.isInteger(maxUses)) return send(req, res, 400, { error: "INVALID_COUPON", message: "Invalid coupon limits." });
      const id = c.id || uid('cp-');
      const existing = db.prepare("SELECT * FROM coupons WHERE id=?").get(id);
      const codeOwner = db.prepare("SELECT id FROM coupons WHERE code=? COLLATE NOCASE").get(code);
      if (codeOwner && codeOwner.id !== id) {
        return send(req, res, 409, { error: "DUPLICATE_COUPON_CODE", message: `A coupon with the code ${code} already exists.` });
      }
      db.prepare("INSERT INTO coupons (id,code,type,value,min_subtotal,max_uses,used_count,active,expires_at,description) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,min_subtotal=excluded.min_subtotal,max_uses=excluded.max_uses,used_count=excluded.used_count,active=excluded.active,expires_at=excluded.expires_at,description=excluded.description")
        .run(id, code, couponType, value, minSubtotal, maxUses, existing?.used_count ?? 0, c.active === false ? 0 : 1, c.expiresAt ? Number(c.expiresAt) : null, String(c.description || '').slice(0, 500));
      auditLog(user.id, existing ? "coupon.update" : "coupon.create", "coupon", id, { code, type: couponType });
      return send(req, res, 200, { coupon: couponRow(db.prepare("SELECT * FROM coupons WHERE id=?").get(id)) });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/coupons/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split('/').pop());
      db.prepare("DELETE FROM coupons WHERE id=?").run(id);
      auditLog(user.id, "coupon.delete", "coupon", id);
      return send(req, res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.match(/^\/api\/coupons\/[^/]+\/toggle$/)) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      db.prepare("UPDATE coupons SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").run(id);
      return send(req, res, 200, { coupon: couponRow(db.prepare("SELECT * FROM coupons WHERE id=?").get(id)) });
    }
    if (req.method === "POST" && url.pathname === "/api/coupons/validate") {
      const body = await readBody(req);
      try {
        const result = validateCouponServer(body.code || "", Number(body.subtotal || 0));
        return send(req, res, 200, { coupon: result.coupon ? couponRow(result.coupon) : null, discount: result.discount, shippingFree: result.shippingFree });
      } catch (e) {
        return send(req, res, 400, { error: e.code || "INVALID_COUPON", message: e.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/support") {
      const user = getSessionUser(req);
      const supportLimit = checkRateLimit("support", clientIp(req), { windowMs: 15 * 60 * 1000, max: 10 });
      if (!supportLimit.allowed) return send(req, res, 429, { error: "TOO_MANY_SUPPORT_REQUESTS", message: "Too many support requests from this network. Please try again later." });
      const body = await readBody(req);
      const name = String(body.name || '').trim(), email = normalizeEmail(body.email), subject = String(body.subject || '').trim(), message = String(body.message || '').trim();
      if (!validateName(name) || !validateEmail(email) || subject.length < 3 || message.length < 10) return send(req, res, 400, { error: "INVALID_SUPPORT", message: "Please complete all support fields." });
      const id = nextTicketNumber();
      const now = Date.now();
      db.prepare("INSERT INTO support_tickets (id,user_id,name,email,subject,message,category,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, user?.id || null, name, email, subject, message, body.category || 'general', 'open', now, now);
      if (user?.id) createNotification(user.id, { type: 'support', title: 'Support request received', message: `We received your request: ${subject}.`, link: '/help' });
      return send(req, res, 201, { ticket: supportRow(db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id)) });
    }
    if (req.method === "POST" && url.pathname.match(/^\/api\/support\/[^/]+\/status$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!["admin","editor"].includes(user.role)) return send(req, res, 403,{error:"FORBIDDEN",message:"Staff permission required."});
      const id=decodeURIComponent(url.pathname.split('/')[3]); const body=await readBody(req); const allowed=new Set(['open','in_progress','resolved']);
      if (!allowed.has(body.status)) return send(req, res, 400,{error:'INVALID_STATUS',message:'Invalid support status.'});
      const existing=db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id); if(!existing) return send(req, res, 404,{error:'SUPPORT_NOT_FOUND',message:'Support request not found.'});
      db.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").run(body.status,Date.now(),id);
      if(existing.user_id){ const label=body.status==='in_progress'?'in progress':body.status; createNotification(existing.user_id,{type:'support',title:`Support request ${label}`,message:`Your support request "${existing.subject}" is now ${label}.`,link:'/help'}); }
      return send(req, res, 200,{ticket:supportRow(db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id))});
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/support/")) {
      const user = requireUser(req,res); if(!user) return; if(!["admin","editor"].includes(user.role)) return send(req, res, 403,{error:'FORBIDDEN',message:'Staff permission required.'});
      db.prepare("DELETE FROM support_tickets WHERE id=?").run(decodeURIComponent(url.pathname.split('/').pop())); return send(req, res, 200,{ok:true});
    }

    if (req.method === "POST" && url.pathname === "/api/returns") {
      const user=requireUser(req,res); if(!user) return;
      const body=await readBody(req); const order=db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(body.orderId,user.id);
      if(!order || order.status!=='delivered') return send(req, res, 409,{error:'RETURN_NOT_ELIGIBLE',message:'This order is not eligible for a return.'});
      if(Date.now()-Number(order.created_at)>30*86400000) return send(req, res, 409,{error:'RETURN_WINDOW_EXPIRED',message:'The 30-day return window has expired.'});
      const existing=db.prepare("SELECT id FROM return_requests WHERE order_id=? AND user_id=?").get(order.id,user.id); if(existing) return send(req, res, 409,{error:'RETURN_EXISTS',message:'A return request already exists.'});
      const id=uid('ret-'), now=Date.now(); db.prepare("INSERT INTO return_requests (id,order_id,user_id,reason,note,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id,order.id,user.id,String(body.reason||'Other'),String(body.note||''),'requested',now,now);
      createNotification(user.id,{type:'return',title:`Return requested for ${order.id}`,message:'Your return request is awaiting review.',link:'/account',orderId:order.id});
      return send(req, res, 201,{request:returnRow(db.prepare("SELECT rr.*, rf.id AS refund_id, rf.amount AS refund_amount, rf.currency AS refund_currency, rf.status AS refund_status, rf.provider_ref AS refund_provider_ref, rf.method AS refund_method, rf.note AS refund_note FROM return_requests rr LEFT JOIN refunds rf ON rf.return_id=rr.id WHERE rr.id=?").get(id))});
    }
    if (req.method === "POST" && url.pathname.match(/^\/api\/returns\/[^/]+\/status$/)) {
      const user=requireUser(req,res); if(!user) return; if(!["admin","editor"].includes(user.role)) return send(req, res, 403,{error:'FORBIDDEN',message:'Staff permission required.'});
      const id=decodeURIComponent(url.pathname.split('/')[3]), body=await readBody(req), status=String(body.status||'');
      if(!['requested','approved','rejected','completed','cancelled'].includes(status)) return send(req, res, 400,{error:'INVALID_STATUS',message:'Invalid return status.'});
      const request=db.prepare("SELECT rr.*, rf.id AS refund_id, rf.amount AS refund_amount, rf.currency AS refund_currency, rf.status AS refund_status, rf.provider_ref AS refund_provider_ref, rf.method AS refund_method, rf.note AS refund_note FROM return_requests rr LEFT JOIN refunds rf ON rf.return_id=rr.id WHERE rr.id=?").get(id); if(!request) return send(req, res, 404,{error:'RETURN_NOT_FOUND',message:'Return request not found.'});
      const order=db.prepare("SELECT * FROM orders WHERE id=?").get(request.order_id);
      const previous=request.status;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare("UPDATE return_requests SET status=?,updated_at=? WHERE id=?").run(status,Date.now(),id);
        if(status==='approved' && previous!=='approved') db.prepare("UPDATE orders SET status='return_approved' WHERE id=?").run(order.id);
        if(status==='rejected') db.prepare("UPDATE orders SET status='delivered' WHERE id=? AND status='return_approved'").run(order.id);
        if(status==='completed' && previous!=='completed') {
          db.prepare("UPDATE orders SET status='returned' WHERE id=?").run(order.id);
          const items=db.prepare("SELECT oi.*,p.stock,p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?").all(order.id);
          for(const item of items){ db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?").run(item.qty,Date.now(),item.product_id); db.prepare("INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(uid('inv-'),item.product_id,item.name,item.stock,item.stock+item.qty,item.qty,`Return ${id} completed`,user.id,Date.now()); }
          const paidPayment = db.prepare("SELECT * FROM payments WHERE order_id=? AND status='paid' ORDER BY updated_at DESC LIMIT 1").get(order.id);
          if (paidPayment && !db.prepare("SELECT 1 FROM refunds WHERE return_id=?").get(id)) {
            db.prepare("INSERT INTO refunds (id,order_id,return_id,payment_id,amount,currency,method,status,provider_ref,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
              .run(uid('ref-'), order.id, id, paidPayment.id, Number(paidPayment.amount), paidPayment.currency || order.currency || 'PKR', 'manual', 'pending', null, 'Refund is due after return completion; staff must confirm provider payout.', Date.now(), Date.now());
          }
        }
        db.exec('COMMIT');
      } catch(e){db.exec('ROLLBACK');throw e;}
      auditLog(user.id, "return.status_change", "return", id, { orderId: request.order_id, from: previous, to: status });
      const updatedReturn = db.prepare("SELECT rr.*, rf.id AS refund_id, rf.amount AS refund_amount, rf.currency AS refund_currency, rf.status AS refund_status, rf.provider_ref AS refund_provider_ref, rf.method AS refund_method, rf.note AS refund_note FROM return_requests rr LEFT JOIN refunds rf ON rf.return_id=rr.id WHERE rr.id=?").get(id);
      if(request.user_id) createNotification(request.user_id,{type:'return',title:`Return for ${request.order_id} is ${status.replace('_',' ')}`,message:status==='approved'?'Your return has been approved.':status==='completed'?'Your return has been completed and items were returned to inventory.':status==='rejected'?'Your return request was not approved.':'Your return status was updated.',link:'/account',orderId:request.order_id});
      if (['approved','rejected','completed','cancelled'].includes(status)) void sendReturnStatusEmail(order, updatedReturn, status);
      return send(req, res, 200,{request:returnRow(updatedReturn),migrated:true});
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/admin\/returns\/[^/]+\/refund$/)) {
      const user = requireUser(req, res); if (!user) return;
      if (!['admin','editor'].includes(user.role)) return send(req, res, 403, { error:'FORBIDDEN', message:'Staff permission required.' });
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const body = await readBody(req);
      const status = String(body.status || '').trim();
      if (!['pending','processing','refunded','failed'].includes(status)) return send(req,res,400,{error:'INVALID_REFUND_STATUS',message:'Invalid refund status.'});
      const request = db.prepare("SELECT rr.*, o.total AS order_total, o.currency AS order_currency FROM return_requests rr JOIN orders o ON o.id=rr.order_id WHERE rr.id=?").get(id);
      if (!request) return send(req,res,404,{error:'RETURN_NOT_FOUND',message:'Return request not found.'});
      if (request.status !== 'completed') return send(req,res,409,{error:'REFUND_REQUIRES_COMPLETED_RETURN',message:'A refund can only be processed after a return is completed.'});
      const payment = db.prepare("SELECT * FROM payments WHERE order_id=? AND status IN ('paid','partially_refunded') ORDER BY updated_at DESC LIMIT 1").get(request.order_id);
      if (!payment) return send(req,res,409,{error:'NO_REFUNDABLE_PAYMENT',message:'No refundable online payment was found for this order.'});
      const amount = Math.min(Number(body.amount ?? payment.amount), Number(payment.amount));
      if (!Number.isFinite(amount) || amount <= 0) return send(req,res,400,{error:'INVALID_REFUND_AMOUNT',message:'Refund amount must be greater than zero.'});
      const now = Date.now();
      const existing = db.prepare("SELECT * FROM refunds WHERE return_id=?").get(id);
      const refundId = existing?.id || uid('ref-');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(existing ? "UPDATE refunds SET amount=?,status=?,provider_ref=?,note=?,updated_at=? WHERE id=?" : "INSERT INTO refunds (id,order_id,return_id,payment_id,amount,currency,method,status,provider_ref,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(...(existing ? [amount,status,String(body.providerRef || '').trim() || null,String(body.note || '').trim(),now,refundId] : [refundId,request.order_id,id,payment.id,amount,payment.currency || request.order_currency || 'PKR',String(body.method || 'manual'),status,String(body.providerRef || '').trim() || null,String(body.note || '').trim(),now,now]));
        if (status === 'refunded') {
          const remaining = Math.max(0, Number(payment.amount) - amount);
          db.prepare("UPDATE payments SET status=?,updated_at=? WHERE id=?").run(remaining > 0.005 ? 'partially_refunded' : 'refunded', now, payment.id);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      auditLog(user.id,'refund.status_change','refund',refundId,{returnId:id,orderId:request.order_id,status,amount,providerRef:String(body.providerRef || '').trim() || null});
      const updated = db.prepare("SELECT rr.*, rf.id AS refund_id, rf.amount AS refund_amount, rf.currency AS refund_currency, rf.status AS refund_status, rf.provider_ref AS refund_provider_ref, rf.method AS refund_method, rf.note AS refund_note FROM return_requests rr LEFT JOIN refunds rf ON rf.return_id=rr.id WHERE rr.id=?").get(id);
      if (request.user_id) createNotification(request.user_id,{type:'return',title:`Refund for ${request.order_id} is ${status}`,message:status==='refunded'?'Your refund has been recorded as completed.':status==='processing'?'Your refund is being processed.':'Your return refund status was updated.',link:'/account',orderId:request.order_id});
      return send(req,res,200,{request:returnRow(updated)});
    }

    if (req.method === "GET" && url.pathname === "/api/notifications") {
      const user=requireUser(req,res); if(!user) return; return send(req, res, 200,{notifications:notificationsFor(user.id)});
    }
    if (req.method === "POST" && url.pathname.match(/^\/api\/notifications\/[^/]+\/read$/)) {
      const user=requireUser(req,res); if(!user) return; const id=decodeURIComponent(url.pathname.split('/')[3]); db.prepare("UPDATE notifications SET read=1 WHERE id=? AND user_id=?").run(id,user.id); return send(req, res, 200,{ok:true});
    }
    if (req.method === "POST" && url.pathname === "/api/notifications/read-all") {
      const user=requireUser(req,res); if(!user) return; db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(user.id); return send(req, res, 200,{ok:true});
    }
    if (req.method === "DELETE" && url.pathname === "/api/notifications") {
      const user=requireUser(req,res); if(!user) return; db.prepare("DELETE FROM notifications WHERE user_id=?").run(user.id); return send(req, res, 200,{ok:true});
    }


    if (req.method === "GET" && url.pathname === "/api/site-settings") {
      return send(req, res, 200, { settings: getSiteSettings() });
    }

    if (req.method === "PATCH" && url.pathname === "/api/site-settings") {
      const user = requireUser(req, res); if (!user) return;
      if (!['admin','editor'].includes(user.role)) return send(req, res, 403,{error:'FORBIDDEN',message:'Staff permission required.'});
      const body = await readBody(req);
      const allowed = new Set(Object.keys(DEFAULT_SITE_SETTINGS));
      const now = Date.now();
      const upsert = db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by");
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const [key, value] of Object.entries(body.settings || {})) {
          if (!allowed.has(key)) continue;
          upsert.run(key, String(value ?? ''), now, user.id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      auditLog(user.id, "site_settings.update", "site_settings", null, { keys: Object.keys(body.settings || {}).filter((key) => allowed.has(key)) });
      return send(req, res, 200,{settings:getSiteSettings()});
    }

    if (req.method === "GET" && url.pathname === "/api/catalog") {
      const query = parseCatalogQuery(url);
      const { sql: whereSql, args } = catalogWhere(query);
      const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM products ${whereSql}`).get(...args).count);
      const maxPrice = Number(db.prepare("SELECT COALESCE(MAX(price), 0) AS max_price FROM products").get().max_price);
      const products = db
        .prepare(`SELECT * FROM products ${whereSql} ORDER BY ${catalogSortSql[query.sort]} LIMIT ? OFFSET ?`)
        .all(...args, query.limit, query.offset)
        .map(catalogRow);
      const categories = db.prepare("SELECT * FROM categories ORDER BY name").all().map(categoryRow);
      const currentUser = getSessionUser(req);
      const inventoryLog = currentUser && ["admin", "editor"].includes(currentUser.role)
        ? db.prepare("SELECT * FROM inventory_logs ORDER BY created_at DESC LIMIT 100").all().map((r) => ({
            id: r.id, productId: r.product_id, productName: r.product_name, previousStock: r.previous_stock, nextStock: r.next_stock,
            change: r.change, reason: r.reason, userId: r.user_id, createdAt: r.created_at,
          }))
        : [];
      const migrated = db.prepare("SELECT value FROM catalog_meta WHERE key='migrated'").get()?.value === "1";
      send(req, res, 200, { categories, products, inventoryLog, migrated, total, limit: query.limit, offset: query.offset, maxPrice, query });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/migrate") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const categories = Array.isArray(body.categories) ? body.categories : [];
      const products = Array.isArray(body.products) ? body.products : [];
      const inventoryLog = Array.isArray(body.inventoryLog) ? body.inventoryLog : [];
      db.exec("BEGIN");
      try {
        for (const c of categories) {
          db.prepare(
            `INSERT INTO categories (id,name,description,color,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,color=excluded.color,updated_at=excluded.updated_at`,
          ).run(c.id, c.name, c.description || "", c.color || "#3E8E5A", c.createdAt || Date.now(), Date.now());
        }
        for (const p of products) saveCatalogProduct(p, user.id);
        for (const l of inventoryLog.slice(0, 100)) {
          db.prepare(
            "INSERT OR IGNORE INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          ).run(
            l.id,
            l.productId,
            l.productName,
            l.previousStock,
            l.nextStock,
            l.change,
            l.reason,
            l.userId || user.id,
            l.createdAt || Date.now(),
          );
        }
        db.prepare("INSERT INTO catalog_meta(key,value) VALUES('migrated','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      send(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/media") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== "admin") return send(req, res, 403, { error: "FORBIDDEN", message: "Admin permission required." });
      const { limit, offset } = parsePagination(url, { defaultLimit: 24, maxLimit: 100 });
      const rows = db.prepare("SELECT * FROM media_assets ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
      const total = Number(db.prepare("SELECT COUNT(*) AS count FROM media_assets").get().count);
      const assets = rows.map((row) => mediaRow(row, mediaUsageCount(row.url)));
      return send(req, res, 200, { assets, total, limit, offset });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== "admin") return send(req, res, 403, { error: "FORBIDDEN", message: "Admin permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const result = deleteMediaAsset(id);
      if (result.missing) return send(req, res, 404, { error: "MEDIA_NOT_FOUND", message: "Media asset not found." });
      if (result.blocked) return send(req, res, 409, { error: "MEDIA_IN_USE", message: `This image is currently used in ${result.usageCount} place${result.usageCount === 1 ? "" : "s"}. Remove those references first.` });
      auditLog(user.id, "media.delete", "media", id);
      return send(req, res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/media/cleanup") {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.role !== "admin") return send(req, res, 403, { error: "FORBIDDEN", message: "Admin permission required." });
      const assets = db.prepare("SELECT * FROM media_assets").all();
      let removed = 0;
      for (const asset of assets) {
        if (mediaUsageCount(asset.url) === 0) { deleteMediaAsset(asset.id); removed += 1; }
      }
      return send(req, res, 200, { ok: true, removed });
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/image") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const uploadLimit = checkRateLimit("image_upload", user.id, { windowMs: 15 * 60 * 1000, max: 20 });
      if (!uploadLimit.allowed) return send(req, res, 429, { error: "TOO_MANY_UPLOADS", message: "Too many images uploaded recently. Please try again later." });
      let body;
      try {
        body = await readBody(req, MAX_UPLOAD_BYTES + 100_000); // allow for base64 overhead + JSON wrapper
      } catch (e) {
        return send(req, res, e.code === "BODY_TOO_LARGE" ? 413 : 400, { error: e.code || "INVALID_UPLOAD", message: e.message });
      }
      try {
        const asset = saveUploadedImage(body.dataUrl, { uploadedBy: user.id, originalName: body.originalName });
        auditLog(user.id, "media.upload", "media", asset.id, { byteSize: asset.byteSize, mimeType: asset.mimeType });
        return send(req, res, 201, { url: asset.url, asset });
      } catch (e) {
        return send(req, res, e.code === "IMAGE_TOO_LARGE" ? 413 : 400, { error: e.code || "INVALID_IMAGE", message: e.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/products") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      try {
        const product = saveCatalogProduct(body.product || body, user.id);
        auditLog(user.id, body.product?.id ? "product.update" : "product.create", "product", product.id, { sku: product.sku });
        send(req, res, 200, { product });
      } catch (e) {
        send(req, res, e.code === "DUPLICATE_SKU" ? 409 : 400, { error: e.code || "INVALID_PRODUCT", message: e.message });
      }
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/catalog/products/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const historyCount = Number(db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE product_id=?").get(id).count);
      if (historyCount > 0) {
        return send(req, res, 409, { error: "PRODUCT_HAS_ORDER_HISTORY", message: "This product has order history and cannot be deleted. Set its stock to 0 or hide it instead." });
      }
      db.prepare("DELETE FROM products WHERE id=?").run(id);
      send(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/categories") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const c = body.category || body;
      const now = Date.now();
      const productCount = Number(db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id=?").get(c.id).count);
      if (productCount > 0 && body.delete) return send(req, res, 409, { error: "CATEGORY_IN_USE", message: "Category still has products." });
      db.prepare(
        `INSERT INTO categories (id,name,description,color,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,color=excluded.color,updated_at=excluded.updated_at`,
      ).run(c.id, String(c.name || "").trim(), String(c.description || ""), c.color || "#3E8E5A", c.createdAt || now, now);
      send(req, res, 200, { category: categoryRow(db.prepare("SELECT * FROM categories WHERE id=?").get(c.id)) });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/catalog/categories/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const count = Number(db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id=?").get(id).count);
      if (count > 0) return send(req, res, 409, { error: "CATEGORY_IN_USE", message: "Reassign or delete its products first." });
      db.prepare("DELETE FROM categories WHERE id=?").run(id);
      send(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/inventory/adjust") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(req, res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const product = db.prepare("SELECT * FROM products WHERE id=?").get(body.productId);
      if (!product) return send(req, res, 404, { error: "PRODUCT_NOT_FOUND", message: "Product not found." });
      const next = Math.max(0, Math.floor(Number(body.nextStock)));
      if (!Number.isFinite(next)) return send(req, res, 400, { error: "INVALID_STOCK", message: "Invalid stock value." });
      const now = Date.now();
      db.prepare("UPDATE products SET stock=?,updated_at=? WHERE id=?").run(next, now, body.productId);
      const log = {
        id: uid("inv-"),
        productId: product.id,
        productName: product.name,
        previousStock: product.stock,
        nextStock: next,
        change: next - product.stock,
        reason: String(body.reason || "Manual stock adjustment"),
        userId: user.id,
        createdAt: now,
      };
      db.prepare(
        "INSERT INTO inventory_logs (id,product_id,product_name,previous_stock,next_stock,change,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(log.id, log.productId, log.productName, log.previousStock, log.nextStock, log.change, log.reason, log.userId, log.createdAt);
      auditLog(user.id, "inventory.adjust", "product", product.id, { previousStock: product.stock, nextStock: next, change: log.change, reason: log.reason });
      send(req, res, 200, { product: catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(body.productId)), log });
      return;
    }

    send(req, res, 404, { error: "NOT_FOUND", message: "Route not found." });
  } catch (error) {
    console.error(error);
    void reportOperationalError(error, req);
    const status = error.message === "Request body too large" ? 413 : 500;
    send(req, res, status, {
      error: status === 413 ? "BODY_TOO_LARGE" : "SERVER_ERROR",
      message: status === 413 ? "Request body too large." : (isProduction ? "Internal server error." : (error.message || "Internal server error.")),
    });
  }
});

server.on("error", (error) => {
  console.error(`FikarNot API could not start: ${error.code || error.message}`);
  process.exitCode = 1;
  try { db.close(); } catch (err) {}
  process.exit(1);
});

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`FikarNot API shutting down (${signal})`);
  server.close(() => {
    try { db.close(); } finally { process.exit(0); }
  });
};

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[FikarNot API] Running smoothly on port ${PORT}`);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
