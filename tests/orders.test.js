import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

const guestCustomer = { name: "Test Buyer", email: "buyer@example.com", address: "1 Test St" };

async function getProduct(id) {
  const { body } = await server.request("/api/catalog");
  return body.products.find((p) => p.id === id);
}

test("placing an order decrements stock by the ordered quantity", async () => {
  const before_ = await getProduct("p1");
  assert.ok(before_, "seed product p1 should exist");

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p1", qty: 2 }] }),
  });

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.order.items[0].qty, 2);

  const after_ = await getProduct("p1");
  assert.equal(after_.stock, before_.stock - 2, "stock should drop by exactly the ordered quantity");
});

test("ordering more than available stock is rejected and stock is left untouched", async () => {
  const before_ = await getProduct("p2");
  const tooMany = before_.stock + 1000;

  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p2", qty: tooMany }] }),
  });

  assert.equal(status, 409);
  assert.equal(body.error, "INSUFFICIENT_STOCK");

  const after_ = await getProduct("p2");
  assert.equal(after_.stock, before_.stock, "a rejected order must not touch stock at all");
});

test("an order with an unknown product id is rejected before touching the database", async () => {
  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "does-not-exist", qty: 1 }] }),
  });
  assert.equal(status, 409);
  assert.equal(body.error, "PRODUCT_NOT_FOUND");
});

test("an order with no items is rejected", async () => {
  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [] }),
  });
  assert.equal(status, 400);
  assert.equal(body.error, "EMPTY_ORDER");
});

test("an order without a valid customer email is rejected", async () => {
  const { status, body } = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: { name: "No Email" }, items: [{ productId: "p1", qty: 1 }] }),
  });
  assert.equal(status, 400);
  assert.equal(body.error, "INVALID_EMAIL");
});

test("cancelling an order restores the stock it had reserved", async () => {
  const before_ = await getProduct("p3");

  const created = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p3", qty: 3 }] }),
  });
  assert.equal(created.status, 201);
  const midway = await getProduct("p3");
  assert.equal(midway.stock, before_.stock - 3);

  // Cancelling requires an authenticated session (staff or the order's own owner).
  // This was a guest order, so only staff can cancel it.
  const login = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const cancelled = await server.request(`/api/orders/${created.body.order.id}/cancel`, { method: "POST" });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.order.status, "cancelled");

  const restored = await getProduct("p3");
  assert.equal(restored.stock, before_.stock, "cancelling should return every unit back to stock");
});


test("changing an order to cancelled through the staff status endpoint restores reserved stock", async () => {
  const before_ = await getProduct("p4");
  const created = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p4", qty: 2 }] }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const afterCreate = await getProduct("p4");
  assert.equal(afterCreate.stock, before_.stock - 2);

  // The staff dashboard uses the generic status endpoint, so cancellation there
  // must perform the same inventory restoration as the dedicated cancel endpoint.
  const changed = await server.request(`/api/orders/${created.body.order.id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "cancelled" }),
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.status, "cancelled");

  const restored = await getProduct("p4");
  assert.equal(restored.stock, before_.stock, "staff cancellation should return every reserved unit to stock");
});

test("a logged-in customer cannot cancel a guest order they don't own", async () => {
  const created = await server.request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p5", qty: 1 }] }),
  });
  assert.equal(created.status, 201);

  // urwa@fikarnot.shop is a seeded customer account, not staff, and didn't place this order.
  const login = await server.login("urwa@fikarnot.shop", "maya123");
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const cancelAttempt = await server.request(`/api/orders/${created.body.order.id}/cancel`, { method: "POST" });
  assert.equal(cancelAttempt.status, 403);
  assert.equal(cancelAttempt.body.error, "FORBIDDEN");

  await server.request("/api/auth/logout", { method: "POST", body: "{}" });
});

test("order creation is rate-limited after repeated requests from the same IP", async () => {
  await server.primeCsrf();
  const attempt = () =>
    fetch(`${server.baseUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `fn_csrf=${server.jar.get("fn_csrf") || ""}`,
        "X-CSRF-Token": server.jar.get("fn_csrf") || "",
        "X-Forwarded-For": "198.51.100.200",
      },
      body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p8", qty: 1 }] }),
    });

  const statuses = [];
  for (let i = 0; i < 21; i += 1) {
        const response = await attempt();
    statuses.push(response.status);
  }

  assert.ok(statuses.slice(0, 20).every((s) => s === 201), `expected first 20 orders to succeed, got ${statuses}`);
  assert.equal(statuses[20], 429, "the 21st order within the window should be rate-limited");
});

test("catalog supports server-side search and pagination without changing the legacy unfiltered response", async () => {
  const all = await server.request("/api/catalog");
  assert.equal(all.status, 200);
  assert.ok(all.body.products.length >= 8);
  assert.equal(all.body.total, all.body.products.length);

  const search = await server.request("/api/catalog?q=headphones&limit=1&offset=0");
  assert.equal(search.status, 200);
  assert.equal(search.body.products.length, 1);
  assert.equal(search.body.total, 1);
  assert.match(search.body.products[0].name, /Headphones/i);

  const secondPage = await server.request("/api/catalog?limit=1&offset=1&sort=name");
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.products.length, 1);
});

test("live sitemap is generated from the server catalogue", async () => {
  const response = await server.request("/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  const text = await (async () => {
    const raw = await fetch(`${server.baseUrl}/sitemap.xml`);
    return raw.text();
  })();
  assert.match(text, /<loc>.*\/product\/p1<\/loc>/);
});


test("invoice endpoint returns a printable document only to the order owner", async () => {
  assert.equal((await server.login("junaid@fikarnot.shop", "admin123")).status, 200);
  const created = await server.request("/api/orders", { method: "POST", body: JSON.stringify({
    customer: { name: "Junaid", email: "junaid@fikarnot.shop", address: "Invoice street", paymentMethod: "cod" },
    items: [{ productId: "p1", qty: 1 }],
  }) });
  assert.equal(created.status, 201);
  const invoice = await server.request(`/api/orders/${encodeURIComponent(created.body.order.id)}/invoice`);
  assert.equal(invoice.status, 200);
  assert.match(String(invoice.headers.get("content-type")), /text\/html/i);
  assert.match(String(invoice.body), /Invoice/);
});


test("staff can create and update a courier shipment with a tracking URL", async () => {
  const login = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const created = await server.request("/api/orders", { method: "POST", body: JSON.stringify({ customer: guestCustomer, items: [{ productId: "p6", qty: 1 }] }) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const response = await server.request(`/api/admin/orders/${created.body.order.id}/fulfilment`, { method: "POST", body: JSON.stringify({ courier: "PostEx", trackingNumber: "PEX-TEST-123", trackingUrl: "https://postex.pk/track/PEX-TEST-123", shipmentStatus: "shipped" }) });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.order.courier, "PostEx");
  assert.equal(response.body.order.trackingNumber, "PEX-TEST-123");
  assert.equal(response.body.order.trackingUrl, "https://postex.pk/track/PEX-TEST-123");
  assert.equal(response.body.order.shipmentStatus, "shipped");
  assert.equal(response.body.order.status, "shipped");
});
