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

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function loginAdmin() {
  const response = await server.login("junaid@fikarnot.shop", "admin123");
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

test("admin can upload and inspect media metadata", async () => {
  await loginAdmin();
  const upload = await server.request("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG, originalName: "pixel.png" }),
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  assert.match(upload.body.url, /\/uploads\//);
  assert.equal(upload.body.asset.originalName, "pixel.png");
  assert.equal(upload.body.asset.mimeType, "image/png");

  const list = await server.request("/api/media?limit=10&offset=0");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const item = list.body.assets.find((asset) => asset.url === upload.body.url);
  assert.ok(item, "uploaded asset should appear in the admin media library");
  assert.equal(item.usageCount, 0);
});

test("duplicate upload reuses the existing media asset", async () => {
  const first = await server.request("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG, originalName: "one.png" }),
  });
  const second = await server.request("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG, originalName: "two.png" }),
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.body.asset.id, first.body.asset.id);
  assert.equal(second.body.url, first.body.url);
});

test("admin can delete an unused media asset and cannot delete product-referenced media", async () => {
  const upload = await server.request("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG, originalName: "cleanup.png" }),
  });
  assert.equal(upload.status, 201);
  const del = await server.request(`/api/media/${encodeURIComponent(upload.body.asset.id)}`, { method: "DELETE" });
  assert.equal(del.status, 200, JSON.stringify(del.body));

  const second = await server.request("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG, originalName: "referenced.png" }),
  });
  assert.equal(second.status, 201);
  const product = (await server.request("/api/catalog")).body.products.find((item) => item.id === "p1");
  const currentImages = Array.isArray(product.images) ? product.images : [product.image];
  const updated = await server.request("/api/catalog/products", {
    method: "POST",
    body: JSON.stringify({ product: { ...product, image: second.body.url, images: [second.body.url, ...currentImages.filter((url) => url !== second.body.url)] } }),
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const blocked = await server.request(`/api/media/${encodeURIComponent(second.body.asset.id)}`, { method: "DELETE" });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error, "MEDIA_IN_USE");
});

test("non-admin cannot access media management", async () => {
  await server.close();
  server = await startTestServer();
  const login = await server.login("urwa@fikarnot.shop", "maya123");
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const list = await server.request("/api/media");
  assert.equal(list.status, 403);
  const upload = await server.request("/api/uploads/image", { method: "POST", body: JSON.stringify({ dataUrl: ONE_PIXEL_PNG }) });
  assert.equal(upload.status, 403);
});
