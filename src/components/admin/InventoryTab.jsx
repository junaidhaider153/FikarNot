import { useState } from "react";
import { useApp, appActions } from "../../store/appStore";
import { FALLBACK_PRODUCT_IMAGE, fmt, onImageError } from "../../utils/helpers";
import { Ic } from "../icons";
import { Modal, Empty, Pagination } from "../common";
import { usePagination } from "../../hooks/usePagination";

export function StockAdjuster({ product, onClose }) {
  const [nextStock, setNextStock] = useState(String(product.stock));
  const [reason, setReason] = useState("Manual stock adjustment");
  const save = async (e) => {
    e.preventDefault();
    if (await appActions.adjustStock(product.id, nextStock, reason.trim() || "Manual stock adjustment")) onClose();
  };
  return (
    <Modal title={`Adjust stock — ${product.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="stock-adjust-preview">
          <span>Current stock</span>
          <strong>{product.stock}</strong>
          <span>Threshold: {product.stockThreshold ?? 10}</span>
        </div>
        <div className="quick-adjusts">
          {[-10, -1, 1, 10].map((delta) => (
            <button
              key={delta}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNextStock(String(Math.max(0, Number(nextStock || 0) + delta)))}
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="lbl" htmlFor="sa-stock">
            New stock level
          </label>
          <input id="sa-stock" className="input" type="number" min="0" value={nextStock} onChange={(e) => setNextStock(e.target.value)} />
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="lbl" htmlFor="sa-reason">
            Reason
          </label>
          <input id="sa-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InventoryTab() {
  const s = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const products = s.products.filter((p) => {
    const haystack = `${p.name} ${p.sku || ""}`.toLowerCase();
    if (q.trim() && !haystack.includes(q.toLowerCase().trim())) return false;
    if (filter === "out") return p.stock === 0;
    if (filter === "low") return p.stock > 0 && p.stock <= (p.stockThreshold ?? 10);
    if (filter === "healthy") return p.stock > (p.stockThreshold ?? 10);
    return true;
  });
  const totalUnits = s.products.reduce((sum, p) => sum + p.stock, 0);
  const outCount = s.products.filter((p) => p.stock === 0).length;
  const lowCount = s.products.filter((p) => p.stock > 0 && p.stock <= (p.stockThreshold ?? 10)).length;
  const inventoryValue = s.products.reduce((sum, p) => sum + p.price * p.stock, 0);
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(products, 10);
  return (
    <>
      <div className="stat-grid inventory-stats">
        <div className="stat">
          <span className="ic">
            <Ic n="box" s={17} />
          </span>
          <b>{totalUnits}</b>
          <span>Units on hand</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="alert" s={17} />
          </span>
          <b>{lowCount}</b>
          <span>Low stock</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="x" s={17} />
          </span>
          <b>{outCount}</b>
          <span>Out of stock</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="chart" s={17} />
          </span>
          <b>{fmt(inventoryValue)}</b>
          <span>Stock value</span>
        </div>
      </div>
      <div className="toolbar inventory-toolbar">
        <label className="search-box">
          <Ic n="search" s={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or SKU…" aria-label="Search inventory" />
        </label>
        <select
          className="select inventory-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Inventory filter"
        >
          <option value="all">All inventory</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="healthy">Healthy stock</option>
        </select>
        <span className="result-count">{products.length} products</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>On hand</th>
              <th>Threshold</th>
              <th>Status</th>
              <th className="u-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => {
              const threshold = p.stockThreshold ?? 10;
              const status = p.stock === 0 ? "Out of stock" : p.stock <= threshold ? "Low stock" : "Healthy";
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img className="thumb" src={p.image || FALLBACK_PRODUCT_IMAGE} alt="" loading="lazy" onError={onImageError} />
                      <div>
                        <b>{p.name}</b>
                        <div className="field-hint">{fmt(p.price)} each</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="sku-pill">{p.sku || "—"}</span>
                  </td>
                  <td>
                    <strong>{p.stock}</strong>
                  </td>
                  <td>{threshold}</td>
                  <td>
                    <span className={"inventory-status " + (status === "Healthy" ? "healthy" : status === "Low stock" ? "low" : "out")}>
                      {status}
                    </span>
                  </td>
                  <td className="u-right">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
                      <Ic n="plus" s={13} /> Adjust stock
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="products" />
      {editing && <StockAdjuster product={editing} onClose={() => setEditing(null)} />}
      <div className="inventory-log-card">
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Recent changes</span>
            <h3 className="sec-title display">Inventory activity</h3>
          </div>
        </div>
        {!s.inventoryLog?.length ? (
          <Empty icon="box" title="No inventory changes yet" sub="Stock adjustments and completed orders will appear here." />
        ) : (
          <div className="inventory-log">
            {s.inventoryLog.slice(0, 8).map((entry) => (
              <div className="inventory-log-row" key={entry.id}>
                <div>
                  <strong>{entry.productName}</strong>
                  <span>{entry.reason}</span>
                </div>
                <div className={entry.change > 0 ? "inventory-plus" : "inventory-minus"}>
                  {entry.change > 0 ? `+${entry.change}` : entry.change}
                </div>
                <time>{new Date(entry.createdAt).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
