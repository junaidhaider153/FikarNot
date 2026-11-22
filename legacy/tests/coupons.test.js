import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let server;

before(async () => {
  server = await startTestServer();
  const login = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(login.status, 200, JSON.stringify(login.body));
});

after(async () => {
  await server.close();
});

async function makeCoupon(coupon) {
  const { status, body } = await server.request("/api/coupons", {
    method: "POST",
    body: JSON.stringify({ coupon }),
  });
  assert.equal(status, 200, `coupon fixture creation failed: ${JSON.stringify(body)}`);
  return body.coupon;
}

test("a percent-off coupon reduces the order subtotal correctly", async () => {
  await makeCoupon({ code: "SAVE10", type: "percent", value: 10, minSubtotal: 0, maxUses: 0, active: true });

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon1@example.com" },
      items: [{ productId: "p6", qty: 1 }],
      couponCode: "SAVE10",
    }),
  });

  assert.equal(status, 201, JSON.stringify(body));
  const { subtotal, discount, total, shipping } = body.order;
  assert.equal(discount, +(subtotal * 0.1).toFixed(2));
  assert.equal(total, +(subtotal - discount + shipping).toFixed(2));
});

test("a fixed-amount coupon is capped at the subtotal (never a negative total)", async () => {
  await makeCoupon({ code: "BIGFIXED", type: "fixed", value: 999, minSubtotal: 0, maxUses: 0, active: true });

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon2@example.com" },
      items: [{ productId: "p7", qty: 1 }],
      couponCode: "BIGFIXED",
    }),
  });

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.order.discount, body.order.subtotal, "discount should be capped at the subtotal, not exceed it");
});

test("a free-shipping coupon zeroes shipping without discounting the item total", async () => {
  await makeCoupon({ code: "SHIPFREE", type: "free_shipping", value: 0, minSubtotal: 0, maxUses: 0, active: true });

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon3@example.com" },
      items: [{ productId: "p8", qty: 1 }], // single cheap item, subtotal < $75 free-shipping threshold
      couponCode: "SHIPFREE",
    }),
  });

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.order.shipping, 0);
  assert.equal(body.order.discount, 0);
});

test("an unknown coupon code is rejected and does not create the order", async () => {
  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon4@example.com" },
      items: [{ productId: "p1", qty: 1 }],
      couponCode: "DOES-NOT-EXIST",
    }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "INVALID_COUPON");
});

test("an inactive coupon is rejected even though it exists", async () => {
  await makeCoupon({ code: "PAUSED", type: "percent", value: 20, minSubtotal: 0, maxUses: 0, active: false });

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon5@example.com" },
      items: [{ productId: "p1", qty: 1 }],
      couponCode: "PAUSED",
    }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "INVALID_COUPON");
});

test("an expired coupon is rejected", async () => {
  await makeCoupon({
    code: "EXPIRED10",
    type: "percent",
    value: 10,
    minSubtotal: 0,
    maxUses: 0,
    active: true,
    expiresAt: Date.now() - 1000 * 60 * 60, // one hour in the past
  });

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon6@example.com" },
      items: [{ productId: "p1", qty: 1 }],
      couponCode: "EXPIRED10",
    }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "INVALID_COUPON");
});

test("a coupon below its minimum subtotal is rejected", async () => {
  await makeCoupon({ code: "BIGSPEND", type: "percent", value: 10, minSubtotal: 500, maxUses: 0, active: true });

  const cheap = await server.request("/api/catalog");
  const cheapest = cheap.body.products.reduce((min, p) => (p.price < min.price ? p : min));

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon7@example.com" },
      items: [{ productId: cheapest.id, qty: 1 }],
      couponCode: "BIGSPEND",
    }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "COUPON_MIN_SUBTOTAL");
});

test("creating a coupon with a code that's already in use returns a clean 409, not a raw SQL error", async () => {
  await makeCoupon({ code: "UNIQUE1", type: "percent", value: 5, minSubtotal: 0, maxUses: 0, active: true });

  const { status, body } = await server.request("/api/coupons", {
    method: "POST",
    body: JSON.stringify({ coupon: { code: "UNIQUE1", type: "fixed", value: 1, minSubtotal: 0, maxUses: 0, active: true } }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "DUPLICATE_COUPON_CODE");
});

test("a coupon that has hit its usage limit is rejected on the next attempt", async () => {
  await makeCoupon({ code: "ONEUSE", type: "percent", value: 15, minSubtotal: 0, maxUses: 1, active: true });

  const first = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon8a@example.com" },
      items: [{ productId: "p2", qty: 1 }],
      couponCode: "ONEUSE",
    }),
  });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: { name: "Coupon Tester", email: "coupon8b@example.com" },
      items: [{ productId: "p2", qty: 1 }],
      couponCode: "ONEUSE",
    }),
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "INVALID_COUPON");
});
