import crypto from "node:crypto";
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { startTestServer } from "./helpers.js";

let server;

test.before(async () => { server = await startTestServer({ seedDemoUsers: true }); });
after(async () => { if (server) await server.close(); });

test("coupon creation preserves server-side usage counts and enforces limits", async () => {
  assert.equal((await server.login("junaid@fikarnot.shop", "admin123")).status, 200);
  const code = "ONCEONLY";
  const create = await server.request("/api/coupons", { method: "POST", body: JSON.stringify({ coupon: { code, type: "percent", value: 50, minSubtotal: 0, maxUses: 1, active: true } }) });
  assert.equal(create.status, 200);
  const first = await server.request("/api/orders", { method: "POST", body: JSON.stringify({
    customer: { name: "Junaid", email: "junaid@fikarnot.shop", address: "Test", paymentMethod: "cod" },
    items: [{ productId: "p1", qty: 1 }], couponCode: code,
  }) });
  assert.equal(first.status, 201);
  const second = await server.request("/api/orders", { method: "POST", body: JSON.stringify({
    customer: { name: "Junaid", email: "junaid@fikarnot.shop", address: "Test", paymentMethod: "cod" },
    items: [{ productId: "p2", qty: 1 }], couponCode: code,
  }) });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "INVALID_COUPON");
});

