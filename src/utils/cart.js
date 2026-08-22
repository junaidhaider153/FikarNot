export const FREE_SHIPPING_THRESHOLD = 75;
export const STANDARD_SHIPPING = 6.95;

export function getCartSummary(lines) {
  const safeLines = lines.map(({ p, qty }) => ({ p, qty: Math.min(qty, Math.max(0, p.stock)) })).filter(({ p, qty }) => p && qty > 0);
  const itemCount = safeLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = +safeLines.reduce((sum, line) => sum + line.p.price * line.qty, 0).toFixed(2);
  const shipping = subtotal === 0 ? 0 : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
  const amountToFreeShipping = Math.max(0, +(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2));
  const progress = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  return {
    lines: safeLines,
    itemCount,
    subtotal,
    shipping,
    total: +(subtotal + shipping).toFixed(2),
    amountToFreeShipping,
    progress,
    freeShippingUnlocked: subtotal >= FREE_SHIPPING_THRESHOLD && subtotal > 0,
  };
}
