import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let server;

before(async () => {
  server = await startTestServer({ seedDemoUsers: true });
});

after(async () => {
  await server.close();
});

test("new registrations require email verification and expose only a development link outside production", async () => {
  await server.primeCsrf();
  const registration = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Verification Tester",
      email: "verify@example.com",
      password: "longenoughpassword",
    }),
  });

  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  assert.equal(registration.body.requiresVerification, true);
  assert.match(registration.body.devVerificationUrl, /\/verify-email\?token=/);

  const blocked = await server.login("verify@example.com", "longenoughpassword");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, "EMAIL_NOT_VERIFIED");

  const verificationUrl = new URL(registration.body.devVerificationUrl);
  const token = verificationUrl.searchParams.get("token");
  const preview = await server.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.valid, true);

  const verified = await server.request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.verified, true);

  const replay = await server.request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, "INVALID_VERIFICATION_TOKEN");
});

test("site settings are publicly readable but only staff can update them", async () => {
  const before = await server.request("/api/site-settings");
  assert.equal(before.status, 200);
  assert.ok(before.body.settings.storeName);

  await server.primeCsrf();
  const customerRegistration = await server.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Settings Customer",
      email: "settings@example.com",
      password: "longenoughpassword",
    }),
  });
  const verificationUrl = new URL(customerRegistration.body.devVerificationUrl);
  const token = verificationUrl.searchParams.get("token");
  await server.request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });

  const customerAttempt = await server.request("/api/site-settings", {
    method: "PATCH",
    body: JSON.stringify({ settings: { storeName: "Should Fail" } }),
  });
  assert.equal(customerAttempt.status, 403);
  assert.equal(customerAttempt.body.error, "FORBIDDEN");

  await server.request("/api/auth/logout", { method: "POST", body: "{}" });
  const adminLogin = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

  const update = await server.request("/api/site-settings", {
    method: "PATCH",
    body: JSON.stringify({ settings: { storeName: "FikarNot Test Store", heroTitle: "Better everyday choices," } }),
  });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.equal(update.body.settings.storeName, "FikarNot Test Store");
  assert.equal(update.body.settings.heroTitle, "Better everyday choices,");

  const after = await server.request("/api/site-settings");
  assert.equal(after.body.settings.storeName, "FikarNot Test Store");
});
