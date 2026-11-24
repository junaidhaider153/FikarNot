import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../../store/appStore";
import { ordersApi } from "../../api/ordersApi";
import { fmt } from "../../utils/helpers";
import { Ic } from "../icons";
import { Pagination } from "../common";
import { usePagination } from "../../hooks/usePagination";

export async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    appActions.toast(successMessage || "Copied");
  } catch {
    appActions.toast("Could not copy to clipboard", "err");
  }
}

export function ShipmentManager({ order }) {
  const [open, setOpen] = useState(false);
  const [courier, setCourier] = useState(order.courier || "PostEx");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || "");
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl || "");
  const [shipmentStatus, setShipmentStatus] = useState(order.shipmentStatus || "not_created");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCourier(order.courier || "PostEx");
    setTrackingNumber(order.trackingNumber || "");
    setTrackingUrl(order.trackingUrl || "");
    setShipmentStatus(order.shipmentStatus || "not_created");
  }, [order.courier, order.trackingNumber, order.trackingUrl, order.shipmentStatus]);

  const rawCustomerPhone = String(order.customer?.phone || "").replace(/\D/g, "");
  const customerPhone = rawCustomerPhone.startsWith("92")
    ? rawCustomerPhone
    : rawCustomerPhone.startsWith("0")
      ? `92${rawCustomerPhone.slice(1)}`
      : rawCustomerPhone;
  const whatsappText = order.trackingNumber
    ? `Hello ${order.customer?.name || "there"}, your FikarNot order ${order.id} has been shipped via ${order.courier || "courier"}. Tracking ID: ${order.trackingNumber}.${order.trackingUrl ? ` Track it here: ${order.trackingUrl}` : ""}`
    : `Hello ${order.customer?.name || "there"}, this is FikarNot regarding your order ${order.id}.`;
  const postexDetails = [
    `FikarNot Order: ${order.id}`,
    `Customer: ${order.customer?.name || ""}`,
    `Phone: ${order.customer?.phone || ""}`,
    `Address: ${order.customer?.address || ""}`,
    `COD Amount: ${order.paymentMethod === "cod" ? fmt(order.total) : "N/A"}`,
    `Items: ${(order.items || []).map((item) => `${item.qty}x ${item.name}`).join(", ")}`,
  ].join("\n");

  const save = async () => {
    setSaving(true);
    try {
      await appActions.setOrderFulfilment(order.id, {
        courier: courier.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim(),
        shipmentStatus,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shipment-manager">
      <div className="shipment-summary">
        <span className="status-pill">{String(order.shipmentStatus || "not_created").replaceAll("_", " ")}</span>
        {order.trackingNumber ? (
          <span className="shipment-ref">
            {order.courier || "Courier"} · {order.trackingNumber}
          </span>
        ) : (
          <span className="shipment-ref">No tracking yet</span>
        )}
      </div>
      <div className="shipment-actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyText(postexDetails, "Shipment details copied")}>
          Copy details
        </button>
        {customerPhone && (
          <a
            className="btn btn-ghost btn-sm"
            href={`https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            WhatsApp
          </a>
        )}
        <Link
          className="btn btn-ghost btn-sm"
          to={`/admin/orders/${encodeURIComponent(order.id)}/packing-slip`}
          target="_blank"
          rel="noreferrer"
        >
          Packing slip ↗
        </Link>
        <button className="btn btn-dark btn-sm" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          {open ? "Close" : order.trackingNumber ? "Update shipment" : "Create shipment"}
        </button>
      </div>
      {open && (
        <div className="shipment-editor" aria-label={`Manage shipment for ${order.id}`}>
          <div className="shipment-editor-grid">
            <div>
              <label className="lbl" htmlFor={`courier-${order.id}`}>
                Courier
              </label>
              <select id={`courier-${order.id}`} className="select" value={courier} onChange={(event) => setCourier(event.target.value)}>
                <option value="PostEx">PostEx</option>
                <option value="TCS">TCS</option>
                <option value="Leopards">Leopards</option>
                <option value="M&amp;P">M&amp;P</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor={`tracking-${order.id}`}>
                Tracking number
              </label>
              <input
                id={`tracking-${order.id}`}
                className="input"
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder="Enter courier tracking ID"
              />
            </div>
            <div className="f-full">
              <label className="lbl" htmlFor={`tracking-url-${order.id}`}>
                Tracking URL <span style={{ fontWeight: 400, color: "var(--ink2)" }}>(optional)</span>
              </label>
              <input
                id={`tracking-url-${order.id}`}
                className="input"
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
            <div>
              <label className="lbl" htmlFor={`shipment-status-${order.id}`}>
                Shipment status
              </label>
              <select
                id={`shipment-status-${order.id}`}
                className="select"
                value={shipmentStatus}
                onChange={(event) => setShipmentStatus(event.target.value)}
              >
                <option value="not_created">Not created</option>
                <option value="ready_to_ship">Ready to ship</option>
                <option value="shipped">Shipped</option>
                <option value="in_transit">In transit</option>
                <option value="delivered">Delivered</option>
                <option value="returned">Returned</option>
              </select>
            </div>
          </div>
          <div className="shipment-copy-row">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => copyText(order.customer?.address || "", "Customer address copied")}
            >
              Copy address
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => copyText(order.customer?.phone || "", "Customer phone copied")}
            >
              Copy phone
            </button>
            {order.paymentMethod === "cod" && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyText(String(order.total), "COD amount copied")}>
                Copy COD amount
              </button>
            )}
            <button className="btn btn-dark btn-sm" type="button" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save shipment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrdersTab() {
  const s = useApp();
  const [filter, setFilter] = useState("all");
  const [viewingProofId, setViewingProofId] = useState(null);
  const filtered = filter === "all" ? s.orders : s.orders.filter((o) => o.status === filter);
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(filtered, 10);

  const viewPaymentProof = async (orderId) => {
    const popup = window.open("about:blank", "_blank");
    try {
      setViewingProofId(orderId);
      const res = await ordersApi.getPaymentProof(orderId);
      if (res?.url) {
        if (popup) {
          popup.location.href = res.url;
        } else {
          window.open(res.url, "_blank", "noopener,noreferrer");
        }
      } else {
        if (popup) popup.close();
        appActions.toast("Could not retrieve payment proof URL", "err");
      }
    } catch (err) {
      if (popup) popup.close();
      appActions.toast(err.message || "Could not retrieve payment proof", "err");
    } finally {
      setViewingProofId(null);
    }
  };
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <label className="field-hint" htmlFor="order-status-filter" style={{ marginRight: 8 }}>
          Filter by status:
        </label>
        <select
          id="order-status-filter"
          className="select"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter orders by status"
        >
          <option value="all">All statuses ({s.orders.length})</option>
          <option value="pending_payment">Pending payment ({s.orders.filter((o) => o.status === "pending_payment").length})</option>
          <option value="paid">Paid ({s.orders.filter((o) => o.status === "paid").length})</option>
          <option value="processing">Processing ({s.orders.filter((o) => o.status === "processing").length})</option>
          <option value="shipped">Shipped ({s.orders.filter((o) => o.status === "shipped").length})</option>
          <option value="delivered">Delivered ({s.orders.filter((o) => o.status === "delivered").length})</option>
          <option value="cancelled">Cancelled ({s.orders.filter((o) => o.status === "cancelled").length})</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="tbl orders-admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Shipment</th>
              <th className="u-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((o) => (
              <tr key={o.id}>
                <td>
                  <b>{o.id}</b>
                </td>
                <td>
                  <div>{o.customer.name}</div>
                  <div className="field-hint">{o.customer.email}</div>
                  {o.customer.phone && <div className="field-hint">{o.customer.phone}</div>}
                </td>
                <td style={{ maxWidth: 260 }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
                <td>{fmt(o.total)}</td>
                <td style={{ color: "var(--ink2)" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                <td>
                  <select
                    className="status-sel"
                    value={o.status}
                    aria-label={`Status for order ${o.id}`}
                    onChange={(e) => appActions.setOrderStatus(o.id, e.target.value)}
                  >
                    <option disabled={o.status === "shipped" || o.status === "delivered"}>pending_payment</option>
                    <option disabled={o.status === "pending_payment"}>paid</option>
                    <option disabled={o.status === "pending_payment"}>processing</option>
                    <option disabled={o.status === "pending_payment"}>shipped</option>
                    <option disabled={o.status === "pending_payment"}>delivered</option>
                    <option>cancelled</option>
                  </select>
                </td>
                <td>
                  <div style={{ fontSize: 12 }}>
                    <b>{o.paymentStatus || "—"}</b>
                  </div>
                  {o.paymentMethod && <div className="field-hint">{o.paymentMethod}</div>}
                  {o.paymentReference && (
                    <div className="field-hint" style={{ marginTop: 2, wordBreak: "break-all" }}>
                      <strong>Ref:</strong> {o.paymentReference}
                    </div>
                  )}
                  {o.paymentNote && (
                    <div className="field-hint" style={{ marginTop: 2, wordBreak: "break-word" }}>
                      <strong>Note:</strong> {o.paymentNote}
                    </div>
                  )}
                  {o.paymentProof && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={viewingProofId === o.id}
                        onClick={() => viewPaymentProof(o.id)}
                      >
                        {viewingProofId === o.id ? "Opening…" : "View slip"}
                      </button>
                      {o.paymentStatus === "pending" && ["jazzcash", "easypaisa", "bank_transfer"].includes(o.paymentMethod) && (
                        <button
                          className="btn btn-dark btn-sm"
                          type="button"
                          onClick={() => appActions.confirmPayment(o.id, { providerReference: o.paymentReference || "" })}
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  )}
                  {o.paymentMethod === "cod" && o.paymentStatus !== "paid" && o.status !== "cancelled" && (
                    <div style={{ marginTop: 6 }}>
                      <button className="btn btn-dark btn-sm" type="button" onClick={() => appActions.collectCod(o.id)}>
                        Mark COD Collected
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  <ShipmentManager order={o} />
                </td>
                <td className="u-right">
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={`/admin/orders/${encodeURIComponent(o.id)}/packing-slip`}
                      target="_blank"
                      rel="noreferrer"
                      title="Print packing slip & shipping label"
                    >
                      Slip ↗
                    </Link>
                    <button
                      className="icon-btn"
                      aria-label={`Delete order ${o.id}`}
                      title="Delete order"
                      onClick={() => {
                        if (window.confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) appActions.deleteOrder(o.id);
                      }}
                    >
                      <Ic n="trash" s={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="orders" />
    </>
  );
}
