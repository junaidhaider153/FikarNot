import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { catalogCategories, catalogProducts } from "./catalogSeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
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
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
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

const FRONTEND_ORIGIN = process.env.FIKARNOT_FRONTEND_ORIGIN || "http://localhost:5173";
const PORT = Number(process.env.FIKARNOT_API_PORT || 8787);
const COOKIE_NAME = "fn_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const isProduction = process.env.NODE_ENV === "production";
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const resetAttempts = new Map();
const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESET_REQUESTS = 5;

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

const corsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Vary", "Origin");
};

const send = (res, status, payload) => {
  corsHeaders(res);
  json(res, status, payload);
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

const safeUser = (row) => (row ? { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at } : null);
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

const validatePassword = (password) => typeof password === "string" && password.length >= 8;
const validateName = (name) => typeof name === "string" && name.trim().length >= 2;
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

const ensureSeedUsers = () => {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (Number(existing) > 0) return;
  const now = Date.now();
  const seed = [
    { id: "u1", name: "Junaid Haider", email: "junaid@fikarnot.shop", password: "admin123", role: "admin" },
    { id: "u2", name: "FikarNot Editor", email: "editor@fikarnot.shop", password: "editor123", role: "editor" },
    { id: "u3", name: "Urwa", email: "urwa@fikarnot.shop", password: "maya123", role: "customer" },
  ];
  const insert = db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
  for (const user of seed) insert.run(user.id, user.name, user.email, hashPassword(user.password), user.role, now, now);
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
    String(p.name || "").trim(),
    sku,
    p.categoryId,
    Number(p.price),
    Math.max(0, Math.floor(Number(p.stock) || 0)),
    Math.max(0, Math.floor(Number(p.stockThreshold) || 0)),
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

const seedCatalog = () => seedCatalogIfEmpty();
seedCatalog();

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
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
  );
};

const clearSessionCookie = (res) => {
  const secure = isProduction ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
};

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

const buildDevResetUrl = (req, rawToken) => {
  if (isProduction || process.env.FIKARNOT_EXPOSE_RESET_LINKS === "0") return null;
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

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
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

const requireUser = (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    send(res, 401, { error: "AUTH_REQUIRED", message: "Authentication required." });
    return null;
  }
  return user;
};

