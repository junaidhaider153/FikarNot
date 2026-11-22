import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ordersApi } from "../api/ordersApi";
import { fmt } from "../utils/helpers";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const PAYMENT_LABELS = { cod: "Cash on delivery", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank_transfer: "Bank transfer" };

/** Printable invoice. Served by GET /orders/:id/invoice (order owner or staff only). */
export default function InvoicePage() {
  const { orderId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  useDocumentMeta({ title: `Invoice ${orderId}`, noindex: true });

  useEffect(() => {
    let cancelled = false;
    ordersApi
      .invoice(orderId)
      .then((result) => !cancelled && setInvoice(result.invoice))
      .catch((e) => !cancelled && setError(e.message || "Could not load this invoice."));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="container" style={{ padding: "48px 0" }} role="alert">
        <h1 className="display">Invoice unavailable</h1>
        <p>{error}</p>
        <Link className="btn btn-ghost" to="/account">
          Back to my account
        </Link>
      </div>
    );
  }
  if (!invoice)
    return (
      <div className="container" style={{ padding: "48px 0" }} role="status">
        Loading invoice…
      </div>
    );

  const { store, order } = invoice;
  const money = (n) => fmt(n, order.currency);
  return (
    <div className="container" style={{ padding: "32px 0", maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="display" style={{ margin: 0 }}>
            {store.name}
          </h1>
          {store.address && <div>{store.address}</div>}
          {store.email && <div>{store.email}</div>}
          {store.phone && <div>{store.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h2 style={{ margin: 0 }}>Invoice</h2>
          <div>{order.invoiceNumber || order.id}</div>
          <div>Order {order.id}</div>
          <div>{new Date(order.createdAt).toLocaleDateString("en-PK")}</div>
        </div>
      </div>

      <hr style={{ margin: "20px 0" }} />
      <div>
        <strong>Billed to</strong>
        <div>{order.customer.name}</div>
        <div>{order.customer.email}</div>
        {order.customer.phone && <div>Phone: {order.customer.phone}</div>}
        <div>{order.customer.address}</div>
        <div>
          Payment: {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod} · {order.paymentStatus}
        </div>
      </div>

      <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th scope="col">Item</th>
            <th scope="col" style={{ textAlign: "right" }}>
              Qty
            </th>
            <th scope="col" style={{ textAlign: "right" }}>
              Price
            </th>
            <th scope="col" style={{ textAlign: "right" }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.productId} style={{ borderBottom: "1px solid #eee" }}>
              <td>{item.name}</td>
              <td style={{ textAlign: "right" }}>{item.qty}</td>
              <td style={{ textAlign: "right" }}>{money(item.price)}</td>
              <td style={{ textAlign: "right" }}>{money(item.price * item.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 260, marginTop: 16 }}>
        <Row label="Subtotal" value={money(order.subtotal)} />
        {order.discount > 0 && <Row label="Discount" value={`−${money(order.discount)}`} />}
        <Row label="Shipping" value={money(order.shipping)} />
        {order.tax > 0 && <Row label="Tax" value={money(order.tax)} />}
        <Row label="Total" value={money(order.total)} strong />
      </div>

      <div className="no-print" style={{ marginTop: 28 }}>
        <button type="button" className="btn btn-dark" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 700 : 400, padding: "2px 0" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
