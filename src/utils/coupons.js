export function normalizeCouponCode(value = "") {
  return String(value).trim().toUpperCase().replace(/\s+/g, "");
}

export function isCouponUsable(coupon, now = Date.now()) {
  if (!coupon || coupon.active === false) return false;
  if (coupon.expiresAt && now > coupon.expiresAt) return false;
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return false;
  return true;
}

export function getCouponDiscount(coupon, subtotal, shipping = 0) {
  if (!coupon || subtotal <= 0) return { discount: 0, shippingFree: false };
  if (subtotal < Number(coupon.minSubtotal || 0)) return { discount: 0, shippingFree: false };
  if (coupon.type === "percent") {
    return { discount: +Math.min(subtotal, subtotal * (Number(coupon.value || 0) / 100)).toFixed(2), shippingFree: false };
  }
  if (coupon.type === "fixed") {
    return { discount: +Math.min(subtotal, Number(coupon.value || 0)).toFixed(2), shippingFree: false };
  }
  if (coupon.type === "free_shipping") return { discount: 0, shippingFree: shipping > 0 };
  return { discount: 0, shippingFree: false };
}

export function couponDescription(coupon) {
  if (!coupon) return "";
  if (coupon.type === "percent") return `${coupon.value}% off`;
  if (coupon.type === "fixed") return `$${Number(coupon.value).toFixed(0)} off`;
  return "Free shipping";
}