const server = http.createServer(async (req, res) => {
  corsHeaders(res);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true, service: "FikarNot API", timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getSessionUser(req);
      send(res, 200, { authenticated: Boolean(user), user: safeUser(user) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      if (!validateName(name)) return send(res, 400, { error: "INVALID_NAME", message: "Name must be at least 2 characters." });
      if (!validateEmail(email)) return send(res, 400, { error: "INVALID_EMAIL", message: "Enter a valid email address." });
      if (!validatePassword(password))
        return send(res, 400, { error: "WEAK_PASSWORD", message: "Password must be at least 8 characters." });
      const exists = db.prepare("SELECT id FROM users WHERE email=?").get(email);
      if (exists) return send(res, 409, { error: "EMAIL_IN_USE", message: "Email is already registered." });
      const id = uid();
      const now = Date.now();
      db.prepare("INSERT INTO users (id,name,email,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(
        id,
        name,
        email,
        hashPassword(password),
        "customer",
        now,
        now,
      );
      const session = createSession(id);
      setSessionCookie(res, session);
      send(res, 201, { user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
        .split(",")[0]
        .trim();
      const now = Date.now();
      const attempt = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      if (now > attempt.resetAt) {
        attempt.count = 0;
        attempt.resetAt = now + LOGIN_WINDOW_MS;
      }
      if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        return send(res, 429, { error: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Please try again later." });
      }
      const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        attempt.count += 1;
        loginAttempts.set(ip, attempt);
        return send(res, 401, { error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      }
      loginAttempts.delete(ip);
      const session = createSession(user.id);
      setSessionCookie(res, session);
      send(res, 200, { user: safeUser(user) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
        .split(",")[0]
        .trim();
      const now = Date.now();
      const attempt = resetAttempts.get(ip) || { count: 0, resetAt: now + RESET_WINDOW_MS };
      if (now > attempt.resetAt) {
        attempt.count = 0;
        attempt.resetAt = now + RESET_WINDOW_MS;
      }
      if (attempt.count >= MAX_RESET_REQUESTS) {
        return send(res, 429, { error: "TOO_MANY_RESET_REQUESTS", message: "Too many password reset requests. Please try again later." });
      }
      attempt.count += 1;
      resetAttempts.set(ip, attempt);

      const user = validateEmail(email) ? db.prepare("SELECT id FROM users WHERE email=?").get(email) : null;
      let resetUrl = null;
      if (user) {
        const rawToken = createPasswordResetToken(user.id);
        resetUrl = buildDevResetUrl(req, rawToken);
        if (!isProduction) console.log(`[FikarNot] Password reset link for ${email}: ${resetUrl}`);
      }

      const response = { ok: true, message: "If an account exists for that email, a password reset link has been prepared." };
      if (resetUrl) response.devResetUrl = resetUrl;
      return send(res, 200, response);
    }

    if (req.method === "GET" && url.pathname === "/api/auth/reset-password") {
      const rawToken = url.searchParams.get("token") || "";
      const resetRow = getPasswordResetToken(rawToken);
      if (!resetRow) return send(res, 400, { error: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired." });
      return send(res, 200, { valid: true, expiresAt: resetRow.expires_at });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      const body = await readBody(req);
      const rawToken = String(body.token || "");
      const newPassword = String(body.newPassword || "");
      const resetRow = consumePasswordResetToken(rawToken);
      if (!resetRow) return send(res, 400, { error: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired." });
      if (!validatePassword(newPassword)) {
        db.prepare("UPDATE password_reset_tokens SET used_at=NULL WHERE token_hash=?").run(sha256(rawToken));
        return send(res, 400, { error: "WEAK_PASSWORD", message: "Password must be at least 8 characters." });
      }
      db.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(hashPassword(newPassword), Date.now(), resetRow.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(resetRow.user_id);
      db.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").run(resetRow.user_id);
      const session = createSession(resetRow.user_id);
      setSessionCookie(res, session);
      return send(res, 200, { user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(resetRow.user_id)) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const cookies = parseCookies(req.headers.cookie || "");
      const raw = cookies[COOKIE_NAME];
      if (raw) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha256(raw));
      clearSessionCookie(res);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/profile") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      if (!validateName(name)) return send(res, 400, { error: "INVALID_NAME", message: "Name must be at least 2 characters." });
      if (!validateEmail(email)) return send(res, 400, { error: "INVALID_EMAIL", message: "Enter a valid email address." });
      const duplicate = db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, user.id);
      if (duplicate) return send(res, 409, { error: "EMAIL_IN_USE", message: "Email is already in use." });
      db.prepare("UPDATE users SET name=?,email=?,updated_at=? WHERE id=?").run(name, email, Date.now(), user.id);
      send(res, 200, { user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
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
        return send(res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      }
      if (!validatePassword(newPassword))
        return send(res, 400, { error: "WEAK_PASSWORD", message: "New password must be at least 8 characters." });
      db.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(hashPassword(newPassword), Date.now(), user.id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      const session = createSession(user.id);
      setSessionCookie(res, session);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/delete-account") {
      const user = requireUser(req, res);
      if (!user) return;
      if (["admin", "editor"].includes(user.role)) {
        return send(res, 403, { error: "STAFF_DELETE_BLOCKED", message: "Staff accounts cannot be deleted here." });
      }
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const confirmationText = String(body.confirmationText || "");
      const current = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id);
      if (!current || !verifyPassword(currentPassword, current.password_hash)) {
        return send(res, 401, { error: "INVALID_PASSWORD", message: "Current password is incorrect." });
      }
      if (confirmationText !== "DELETE") return send(res, 400, { error: "CONFIRMATION_REQUIRED", message: "Type DELETE to confirm." });
      db.prepare("DELETE FROM users WHERE id=?").run(user.id);
      clearSessionCookie(res);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/catalog") {
      const categories = db.prepare("SELECT * FROM categories ORDER BY name").all().map(categoryRow);
      const products = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all().map(catalogRow);
      const inventoryLog = db
        .prepare("SELECT * FROM inventory_logs ORDER BY created_at DESC LIMIT 100")
        .all()
        .map((r) => ({
          id: r.id,
          productId: r.product_id,
          productName: r.product_name,
          previousStock: r.previous_stock,
          nextStock: r.next_stock,
          change: r.change,
          reason: r.reason,
          userId: r.user_id,
          createdAt: r.created_at,
        }));
      const migrated = db.prepare("SELECT value FROM catalog_meta WHERE key='migrated'").get()?.value === "1";
      send(res, 200, { categories, products, inventoryLog, migrated });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/migrate") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
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
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/products") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      try {
        const product = saveCatalogProduct(body.product || body, user.id);
        send(res, 200, { product });
      } catch (e) {
        send(res, e.code === "DUPLICATE_SKU" ? 409 : 400, { error: e.code || "INVALID_PRODUCT", message: e.message });
      }
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/catalog/products/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      db.prepare("DELETE FROM products WHERE id=?").run(id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/categories") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const c = body.category || body;
      const now = Date.now();
      const productCount = Number(db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id=?").get(c.id).count);
      if (productCount > 0 && body.delete) return send(res, 409, { error: "CATEGORY_IN_USE", message: "Category still has products." });
      db.prepare(
        `INSERT INTO categories (id,name,description,color,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,color=excluded.color,updated_at=excluded.updated_at`,
      ).run(c.id, String(c.name || "").trim(), String(c.description || ""), c.color || "#3E8E5A", c.createdAt || now, now);
      send(res, 200, { category: categoryRow(db.prepare("SELECT * FROM categories WHERE id=?").get(c.id)) });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/catalog/categories/")) {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const count = Number(db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id=?").get(id).count);
      if (count > 0) return send(res, 409, { error: "CATEGORY_IN_USE", message: "Reassign or delete its products first." });
      db.prepare("DELETE FROM categories WHERE id=?").run(id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/inventory/adjust") {
      const user = requireUser(req, res);
      if (!user) return;
      if (!["admin", "editor"].includes(user.role)) return send(res, 403, { error: "FORBIDDEN", message: "Staff permission required." });
      const body = await readBody(req);
      const product = db.prepare("SELECT * FROM products WHERE id=?").get(body.productId);
      if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND", message: "Product not found." });
      const next = Math.max(0, Math.floor(Number(body.nextStock)));
      if (!Number.isFinite(next)) return send(res, 400, { error: "INVALID_STOCK", message: "Invalid stock value." });
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
      send(res, 200, { product: catalogRow(db.prepare("SELECT * FROM products WHERE id=?").get(body.productId)), log });
      return;
    }

    send(res, 404, { error: "NOT_FOUND", message: "Route not found." });
  } catch (error) {
    console.error(error);
    send(res, error.message === "Request body too large" ? 413 : 500, {
      error: "SERVER_ERROR",
      message: error.message || "Internal server error.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`FikarNot API running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  db.close();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  db.close();
  server.close(() => process.exit(0));
});
