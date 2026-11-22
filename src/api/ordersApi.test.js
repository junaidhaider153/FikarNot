import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({
  apiRequest: vi.fn(),
}));

const { apiRequest } = await import("./apiClient");
const { ordersApi } = await import("./ordersApi");

describe("ordersApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls list and create", async () => {
    apiRequest.mockResolvedValueOnce({ orders: [] });
    await ordersApi.list();
    expect(apiRequest).toHaveBeenCalledWith("/api/orders", undefined, "Order request failed");

    apiRequest.mockResolvedValueOnce({ order: { id: "FN-1" } });
    await ordersApi.create({ customer: { name: "Ali" }, items: [] });
    expect(apiRequest).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ method: "POST" }), "Order request failed");
  });

  it("handles payment proof upload and retrieval", async () => {
    apiRequest.mockResolvedValueOnce({ proof: { id: "proof-1" } });
    await ordersApi.uploadPaymentProof("FN-100", { dataUrl: "data:image/png;base64,...", reference: "TRX-123" });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/orders/FN-100/payment-proof",
      expect.objectContaining({ method: "POST" }),
      "Order request failed",
    );

    apiRequest.mockResolvedValueOnce({ url: "https://storage.example.com/slip.png" });
    const slip = await ordersApi.getPaymentProof("FN-100");
    expect(apiRequest).toHaveBeenCalledWith("/api/admin/orders/FN-100/payment-proof", undefined, "Order request failed");
    expect(slip.url).toBe("https://storage.example.com/slip.png");
  });

  it("handles payment confirmation and COD collection", async () => {
    apiRequest.mockResolvedValueOnce({ order: { id: "FN-100", status: "processing", paymentStatus: "paid" } });
    await ordersApi.confirmPayment("FN-100", { providerReference: "BANK-REF-99" });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/admin/orders/FN-100/confirm-payment",
      expect.objectContaining({ method: "POST" }),
      "Order request failed",
    );

    apiRequest.mockResolvedValueOnce({ order: { id: "FN-100", paymentStatus: "paid" } });
    await ordersApi.collectCod("FN-100");
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/admin/orders/FN-100/collect-cod",
      expect.objectContaining({ method: "POST" }),
      "Order request failed",
    );
  });
});