test("invalid product prices are rejected server-side", async () => {
  assert.equal((await server.login("junaid@fikarnot.shop", "admin123")).status, 200);
  const response = await server.request("/api/catalog/products", { method: "POST", body: JSON.stringify({
    product: { id: "p-security-test", name: "Bad Product", sku: "SEC-TEST-1", categoryId: "c1", price: -10, stock: 2, stockThreshold: 1 },
  }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_PRICE");
});

test("admin audit log records sensitive changes without exposing secrets", async () => {
  assert.equal((await server.login("junaid@fikarnot.shop", "admin123")).status, 200);
  const logs = await server.request("/api/audit-logs?limit=20");
  assert.equal(logs.status, 200);
  assert.ok(Array.isArray(logs.body.logs));
  for (const entry of logs.body.logs) {
    const serialized = JSON.stringify(entry);
    assert.ok(!serialized.includes("admin123"));
    assert.ok(!serialized.includes("maya123"));
  }
});


test("commerce settings expose the configured PKR shipping and tax rules", async () => {
  const response = await server.request("/api/commerce-settings");
  assert.equal(response.status, 200);
  assert.equal(response.body.commerce.currency, "PKR");
  assert.equal(response.body.commerce.freeShippingThreshold, 5000);
  assert.equal(response.body.commerce.shippingFlatRate, 500);
});

test("payfast webhook rejects a forged signed response", async () => {
  const response = await server.request("/api/payments/webhook/payfast", {
    method: "POST",
    body: JSON.stringify({ MERCHANT_ID: "merchant-test", basket_id: "FN-0001", transaction_id: "txn-1", txnamt: "1.00", CURRENCY_CODE: "PKR", err_code: "000", validation_hash: "not-a-valid-hash" }),
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "INVALID_WEBHOOK_SIGNATURE");
});


test("PayFast rejects a signed webhook when amount is tampered", async () => {
  const paymentServer = await startTestServer({ seedDemoUsers: true, env: {
    FIKARNOT_ALLOW_ONLINE_PAYMENTS: "1",
    PAYFAST_MERCHANT_ID: "merchant-test",
    PAYFAST_SECURED_KEY: "secured-test",
    PAYFAST_TOKEN_URL: "https://example.invalid/token",
    PAYFAST_CHECKOUT_URL: "https://example.invalid/checkout",
    FIKARNOT_API_PUBLIC_URL: "https://api.example.invalid",
  }});
  try {
    await paymentServer.primeCsrf();
    const created = await paymentServer.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Payment Test", email: "payment@example.com", address: "Test address", paymentMethod: "payfast" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    const raw = JSON.stringify({ orderId: created.body.order.id, paymentId: "txn-test", amount: 0.01, currency: "PKR", status: "paid", MERCHANT_ID: "merchant-test", basket_id: created.body.order.id, transaction_id: "txn-test", txnamt: "0.01", err_code: "000", validation_hash: crypto.createHash("sha256").update(`${created.body.order.id}|secured-test|merchant-test|000`).digest("hex") });
    const response = await paymentServer.request("/api/payments/webhook/payfast", { method: "POST", body: raw });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "PAYMENT_TOTAL_MISMATCH");
  } finally {
    await paymentServer.close();
  }
});


test("PayFast failed payment releases reserved stock", async () => {
  const paymentServer = await startTestServer({ seedDemoUsers: true, env: {
    FIKARNOT_ALLOW_ONLINE_PAYMENTS: "1", PAYFAST_MERCHANT_ID: "merchant-test", PAYFAST_SECURED_KEY: "secured-test",
    PAYFAST_TOKEN_URL: "https://example.invalid/token", PAYFAST_CHECKOUT_URL: "https://example.invalid/checkout",
    FIKARNOT_API_PUBLIC_URL: "https://api.example.invalid",
  }});
  try {
    await paymentServer.primeCsrf();
    const before = (await paymentServer.request("/api/catalog")).body.products.find((p) => p.id === "p1").stock;
    const created = await paymentServer.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Payment Test", email: "payment@example.com", address: "Test address", paymentMethod: "payfast" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    const id = created.body.order.id;
    const raw = JSON.stringify({ orderId: id, paymentId: "txn-failed", amount: Number(created.body.order.total).toFixed(2), currency: "PKR", status: "failed", MERCHANT_ID: "merchant-test", basket_id: id, transaction_id: "txn-failed", txnamt: Number(created.body.order.total).toFixed(2), err_code: "001", validation_hash: crypto.createHash("sha256").update(`${id}|secured-test|merchant-test|001`).digest("hex") });
    const response = await paymentServer.request("/api/payments/webhook/payfast", { method: "POST", body: raw });
    assert.equal(response.status, 200);
    const after = (await paymentServer.request("/api/catalog")).body.products.find((p) => p.id === "p1").stock;
    assert.equal(after, before);
  } finally {
    await paymentServer.close();
  }
});


test("completed online returns create a pending refund record that staff can mark refunded", async () => {
  const app = await startTestServer({ seedDemoUsers: true, env: {
    FIKARNOT_ALLOW_ONLINE_PAYMENTS: "1",
    PAYFAST_MERCHANT_ID: "merchant-test",
    PAYFAST_SECURED_KEY: "secured-test",
    PAYFAST_TOKEN_URL: "https://example.invalid/token",
    PAYFAST_CHECKOUT_URL: "https://example.invalid/checkout",
    FIKARNOT_API_PUBLIC_URL: "https://api.example.invalid",
  }});
  try {
    await app.login("urwa@fikarnot.shop", "maya123");
    const created = await app.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Maya", email: "urwa@fikarnot.shop", address: "Test address", paymentMethod: "payfast" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    const orderId = created.body.order.id;
    const amount = Number(created.body.order.total).toFixed(2);
    const signed = JSON.stringify({ MERCHANT_ID: "merchant-test", basket_id: orderId, transaction_id: "txn-refund-test", txnamt: amount, CURRENCY_CODE: "PKR", err_code: "000", validation_hash: crypto.createHash("sha256").update(`${orderId}|secured-test|merchant-test|000`).digest("hex") });
    assert.equal((await app.request("/api/payments/webhook/payfast", { method: "POST", body: signed })).status, 200);
    await app.login("junaid@fikarnot.shop", "admin123");
    for (const status of ["processing", "shipped", "delivered"]) {
      const result = await app.request(`/api/orders/${encodeURIComponent(orderId)}/status`, { method: "POST", body: JSON.stringify({ status }) });
      assert.equal(result.status, 200);
    }
    await app.login("urwa@fikarnot.shop", "maya123");
    const returnResponse = await app.request("/api/returns", { method: "POST", body: JSON.stringify({ orderId, reason: "Changed my mind", note: "Refund test" }) });
    assert.equal(returnResponse.status, 201);
    const returnId = returnResponse.body.request.id;
    await app.login("junaid@fikarnot.shop", "admin123");
    assert.equal((await app.request(`/api/returns/${encodeURIComponent(returnId)}/status`, { method: "POST", body: JSON.stringify({ status: "approved" }) })).status, 200);
    const completed = await app.request(`/api/returns/${encodeURIComponent(returnId)}/status`, { method: "POST", body: JSON.stringify({ status: "completed" }) });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.request.refund.status, "pending");
    const refunded = await app.request(`/api/admin/returns/${encodeURIComponent(returnId)}/refund`, { method: "POST", body: JSON.stringify({ status: "refunded", providerRef: "PF-REF-001", note: "Refund confirmed in provider dashboard." }) });
    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.request.refund.status, "refunded");
    assert.equal(refunded.body.request.refund.providerRef, "PF-REF-001");
  } finally {
    await app.close();
  }
});

test("PayFast cannot downgrade an already confirmed payment to failed", async () => {
  const app = await startTestServer({ seedDemoUsers: true, env: {
    FIKARNOT_ALLOW_ONLINE_PAYMENTS: "1",
    PAYFAST_MERCHANT_ID: "merchant-test",
    PAYFAST_SECURED_KEY: "secured-test",
    PAYFAST_TOKEN_URL: "https://example.invalid/token",
    PAYFAST_CHECKOUT_URL: "https://example.invalid/checkout",
    FIKARNOT_API_PUBLIC_URL: "https://api.example.invalid",
  }});
  try {
    await app.login("junaid@fikarnot.shop", "admin123");
    const created = await app.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Payment Test", email: "payment@example.com", address: "Test", paymentMethod: "payfast" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    const id = created.body.order.id;
    const successHash = crypto.createHash("sha256").update(`${id}|secured-test|merchant-test|000`).digest("hex");
    assert.equal((await app.request("/api/payments/webhook/payfast", { method: "POST", body: JSON.stringify({ MERCHANT_ID: "merchant-test", basket_id: id, transaction_id: "txn-ok", txnamt: Number(created.body.order.total).toFixed(2), CURRENCY_CODE: "PKR", err_code: "000", validation_hash: successHash }) })).status, 200);
    const failedHash = crypto.createHash("sha256").update(`${id}|secured-test|merchant-test|001`).digest("hex");
    const response = await app.request("/api/payments/webhook/payfast", { method: "POST", body: JSON.stringify({ MERCHANT_ID: "merchant-test", basket_id: id, transaction_id: "txn-failed", txnamt: Number(created.body.order.total).toFixed(2), CURRENCY_CODE: "PKR", err_code: "001", validation_hash: failedHash }) });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "PAYMENT_STATE_CONFLICT");
  } finally {
    await app.close();
  }
});

