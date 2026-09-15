import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startTestServer } from "./helpers.js";

let server;

const base32Decode = (input) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
};
const makeTotp = (secret, timestamp = Date.now()) => {
  const counter = BigInt(Math.floor(timestamp / 1000 / 30));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
};


before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

test("a GET request receives a CSRF cookie", async () => {
  await server.request("/api/auth/me");
  assert.ok(server.jar.get("fn_csrf"), "fn_csrf cookie should be set after any GET request");
});

test("a mutating request without the CSRF header is rejected", async () => {
  await server.primeCsrf();
  const csrfToken = server.jar.get("fn_csrf");
  // Simulate a forged cross-site request: it can't know the token, so omit the header manually.
  const response = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `fn_csrf=${csrfToken}` },
    body: JSON.stringify({ email: "junaid@fikarnot.shop", password: "admin123" }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "CSRF_VALIDATION_FAILED");
});

test("a mutating request with a mismatched CSRF header is rejected", async () => {
  await server.primeCsrf();
  const csrfToken = server.jar.get("fn_csrf");
  const response = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `fn_csrf=${csrfToken}`,
      "X-CSRF-Token": "not-the-right-token",
    },
    body: JSON.stringify({ email: "junaid@fikarnot.shop", password: "admin123" }),
  });
  assert.equal(response.status, 403);
});

test("a mutating request with the matching CSRF header succeeds", async () => {
  const { status, body } = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.user.email, "junaid@fikarnot.shop");
  await server.request("/api/auth/logout", { method: "POST", body: "{}" });
});

test("registration rejects a password shorter than 8 characters", async () => {
  await server.primeCsrf();
  const { status, body } = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Short Pass", email: "shortpass@example.com", password: "abc123" }),
  });
  assert.equal(status, 400);
  assert.equal(body.error, "WEAK_PASSWORD");
});

test("registration rejects an invalid email address", async () => {
  await server.primeCsrf();
  const { status, body } = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Bad Email", email: "not-an-email", password: "longenoughpassword" }),
  });
  assert.equal(status, 400);
  assert.equal(body.error, "INVALID_EMAIL");
});

test("registration rejects a duplicate email", async () => {
  await server.primeCsrf();
  const first = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "First User", email: "dupe@example.com", password: "longenoughpassword" }),
  });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Second User", email: "dupe@example.com", password: "anotherlongpassword" }),
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "EMAIL_IN_USE");
});

test("login is rate-limited after repeated failed attempts from the same IP", async () => {
  await server.primeCsrf();
  const attempt = () =>
    fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `fn_csrf=${server.jar.get("fn_csrf")}`,
        "X-CSRF-Token": server.jar.get("fn_csrf"),
        "X-Forwarded-For": "203.0.113.50",
      },
      body: JSON.stringify({ email: "junaid@fikarnot.shop", password: "wrong-password" }),
    });

  const results = [];
  for (let i = 0; i < 9; i += 1) {
        const response = await attempt();
    results.push(response.status);
  }

  assert.ok(results.slice(0, 8).every((status) => status === 401), `expected first 8 attempts to be 401, got ${results}`);
  assert.equal(results[8], 429, "the 9th attempt within the window should be rate-limited");
});

test("registration is rate-limited after repeated attempts from the same IP", async () => {
  await server.primeCsrf();
  const attempt = (i) =>
    fetch(`${server.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `fn_csrf=${server.jar.get("fn_csrf")}`,
        "X-CSRF-Token": server.jar.get("fn_csrf"),
        "X-Forwarded-For": "198.51.100.77",
      },
      body: JSON.stringify({ name: "Bulk Signup", email: `bulk${i}@example.com`, password: "longenoughpassword" }),
    });

  const results = [];
  for (let i = 0; i < 7; i += 1) {
        const response = await attempt(i);
    results.push(response.status);
  }

  assert.ok(results.slice(0, 6).every((status) => status === 201), `expected first 6 registrations to succeed, got ${results}`);
  assert.equal(results[6], 429, "the 7th registration within the window should be rate-limited");
});

test("a non-admin cannot list users", async () => {
  await server.primeCsrf();
  const login = await server.login("urwa@fikarnot.shop", "maya123");
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const { status, body } = await server.request("/api/users");
  assert.equal(status, 403);
  assert.equal(body.error, "FORBIDDEN");
  await server.request("/api/auth/logout", { method: "POST", body: "{}" });
});


test("staff 2FA enrollment and login challenge work end-to-end", async () => {
  let result = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(result.status, 200, JSON.stringify(result.body));

  result = await server.request("/api/auth/2fa/setup", { method: "POST", body: JSON.stringify({ currentPassword: "admin123" }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.match(result.body.secret, /^[A-Z2-7]+$/);
  assert.match(result.body.otpauthUrl, /^otpauth:\/\/totp\//);

  const secret = result.body.secret;
  const code = makeTotp(secret);
  result = await server.request("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ currentPassword: "admin123", secret, code }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  await server.request("/api/auth/logout", { method: "POST", body: "{}" });

  result = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "TWO_FACTOR_REQUIRED");

  result = await server.login("junaid@fikarnot.shop", "admin123", makeTotp(secret));
  assert.equal(result.status, 200, JSON.stringify(result.body));

  result = await server.request("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ currentPassword: "admin123", code: makeTotp(secret) }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
});
