import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ordersApi } from "../api/ordersApi";
import { fmt } from "../utils/helpers";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank_transfer: "Bank transfer",
  payfast: "Online payment",
};

export function Code39Barcode({ value, height = 44, showText = true }) {
  const CODE39 = {
    0: "000110100",
    1: "100100001",
    2: "001100001",
    3: "101100000",
    4: "000110001",
    5: "100110000",
    6: "001110000",
    7: "000100101",
    8: "100100100",
    9: "001100100",
    A: "100001001",
    B: "001001001",
    C: "101001000",
    D: "000011001",
    E: "100011000",
    F: "001011000",
    G: "000001101",
    H: "100001100",
    I: "001001100",
    J: "000011100",
    K: "100000011",
    L: "001000011",
    M: "101000010",
    N: "000010011",
    O: "100010010",
    P: "001010010",
    Q: "000000111",
    R: "100000110",
    S: "001000110",
    T: "000010110",
    U: "110000001",
    V: "011000001",
    W: "111000000",
    X: "010010001",
    Y: "110010000",
    Z: "011010000",
    "-": "010000101",
    ".": "110000100",
    " ": "011000100",
    $: "010101000",
    "/": "010100010",
    "+": "010001010",
    "%": "000101010",
    "*": "010010100",
  };

  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z\-.$/+% ]/g, "");
  const chars = `*${clean}*`.split("");

  const rects = [];
  let currentX = 10;
  const narrow = 2;
  const wide = 5;

  chars.forEach((char) => {
    const pattern = CODE39[char] || CODE39["*"];
    for (let i = 0; i < 9; i++) {
      const isBar = i % 2 === 0;
      const width = pattern[i] === "1" ? wide : narrow;
      if (isBar) {
        rects.push({ x: currentX, width });
      }
      currentX += width;
    }
    currentX += narrow;
  });

  const totalWidth = currentX + 10;

  return (
    <div style={{ textAlign: "center", display: "inline-block" }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        style={{ width: "100%", maxWidth: totalWidth, height, display: "block", margin: "0 auto" }}
        role="img"
        aria-label={`Barcode: ${clean}`}
      >
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={0} width={r.width} height={height} fill="#000" />
        ))}
      </svg>
      {showText && (
        <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, display: "block", marginTop: 2, color: "#111" }}>
          *{clean}*
        </span>
      )}
    </div>
  );
}