test("manual payment order exposes instructions and a protected proof token", async () => {
  const app = await startTestServer({ seedDemoUsers: true, env: {
    FIKARNOT_ENABLE_MOCK_PAYMENTS: "0",
  }});
  try {
    const adminLogin = await app.login("junaid@fikarnot.shop", "admin123");
    assert.equal(adminLogin.status, 200);
    await app.request("/api/site-settings", { method: "PATCH", body: JSON.stringify({ settings: {
      allowManualPayments: "1",
      jazzcashNumber: "923001234567",
      easypaisaNumber: "923001234568",
      bankName: "Test Bank",
      bankAccountTitle: "FikarNot",
      bankAccountNumber: "123456789",
      bankIban: "PK00TEST0000000000000000",
    } }) });
    assert.equal((await app.login("urwa@fikarnot.shop", "maya123")).status, 200);
    const created = await app.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Urwa", email: "urwa@fikarnot.shop", address: "Test", paymentMethod: "jazzcash" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    assert.equal(created.body.order.paymentMethod, "jazzcash");
    assert.equal(created.body.order.paymentStatus, "pending");
    assert.ok(created.body.paymentProofToken);
    assert.equal(created.body.manualPaymentDetails.jazzcashNumber, "923001234567");
  } finally {
    await app.close();
  }
});

test("manual payment proof upload is validated and only staff can view it", async () => {
  const app = await startTestServer({ seedDemoUsers: true });
  try {
    assert.equal((await app.login("urwa@fikarnot.shop", "maya123")).status, 200);
    await app.request("/api/site-settings", { method: "PATCH", body: JSON.stringify({ settings: { allowManualPayments: "1", jazzcashNumber: "923001234567" } }) });
    const created = await app.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Urwa", email: "urwa@fikarnot.shop", address: "Test", paymentMethod: "jazzcash" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    const token = created.body.paymentProofToken;
    const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const proof = await app.request(`/api/orders/${encodeURIComponent(created.body.order.id)}/payment-proof`, { method: "POST", body: JSON.stringify({ token, email: "urwa@fikarnot.shop", originalName: "receipt.png", dataUrl: tinyPng }) });
    assert.equal(proof.status, 201);
    assert.ok(proof.body.proof.id);
    const customerView = await app.request(`/api/admin/orders/${encodeURIComponent(created.body.order.id)}/payment-proof`);
    assert.equal(customerView.status, 403);
    assert.equal((await app.login("junaid@fikarnot.shop", "admin123")).status, 200);
    const adminView = await app.request(`/api/admin/orders/${encodeURIComponent(created.body.order.id)}/payment-proof`);
    assert.equal(adminView.status, 200);
    assert.equal(adminView.headers.get("content-type"), "image/png");
    const confirm = await app.request(`/api/admin/orders/${encodeURIComponent(created.body.order.id)}/confirm-payment`, { method: "POST", body: JSON.stringify({ providerReference: "JC-TEST-001" }) });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.order.paymentStatus, "paid");
    assert.equal(confirm.body.order.status, "processing");
  } finally {
    await app.close();
  }
});


test("guest manual payment can submit a proof with the single-use order token", async () => {
  const app = await startTestServer({ seedDemoUsers: true });
  try {
    const admin = await app.login("junaid@fikarnot.shop", "admin123");
    assert.equal(admin.status, 200);
    assert.equal((await app.request("/api/site-settings", { method: "PATCH", body: JSON.stringify({ settings: { allowManualPayments: "1", bankAccountNumber: "987654321", bankName: "Test Bank", bankAccountTitle: "FikarNot" } }) })).status, 200);
    await app.request("/api/auth/logout", { method: "POST", body: "{}" });
    const created = await app.request("/api/orders", { method: "POST", body: JSON.stringify({
      customer: { name: "Guest Buyer", email: "guest-proof@example.com", address: "Guest address", paymentMethod: "bank_transfer" },
      items: [{ productId: "p1", qty: 1 }],
    }) });
    assert.equal(created.status, 201);
    assert.ok(created.body.paymentProofToken);
    const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const proof = await app.request(`/api/orders/${encodeURIComponent(created.body.order.id)}/payment-proof`, { method: "POST", body: JSON.stringify({ token: created.body.paymentProofToken, email: "guest-proof@example.com", dataUrl: tinyPng, originalName: "bank-slip.png" }) });
    assert.equal(proof.status, 201);
  } finally {
    await app.close();
  }
});
