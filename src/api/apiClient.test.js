import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } },
}));

const { apiRequest } = await import("./apiClient");

describe("apiRequest routing", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);
  });

  const urlOf = () => fetchMock.mock.calls[0][0];

  it("routes the invoice endpoint to the orders function", async () => {
    await apiRequest("/api/orders/FN-0001/invoice");
    expect(urlOf()).toMatch(/\/functions\/v1\/orders\/FN-0001\/invoice$/);
  });

  it("routes collect-cod to the orders function", async () => {
    await apiRequest("/api/admin/orders/FN-0001/collect-cod", { method: "POST" });
    expect(urlOf()).toMatch(/\/functions\/v1\/orders\/FN-0001\/collect-cod$/);
  });

  it("routes coupon toggle to the orders function (route now exists server-side)", async () => {
    await apiRequest("/api/coupons/cp-1/toggle", { method: "POST" });
    expect(urlOf()).toMatch(/\/functions\/v1\/orders\/coupons\/cp-1\/toggle$/);
  });

  it("sends the bearer token", async () => {
    await apiRequest("/api/orders");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("fails fast with 501 for features that are not ported", async () => {
    await expect(apiRequest("/api/chat")).rejects.toMatchObject({ status: 501, code: "NOT_YET_MIGRATED" });
    await expect(apiRequest("/api/payments/payfast/session")).rejects.toMatchObject({ status: 501 });
  });

  it("surfaces server error code and message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "LOGIN_REQUIRED", message: "Please sign in." }),
    });
    await expect(apiRequest("/api/orders", { method: "POST" })).rejects.toMatchObject({
      code: "LOGIN_REQUIRED",
      status: 401,
      message: "Please sign in.",
    });
  });

  it("surfaces VALIDATION_ERROR with structured error and message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: "VALIDATION_ERROR",
        message: "A valid customer email is required.",
        fields: { "customer.email": ["A valid customer email is required."] },
      }),
    });
    await expect(apiRequest("/api/orders", { method: "POST" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "A valid customer email is required.",
    });
  });
});
