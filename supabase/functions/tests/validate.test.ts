import { assertEquals } from "@std/assert";
import { validateJson, z } from "../_shared/validate.ts";

Deno.test("validate: passes valid data and applies transformations", async () => {
  const schema = z.object({
    name: z.string().trim(),
    age: z.number().int().positive(),
  });

  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "  Alice  ", age: 30 }),
  });

  const res = await validateJson(req, schema);
  assertEquals(res.success, true);
  if (res.success) {
    assertEquals(res.data, { name: "Alice", age: 30 });
  }
});

Deno.test("validate: parses empty body to default object", async () => {
  const schema = z.object({
    note: z.string().default("n/a"),
  });

  const req = new Request("http://localhost/", {
    method: "POST",
    body: "",
  });

  const res = await validateJson(req, schema);
  assertEquals(res.success, true);
  if (res.success) {
    assertEquals(res.data, { note: "n/a" });
  }
});

Deno.test("validate: enforces content-length header byte limit with 413", async () => {
  const schema = z.object({ test: z.string() });
  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-length": "2048" },
    body: "{}",
  });

  const res = await validateJson(req, schema, 1024);
  assertEquals(res.success, false);
  if (!res.success) {
    assertEquals(res.response.status, 413);
    const body = await res.response.json();
    assertEquals(body.error, "PAYLOAD_TOO_LARGE");
    assertEquals(body.message, "Request body exceeds maximum size of 1024 bytes.");
  }
});

Deno.test("validate: enforces raw body length byte limit with 413", async () => {
  const schema = z.object({ text: z.string() });
  const raw = JSON.stringify({ text: "x".repeat(200) });
  const req = new Request("http://localhost/", {
    method: "POST",
    body: raw,
  });

  const res = await validateJson(req, schema, 100);
  assertEquals(res.success, false);
  if (!res.success) {
    assertEquals(res.response.status, 413);
    const body = await res.response.json();
    assertEquals(body.error, "PAYLOAD_TOO_LARGE");
  }
});

Deno.test("validate: returns 400 VALIDATION_ERROR on malformed JSON", async () => {
  const schema = z.object({ text: z.string() });
  const req = new Request("http://localhost/", {
    method: "POST",
    body: "{ malformed json: true",
  });

  const res = await validateJson(req, schema);
  assertEquals(res.success, false);
  if (!res.success) {
    assertEquals(res.response.status, 400);
    const body = await res.response.json();
    assertEquals(body.error, "VALIDATION_ERROR");
    assertEquals(body.message, "Malformed JSON body.");
    assertEquals(body.fields._root, ["Malformed JSON body."]);
  }
});

Deno.test("validate: returns 400 with structured fields on schema validation failure", async () => {
  const schema = z.object({
    email: z.string().email("Invalid email address"),
    quantity: z.number().min(1, "Must be at least 1"),
  });

  const req = new Request("http://localhost/", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email", quantity: 0 }),
  });

  const res = await validateJson(req, schema);
  assertEquals(res.success, false);
  if (!res.success) {
    assertEquals(res.response.status, 400);
    const body = await res.response.json();
    assertEquals(body.error, "VALIDATION_ERROR");
    assertEquals(Array.isArray(body.fields.email), true);
    assertEquals(body.fields.email[0], "Invalid email address");
    assertEquals(Array.isArray(body.fields.quantity), true);
    assertEquals(body.fields.quantity[0], "Must be at least 1");
  }
});
