import { describe, expect, it } from "vitest";
import { getCouponDiscount, isCouponUsable, normalizeCouponCode } from "./coupons";

describe("coupons", () => {
  it("normalises codes", () => {
    expect(normalizeCouponCode("  save 10 ")).toBe("SAVE10");
  });

  it("treats an ISO-string expiry in the past as expired (regression: was always 'usable')", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isCouponUsable({ active: true, expiresAt: past })).toBe(false);
    expect(isCouponUsable({ active: true, expiresAt: future })).toBe(true);
  });

  it("rejects inactive or exhausted coupons", () => {
    expect(isCouponUsable({ active: false })).toBe(false);
    expect(isCouponUsable({ active: true, maxUses: 5, usedCount: 5 })).toBe(false);
    expect(isCouponUsable(null)).toBe(false);
  });

  it("computes percent, fixed and free-shipping discounts", () => {
    expect(getCouponDiscount({ type: "percent", value: 10 }, 1000)).toEqual({ discount: 100, shippingFree: false });
    expect(getCouponDiscount({ type: "fixed", value: 5000 }, 1000)).toEqual({ discount: 1000, shippingFree: false });
    expect(getCouponDiscount({ type: "free_shipping" }, 1000, 500)).toEqual({ discount: 0, shippingFree: true });
  });

  it("enforces the minimum subtotal", () => {
    expect(getCouponDiscount({ type: "percent", value: 10, minSubtotal: 2000 }, 1000).discount).toBe(0);
  });
});
