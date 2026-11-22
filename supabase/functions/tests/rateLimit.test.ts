import { assertEquals } from "@std/assert";
import { limit } from "../_shared/rateLimit.ts";

Deno.test("rateLimit: returns null when limit is not exceeded", async () => {
  let calledWith: Record<string, unknown> | null = null;
  const mockClient = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      assertEquals(fn, "rate_limit_hit");
      calledWith = params;
      return { data: true, error: null };
    },
  };

  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "203.0.113.195" },
  });

  const res = await limit(req, "test_bucket", 10, 60, mockClient);
  assertEquals(res, null);
  assertEquals(calledWith, {
    p_key: "test_bucket:203.0.113.195",
    p_window_seconds: 60,
    p_limit: 10,
  });
});

Deno.test("rateLimit: returns 429 when rate limit is exceeded", async () => {
  const mockClient = {
    rpc: async () => ({ data: false, error: null }),
  };

  const req = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "198.51.100.1" },
  });

  const res = await limit(req, "orders_checkout", 5, 300, mockClient);
  assertEquals(res !== null, true);
  if (res) {
    assertEquals(res.status, 429);
    const body = await res.json();
    assertEquals(body.error, "RATE_LIMITED");
    assertEquals(typeof body.message, "string");
  }
});

Deno.test("rateLimit: fails open (returns null) on database error or thrown exception", async () => {
  const mockClientError = {
    rpc: async () => ({ data: null, error: new Error("relation rate_limits does not exist") }),
  };
  const req = new Request("http://localhost/");
  assertEquals(await limit(req, "test", 5, 60, mockClientError), null);

  const mockClientThrow = {
    rpc: async () => {
      throw new Error("network timeout");
    },
  };
  assertEquals(await limit(req, "test", 5, 60, mockClientThrow), null);
});
