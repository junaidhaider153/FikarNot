import { describe, expect, it } from "vitest";
import { canCancelOrder, canRequestReturn } from "./returns";

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

  it("disallows return for non-delivered orders", () => {
    expect(canRequestReturn({ status: "processing" })).toBe(false);
    expect(canRequestReturn({ status: "pending_payment" })).toBe(false);
  });
});
