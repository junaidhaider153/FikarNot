// Plain, inline-styled templates (HTML + text) for the commerce emails.
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const money = (n: number, currency: string) =>
  `${currency} ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const appUrl = () => {
  try {
    return (Deno.env.get("APP_PUBLIC_URL") || "").replace(/\/$/, "");
  } catch {
    return "";
  }
};

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#222">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:28px">
<tr><td><h2 style="margin:0 0 16px;color:#b8541c">FikarNot</h2><h3 style="margin:0 0 12px">${esc(title)}</h3>${bodyHtml}
<p style="color:#888;font-size:12px;margin-top:28px">You received this because you placed an order at FikarNot. Questions? Just reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

type Item = { name: string; price: number; qty: number };
type Order = {
  id: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  currency: string;
  paymentMethod: string;
  customerName: string;
};

export function orderConfirmation(o: Order, items: Item[]) {
  const rows = items
    .map((i) => `<tr><td>${esc(i.name)} × ${i.qty}</td><td align="right">${money(i.price * i.qty, o.currency)}</td></tr>`)
    .join("");
  const manual = ["jazzcash", "easypaisa", "bank_transfer"].includes(o.paymentMethod);
  const next = manual
    ? "Please send your payment and upload the payment slip from your account page so we can confirm it."
    : "You will pay in cash when your order is delivered.";
  const link = appUrl() ? `<p><a href="${esc(appUrl())}/account">View your order</a></p>` : "";
  return {
    subject: `Order ${o.id} received — FikarNot`,
    html: shell(
      `Thank you, ${o.customerName || "there"}!`,
      `<p>We received order <strong>${esc(o.id)}</strong>.</p><table width="100%" cellpadding="4" style="font-size:14px">${rows}
<tr><td>Shipping</td><td align="right">${money(o.shipping, o.currency)}</td></tr>
${o.discount ? `<tr><td>Discount</td><td align="right">−${money(o.discount, o.currency)}</td></tr>` : ""}
<tr><td><strong>Total</strong></td><td align="right"><strong>${money(o.total, o.currency)}</strong></td></tr></table><p>${esc(next)}</p>${link}`,
    ),
    text: `Thank you! We received order ${o.id}.\n\n${items.map((i) => `${i.name} x${i.qty}  ${money(i.price * i.qty, o.currency)}`).join("\n")}\n\nShipping: ${money(o.shipping, o.currency)}\nTotal: ${money(o.total, o.currency)}\n\n${next}`,
  };
}

export function paymentConfirmed(orderId: string) {
  return {
    subject: `Payment confirmed for order ${orderId}`,
    html: shell(
      "Payment confirmed",
      `<p>We verified your payment for order <strong>${esc(orderId)}</strong>. We are now preparing it for dispatch.</p>`,
    ),
    text: `We verified your payment for order ${orderId}. We are now preparing it for dispatch.`,
  };
}

export function trackingAdded(orderId: string, courier: string, trackingNumber: string, trackingUrl: string) {
  const safeUrl = /^https?:\/\//i.test(trackingUrl) ? trackingUrl : "";
  return {
    subject: `Your order ${orderId} has shipped`,
    html: shell(
      "Your order is on its way",
      `<p>Order <strong>${esc(orderId)}</strong> shipped with <strong>${esc(courier || "our courier")}</strong>.</p><p>Tracking number: <strong>${esc(trackingNumber)}</strong></p>${safeUrl ? `<p><a href="${esc(safeUrl)}">Track your parcel</a></p>` : ""}`,
    ),
    text: `Order ${orderId} shipped with ${courier || "our courier"}. Tracking number: ${trackingNumber}${safeUrl ? `\nTrack: ${safeUrl}` : ""}`,
  };
}
