import { describe, expect, it } from "vitest";
import { FALLBACK_PRODUCT_IMAGE, onImageError, safeHttpUrl } from "./helpers";

describe("safeHttpUrl", () => {
  it("allows http and https URLs", () => {
    expect(safeHttpUrl("https://www.fikarnot.shop/track")).toBe("https://www.fikarnot.shop/track");
    expect(safeHttpUrl("  http://localhost:5173/test  ")).toBe("http://localhost:5173/test");
  });

  it("rejects javascript:, data:, and protocol-relative URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpUrl("DATA:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeHttpUrl("//evil.example/phish")).toBe("");
    expect(safeHttpUrl("/relative/path")).toBe("");
    expect(safeHttpUrl("")).toBe("");
  });

  it("allows single-slash relative URLs only when allowRelative is true", () => {
    expect(safeHttpUrl("/verify-email?token=abc", { allowRelative: true })).toBe("/verify-email?token=abc");
    expect(safeHttpUrl("//evil.example/phish", { allowRelative: true })).toBe("");
    expect(safeHttpUrl("javascript:void(0)", { allowRelative: true })).toBe("");
  });
});

describe("onImageError", () => {
  it("replaces failed image source with bundled placeholder SVG once", () => {
    const img = { src: "https://broken.example/item.jpg", dataset: {} };
    onImageError({ currentTarget: img });
    expect(img.src).toBe(FALLBACK_PRODUCT_IMAGE);
    expect(img.dataset.fallbackApplied).toBe("1");

    // Second invocation should be a no-op to avoid loops.
    img.src = "custom";
    onImageError({ currentTarget: img });
    expect(img.src).toBe("custom");
  });
});
