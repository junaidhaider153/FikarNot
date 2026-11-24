import { describe, expect, it } from "vitest";
import { canCancelOrder, canRequestReturn, normalizeReturnRequest } from "./returns";

describe("canCancelOrder", () => {
  it("allows cancellation for pending_payment, paid, and processing orders", () => {
    expect(canCancelOrder({ status: "pending_payment" })).toBe(true);
    expect(canCancelOrder({ status: "paid" })).toBe(true);
    expect(canCancelOrder({ status: "processing" })).toBe(true);
  });

  it("disallows cancellation for shipped, delivered, or cancelled orders", () => {
    expect(canCancelOrder({ status: "shipped" })).toBe(false);
    expect(canCancelOrder({ status: "delivered" })).toBe(false);
    expect(canCancelOrder({ status: "cancelled" })).toBe(false);
  });

  it("disallows cancellation if a return request already exists", () => {
    expect(canCancelOrder({ status: "pending_payment", returnRequest: "ret-1" })).toBe(false);
  });
});

describe("canRequestReturn", () => {
  it("allows return for delivered orders within 30 days", () => {
    const now = 1000000000;
    expect(canRequestReturn({ status: "delivered", createdAt: now - 5000 }, now)).toBe(true);
  });

  it("uses deliveredAt rather than createdAt when order delivery was more recent", () => {
    const createdAt = Date.parse("2026-01-01T00:00:00.000Z");
    const deliveredAt = Date.parse("2026-03-01T00:00:00.000Z");
    const now = Date.parse("2026-03-10T00:00:00.000Z");
    expect(canRequestReturn({ status: "delivered", createdAt, deliveredAt }, now)).toBe(true);
    expect(canRequestReturn({ status: "delivered", createdAt }, now)).toBe(false);
  });

  it("disallows return for non-delivered orders", () => {
    expect(canRequestReturn({ status: "processing" })).toBe(false);
    expect(canRequestReturn({ status: "pending_payment" })).toBe(false);
  });
});

describe("normalizeReturnRequest", () => {
  it("parses ISO timestamps into numeric epoch milliseconds and preserves refund info", () => {
    const iso = "2026-11-24T12:34:56.000Z";
    const norm = normalizeReturnRequest({
      id: "ret-1",
      order_id: "FN-001",
      reason: "Damaged item",
      status: "completed",
      created_at: iso,
      refund: { status: "refunded", amount: 2500 },
    });
    expect(norm.createdAt).toBe(Date.parse(iso));
    expect(norm.orderId).toBe("FN-001");
    expect(norm.refund).toEqual({ status: "refunded", amount: 2500 });
  });
});
