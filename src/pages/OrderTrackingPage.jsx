import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ordersApi } from "../api/ordersApi";
import { fmt } from "../utils/helpers";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useApp } from "../store/appStore";
import { WHATSAPP_NUMBER } from "../config/appConfig";
import { CopyButton } from "./CheckoutPage";
import { OrderProgress } from "./AccountPage";

const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank_transfer: "Bank transfer",
  payfast: "Online payment",
};

export default function OrderTrackingPage() {
  const s = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get("id") || searchParams.get("orderId") || "");
  const [contact, setContact] = useState(searchParams.get("contact") || searchParams.get("phone") || "");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useDocumentMeta({ title: order ? `Track Order #${order.id}` : "Track Your Order" });

  const storeWhatsApp = String(s?.siteSettings?.whatsappNumber || WHATSAPP_NUMBER || "923709072688").replace(/[^0-9]/g, "");

  const performLookup = async (lookupId, lookupContact) => {
    if (!lookupId.trim() || !lookupContact.trim()) {
      setError("Please provide both your Order ID and phone number or email.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await ordersApi.lookup(lookupId.trim(), lookupContact.trim());
      if (res?.order) {
        setOrder(res.order);
        setSearchParams({ id: lookupId.trim(), contact: lookupContact.trim() });
      } else {
        setError("No order found matching those details.");
      }
    } catch (err) {
      setError(err.message || "Could not find an order with the provided details. Please check and try again.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const queryId = searchParams.get("id") || searchParams.get("orderId");
    const queryContact = searchParams.get("contact") || searchParams.get("phone");
    if (queryId && queryContact) {
      setOrderId(queryId);
      setContact(queryContact);
      performLookup(queryId, queryContact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    performLookup(orderId, contact);
  };

  const handleReset = () => {
    setOrder(null);
    setError("");
    setOrderId("");
    setContact("");
    setSearchParams({});
  };

  return (
    <div className="container" style={{ padding: "40px 24px", maxWidth: 760 }}>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <p className="eyebrow" style={{ justifyContent: "center" }}>
          FikarNot Delivery Tracking
        </p>
        <h1 className="h1" style={{ fontSize: 32, margin: "6px 0 10px" }}>
          Track your order
        </h1>
        <p style={{ color: "var(--ink2)", maxWidth: "50ch", margin: "0 auto", fontSize: 14 }}>
          Enter your Order ID (from your confirmation message or email) and the mobile phone number or email you used at checkout.
        </p>
      </div>

      {!order ? (
        <div className="panel" style={{ padding: 24, margin: "0 auto" }}>
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label className="lbl" htmlFor="track-order-id">
                  Order ID
                </label>
                <input
                  id="track-order-id"
                  className="input"
                  value={orderId}
                  onChange={(e) => {
                    setOrderId(e.target.value);
                    setError("");
                  }}
                  placeholder="e.g. FN-1001"
                  autoComplete="off"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="lbl" htmlFor="track-contact">
                  Mobile phone or email
                </label>
                <input
                  id="track-contact"
                  className="input"
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                    setError("");
                  }}
                  placeholder="0300 1234567 or you@example.com"
                  autoComplete="off"
                  disabled={loading}
                />
              </div>

              {error && (
                <p className="f-err" role="alert" style={{ margin: 0 }}>
                  {error}
                </p>
              )}

              <button className="btn btn-lime" type="submit" disabled={loading} style={{ width: "100%", padding: 12 }}>
                {loading ? "Locating your order…" : "Track order"} <Ic n="arrow" s={15} />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="order-tracking-result" style={{ display: "grid", gap: 20 }}>
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 22, margin: 0 }}>Order #{order.id}</h2>
                  <span className={`status-pill ${order.status}`} style={{ textTransform: "capitalize" }}>
                    {order.status.replace("_", " ")}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", color: "var(--ink2)", fontSize: 13 }}>
                  Placed on {new Date(order.createdAt).toLocaleDateString("en-PK", { dateStyle: "long" })}
                </p>
              </div>

              <button className="btn btn-ghost btn-sm" onClick={handleReset} type="button">
                Track another order
              </button>
            </div>

            <div style={{ marginTop: 24 }}>
              <OrderProgress status={order.status} order={order} />
            </div>

            {order.trackingNumber && (
              <div
                className="courier-dispatch-banner"
                style={{
                  background: "rgba(184, 240, 41, 0.15)",
                  border: "1px solid rgba(184, 240, 41, 0.4)",
                  borderRadius: 8,
                  padding: "14px 18px",
                  margin: "24px 0 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 14 }}>
                    <Ic n="truck" s={16} /> Dispatched via {order.courier || "Courier"}
                  </strong>
                  <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink)" }}>
                    Tracking Number: <code style={{ fontWeight: "bold", fontSize: 14 }}>{order.trackingNumber}</code>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <CopyButton text={order.trackingNumber} label="Copy Tracking ID" />
                  {order.trackingUrl && (
                    <a className="btn btn-dark btn-sm" href={order.trackingUrl} target="_blank" rel="noreferrer noopener">
                      Track with {order.courier || "Courier"} ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Items in this order</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {(order.items || []).map((item) => (
                  <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                    <span>
                      {item.qty} × {item.name}
                    </span>
                    <strong>{fmt(item.price * item.qty, order.currency)}</strong>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                  <span>Subtotal</span>
                  <span>{fmt(order.subtotal, order.currency)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                  <span>Shipping</span>
                  <span>{order.shipping === 0 ? "Free" : fmt(order.shipping, order.currency)}</span>
                </div>
                {order.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0", color: "#16a34a" }}>
                    <span>Discount</span>
                    <span>−{fmt(order.discount, order.currency)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 16,
                    fontWeight: 700,
                    padding: "8px 0 0",
                    marginTop: 6,
                    borderTop: "1px dashed var(--line)",
                  }}
                >
                  <span>Total</span>
                  <span>{fmt(order.total, order.currency)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13 }}>
              <div>
                <strong>Delivery details:</strong> {order.customer?.name} ({order.customer?.phone || "No phone"}) ·{" "}
                {order.customer?.address}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Payment method:</strong> {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod} (
                <span style={{ textTransform: "capitalize" }}>{order.paymentStatus}</span>)
              </div>
            </div>

            {storeWhatsApp && (
              <div style={{ marginTop: 24, textAlign: "center" }}>
                <a
                  className="btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#25D366",
                    borderColor: "#25D366",
                    color: "#ffffff",
                    padding: "10px 20px",
                    fontWeight: 600,
                    borderRadius: 6,
                    textDecoration: "none",
                  }}
                  href={`https://wa.me/${storeWhatsApp}?text=${encodeURIComponent(`Assalam-o-Alaikum! I have a question regarding order #${order.id}.`)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Ic n="chat" s={16} />
                  <span>Ask about this order on WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <Link className="btn btn-ghost" to="/">
          Back to homepage
        </Link>
      </div>
    </div>
  );
}
