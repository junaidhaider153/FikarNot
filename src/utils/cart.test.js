import { describe, expect, it } from "vitest";
import { getCartSummary, FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING } from "./cart";

const line = (price, qty, stock = 100) => ({ p: { id: `p${price}`, price, stock }, qty });

describe("getCartSummary", () => {
  it("defaults mirror the PKR server settings (5000 / 500), not the old USD values", () => {
    expect(FREE_SHIPPING_THRESHOLD).toBe(5000);
    expect(STANDARD_SHIPPING).toBe(500);
  });

  it("charges flat shipping below the threshold", () => {
    const s = getCartSummary([line(1000, 2)]);
    expect(s.subtotal).toBe(2000);
    expect(s.shipping).toBe(500);
    expect(s.total).toBe(2500);
    expect(s.freeShippingUnlocked).toBe(false);
    expect(s.amountToFreeShipping).toBe(3000);
  });

  it("gives free shipping at or above the threshold", () => {
    const s = getCartSummary([line(2500, 2)]);
    expect(s.shipping).toBe(0);
    expect(s.freeShippingUnlocked).toBe(true);
    expect(s.progress).toBe(100);
  });

  it("honours site-settings overrides (strings from the API)", () => {
    const s = getCartSummary([line(100, 1)], { freeShippingThreshold: "100", shippingFlatRate: "75" });
    expect(s.shipping).toBe(0);
    expect(getCartSummary([line(50, 1)], { freeShippingThreshold: "100", shippingFlatRate: "75" }).shipping).toBe(75);
  });

  it("caps quantity at available stock and drops empty lines", () => {
    const s = getCartSummary([line(100, 10, 3), line(200, 2, 0)]);
    expect(s.itemCount).toBe(3);
    expect(s.lines).toHaveLength(1);
  });

  it("does not crash on a cart line whose product no longer exists", () => {
    expect(() => getCartSummary([{ p: undefined, qty: 1 }, line(100, 1)])).not.toThrow();
    expect(getCartSummary([{ p: undefined, qty: 1 }]).itemCount).toBe(0);
  });

  it("has zero shipping for an empty cart", () => {
    expect(getCartSummary([]).shipping).toBe(0);
  });
});
