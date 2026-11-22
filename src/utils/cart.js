// Defaults mirror the server (PKR). Real values come from site settings and are
// passed in by the caller; the server recomputes everything at checkout.
export const FREE_SHIPPING_THRESHOLD = 5000;
export const STANDARD_SHIPPING = 500;

export function getCartSummary(lines, options = {}) {
  const threshold = Number.isFinite(Number(options.freeShippingThreshold))
    ? Number(options.freeShippingThreshold)
    : FREE_SHIPPING_THRESHOLD;
  const flatRate = Number.isFinite(Number(options.shippingFlatRate)) ? Number(options.shippingFlatRate) : STANDARD_SHIPPING;
  const safeLines = lines
    .filter((line) => line && line.p)
    .map(({ p, qty }) => ({ p, qty: Math.min(qty, Math.max(0, p.stock)) }))
    .filter(({ qty }) => qty > 0);
  const itemCount = safeLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = +safeLines.reduce((sum, line) => sum + line.p.price * line.qty, 0).toFixed(2);
  const shipping = subtotal === 0 ? 0 : subtotal >= threshold ? 0 : flatRate;
  const amountToFreeShipping = Math.max(0, +(threshold - subtotal).toFixed(2));
  const progress = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 100;

  return {
    lines: safeLines,
    itemCount,
    subtotal,
    shipping,
    total: +(subtotal + shipping).toFixed(2),
    amountToFreeShipping,
    progress,
    freeShippingUnlocked: subtotal >= threshold && subtotal > 0,
  };
}