export default function PackingSlipPage() {
  const { orderId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("thermal"); // "thermal" (4x6in) or "standard" (A4/A5)

  useDocumentMeta({ title: `Packing Slip #${orderId}`, noindex: true });

  useEffect(() => {
    let cancelled = false;
    ordersApi
      .invoice(orderId)
      .then((res) => {
        if (!cancelled && res?.invoice) setData(res.invoice);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load packing slip for this order.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="container" style={{ padding: "48px 24px" }} role="alert">
        <h1 className="h1">Packing Slip Unavailable</h1>
        <p style={{ color: "var(--ink2)", margin: "12px 0 20px" }}>{error}</p>
        <Link className="btn btn-dark" to="/admin/orders">
          Back to orders
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ padding: "48px 24px" }} role="status">
        Loading packing slip details…
      </div>
    );
  }

  const { store, order } = data;
  const isCod = order.paymentMethod === "cod";
  const isPaid = order.paymentStatus === "paid";
  const formattedTotal = fmt(order.total, order.currency || "PKR");

  return (
    <div className="packing-slip-wrapper">
      {/* Non-printable Control Toolbar */}
      <div className="no-print slip-toolbar">
        <div
          className="container"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 24px",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link className="btn btn-ghost btn-sm" to="/admin/orders">
              <Ic n="arrow" s={14} /> Back to orders
            </Link>
            <span style={{ fontWeight: 600 }}>Packing Slip · {order.id}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Label Format:</span>
              <select
                className="select"
                style={{ padding: "4px 8px", fontSize: 13 }}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="thermal">Thermal (4×6&quot; Flyer Label)</option>
                <option value="standard">Standard Packing Slip (A4 / A5)</option>
              </select>
            </label>

            <button className="btn btn-lime btn-sm" type="button" onClick={() => window.print()}>
              Print packing slip
            </button>
          </div>
        </div>
      </div>

      {/* Main Printable Packing Slip */}
      <div className={`slip-sheet ${mode === "thermal" ? "slip-thermal" : "slip-standard"}`}>
        {/* Header: Store details & Order ID */}
        <div className="slip-header">
          <div>
            <h1 className="slip-store-title">{store.name || "FikarNot"}</h1>
            <div className="slip-store-sub">
              {store.address && <div>{store.address}</div>}
              <div>{store.phone ? `Phone: ${store.phone}` : "Phone: 0370 9072688"}</div>
              {store.email && <div>{store.email}</div>}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="slip-badge-label">PACKING SLIP &amp; SHIPPING MANIFEST</div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
              Order Date: {new Date(order.createdAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>
              Print Time: {new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* Courier Dispatch Barcode Strip */}
        <div className="slip-barcode-strip">
          <div className="slip-barcode-item">
            <span className="slip-micro-lbl">ORDER NUMBER</span>
            <Code39Barcode value={order.id} height={38} />
          </div>

          {order.trackingNumber ? (
            <div className="slip-barcode-item">
              <span className="slip-micro-lbl">{order.courier || "COURIER"} TRACKING ID</span>
              <Code39Barcode value={order.trackingNumber} height={38} />
            </div>
          ) : (
            <div className="slip-courier-box">
              <span className="slip-micro-lbl">ASSIGNED COURIER</span>
              <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 4 }}>{order.courier || "PostEx / TCS"}</div>
              <div style={{ fontSize: 11, color: "#666" }}>Standard Dispatch</div>
            </div>
          )}
        </div>

        {/* Cash on Delivery / Payment Collection Callout */}
        {isCod && !isPaid ? (
          <div className="slip-callout-box cod-callout">
            <div className="slip-callout-header">
              <span>★ CASH ON DELIVERY (COD)</span>
              <span>RIDER MUST COLLECT EXACT CASH</span>
            </div>
            <div className="slip-callout-amount">PAYABLE: {formattedTotal}</div>
          </div>
        ) : (
          <div className="slip-callout-box prepaid-callout">
            <div className="slip-callout-header">
              <span>✓ PREPAID PARCEL</span>
              <span>DO NOT COLLECT ANY CASH</span>
            </div>
            <div className="slip-callout-amount">
              PAID: {formattedTotal} ({PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod})
            </div>
          </div>
        )}

        {/* Recipient Deliver-To Box */}
        <div className="slip-consignee-box">
          <div className="slip-section-head">SHIP &amp; DELIVER TO:</div>
          <div className="slip-consignee-name">{order.customer?.name || "Customer"}</div>
          <div className="slip-consignee-phone">
            <strong>📞 {order.customer?.phone || "No phone provided"}</strong>
          </div>
          <div className="slip-consignee-address">{order.customer?.address || "No address provided"}</div>
        </div>

        {/* Warehouse Item Checklist */}
        <div className="slip-items-box">
          <div className="slip-section-head">PACKING CHECKLIST:</div>
          <table className="slip-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>[✓]</th>
                <th style={{ width: 44, textAlign: "center" }}>Qty</th>
                <th>Item &amp; Description</th>
                <th style={{ textAlign: "right", width: 90 }}>Price</th>
                <th style={{ textAlign: "right", width: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item) => (
                <tr key={item.productId}>
                  <td style={{ textAlign: "center" }}>
                    <span className="slip-checkbox" />
                  </td>
                  <td style={{ textAlign: "center", fontWeight: "bold" }}>{item.qty}</td>
                  <td>
                    <strong>{item.name}</strong>
                    <div style={{ fontSize: 10, color: "#666" }}>ID: {item.productId}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>{fmt(item.price, order.currency)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt(item.price * item.qty, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="slip-summary-wrap">
          <div style={{ fontSize: 11, color: "#666", maxWidth: 280 }}>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Return / Support Policy:</strong> Customer returns &amp; exchanges supported within 30 days. Contact:
              support@fikarnot.pk
            </p>
          </div>

          <div className="slip-summary-table">
            <div className="slip-sum-row">
              <span>Subtotal:</span>
              <span>{fmt(order.subtotal, order.currency)}</span>
            </div>
            <div className="slip-sum-row">
              <span>Shipping Fee:</span>
              <span>{order.shipping === 0 ? "Free" : fmt(order.shipping, order.currency)}</span>
            </div>
            {order.discount > 0 && (
              <div className="slip-sum-row">
                <span>Discount:</span>
                <span>−{fmt(order.discount, order.currency)}</span>
              </div>
            )}
            <div className="slip-sum-row slip-sum-total">
              <span>Grand Total:</span>
              <span>{formattedTotal}</span>
            </div>
          </div>
        </div>

        {/* Sign-off & Inspection Footer */}
        <div className="slip-inspection-footer">
          <div>Packed by: ____________________</div>
          <div>Inspected by: ____________________</div>
          <div>Flyer / Weight: ____________ g</div>
        </div>
      </div>

      {/* Embedded Print & Component Styles */}
      <style>{`
        .packing-slip-wrapper {
          background: #f4f4f5;
          min-height: 100vh;
          padding-bottom: 40px;
          color: #000;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .slip-toolbar {
          background: #ffffff;
          border-bottom: 1px solid #e4e4e7;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .slip-sheet {
          background: #ffffff;
          margin: 24px auto;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          border: 1px solid #d4d4d8;
        }
        /* Thermal 4x6 inch flyer label */
        .slip-thermal {
          width: 4in;
          min-height: 6in;
          padding: 0.25in;
        }
        /* Standard A4/A5 packing slip */
        .slip-standard {
          width: 7in;
          min-height: 9.5in;
          padding: 0.45in;
        }
        .slip-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
        }
        .slip-store-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: -0.5px;
        }
        .slip-store-sub {
          font-size: 11px;
          color: #333;
          margin-top: 2px;
          line-height: 1.35;
        }
        .slip-badge-label {
          font-size: 11px;
          font-weight: 800;
          background: #000;
          color: #fff;
          padding: 3px 8px;
          display: inline-block;
          border-radius: 3px;
        }
        .slip-barcode-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 12px 0;
          padding: 8px 10px;
          background: #fafafa;
          border: 1px dashed #666;
          border-radius: 4px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .slip-barcode-item {
          text-align: center;
          flex: 1;
        }
        .slip-courier-box {
          text-align: center;
          flex: 1;
        }
        .slip-micro-lbl {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #555;
          display: block;
          margin-bottom: 2px;
        }
        .slip-callout-box {
          border: 2px solid #000;
          padding: 8px 12px;
          margin: 10px 0;
          border-radius: 4px;
        }
        .cod-callout {
          background: #fff;
          border-color: #000;
        }
        .prepaid-callout {
          background: #000;
          color: #fff;
        }
        .slip-callout-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .slip-callout-amount {
          font-size: 18px;
          font-weight: 900;
          margin-top: 4px;
          letter-spacing: -0.2px;
        }
        .slip-consignee-box {
          border: 1.5px solid #000;
          border-radius: 4px;
          padding: 8px 12px;
          margin: 10px 0;
        }
        .slip-section-head {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #333;
          border-bottom: 1px solid #ccc;
          padding-bottom: 2px;
          margin-bottom: 4px;
        }
        .slip-consignee-name {
          font-size: 16px;
          font-weight: 800;
          color: #000;
        }
        .slip-consignee-phone {
          font-size: 15px;
          font-weight: 800;
          margin: 3px 0;
          color: #000;
        }
        .slip-consignee-address {
          font-size: 12px;
          line-height: 1.35;
          color: #111;
        }
        .slip-items-box {
          margin: 10px 0;
        }
        .slip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-top: 4px;
        }
        .slip-table th {
          border-bottom: 1.5px solid #000;
          padding: 4px 6px;
          font-size: 10px;
          text-transform: uppercase;
        }
        .slip-table td {
          border-bottom: 1px solid #e4e4e7;
          padding: 5px 6px;
          vertical-align: top;
        }
        .slip-checkbox {
          display: inline-block;
          width: 13px;
          height: 13px;
          border: 1.5px solid #000;
          border-radius: 2px;
        }
        .slip-summary-wrap {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1.5px solid #000;
        }
        .slip-summary-table {
          width: 220px;
          font-size: 11px;
        }
        .slip-sum-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .slip-sum-total {
          font-size: 13px;
          font-weight: 800;
          border-top: 1px dashed #000;
          padding-top: 4px;
          margin-top: 2px;
        }
        .slip-inspection-footer {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #333;
          margin-top: 16px;
          padding-top: 8px;
          border-top: 1px dashed #888;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body, html {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .packing-slip-wrapper {
            background: #ffffff !important;
            padding: 0 !important;
          }
          .slip-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            page-break-after: always;
          }
          .slip-thermal {
            width: 100% !important;
            max-width: 4in !important;
            padding: 0.15in !important;
          }
          .slip-standard {
            width: 100% !important;
            max-width: 7in !important;
            padding: 0.25in !important;
          }
        }
      `}</style>
    </div>
  );
}
