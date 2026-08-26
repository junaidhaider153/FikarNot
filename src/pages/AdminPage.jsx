import { useEffect, useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useApp, appActions } from "../store/appStore";
import { GALLERY, SWATCHES } from "../assets/assets";
import { fmt, uid } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Modal, Empty, Stars, Pagination } from "../components/common";
import { ImageUploader } from "../components/ImageUploader";
import { prepareImageFile, MAX_IMAGE_BYTES } from "../utils/imageUpload";
import { uploadsApi } from "../api/uploadsApi";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { siteApi } from "../api/siteApi";
import { mediaApi } from "../api/mediaApi";
import { usePagination } from "../hooks/usePagination";
import { RETURN_STATUSES } from "../utils/returns";
import { AnalyticsTab } from "../components/admin/AnalyticsTab";

export function ProductEditor({ initial, onClose }) {
  const s = useApp();
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    categoryId: initial?.categoryId || s.categories[0]?.id || "",
    sku: initial?.sku || "",
    price: initial?.price ?? "",
    stock: initial?.stock ?? "",
    stockThreshold: initial?.stockThreshold ?? 10,
    rating: initial?.rating ?? 4.5,
    description: initial?.description || "",
    images: initial?.images?.length ? initial.images : [initial?.image || GALLERY[0][1]],
    tags: (initial?.tags || []).join(", "),
    featured: initial?.featured || false,
  }));
  const [errs, setErrs] = useState({});
  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = "Required";
    if (!f.sku.trim()) er.sku = "Required";
    if (!(+f.price > 0)) er.price = "Must be > 0";
    if (f.stock === "" || +f.stock < 0) er.stock = "≥ 0";
    if (f.stockThreshold === "" || +f.stockThreshold < 0) er.stockThreshold = "≥ 0";
    if (!f.categoryId) er.categoryId = "Required";
    setErrs(er);
    if (Object.keys(er).length) return;
    const saved = await appActions.upsertProduct({
      id: initial?.id || "p" + uid(),
      name: f.name.trim(),
      sku: f.sku.trim().toUpperCase(),
      categoryId: f.categoryId,
      price: +(+f.price).toFixed(2),
      stock: Math.floor(+f.stock),
      stockThreshold: Math.floor(+f.stockThreshold),
      rating: Math.min(5, Math.max(0, +f.rating || 0)),
      description: f.description.trim(),
      images: f.images,
      image: f.images[0] || "",
      tags: f.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      featured: !!f.featured,
    });
    if (saved) onClose();
  };
  return (
    <Modal title={initial ? "Edit product" : "New product"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="f-grid">
          <div className="f-full">
            <label className="lbl" htmlFor="pe-name">
              Name
            </label>
            <input id="pe-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            {errs.name && <p className="f-err">{errs.name}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="pe-sku">
              SKU
            </label>
            <input
              id="pe-sku"
              className="input"
              value={f.sku}
              onChange={(e) => setF({ ...f, sku: e.target.value.toUpperCase() })}
              placeholder="FKN-AUD-001"
            />
            {errs.sku && <p className="f-err">{errs.sku}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="pe-category">
              Category
            </label>
            <select id="pe-category" className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              {s.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="pe-rating">
              Rating (0–5)
            </label>
            <input
              id="pe-rating"
              className="input"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={f.rating}
              onChange={(e) => setF({ ...f, rating: e.target.value })}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="pe-price">
              Price (USD)
            </label>
            <input
              id="pe-price"
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={f.price}
              onChange={(e) => setF({ ...f, price: e.target.value })}
            />
            {errs.price && <p className="f-err">{errs.price}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="pe-stock">
              Stock
            </label>
            <input
              id="pe-stock"
              className="input"
              type="number"
              min="0"
              value={f.stock}
              onChange={(e) => setF({ ...f, stock: e.target.value })}
            />
            {errs.stock && <p className="f-err">{errs.stock}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="pe-threshold">
              Low-stock threshold
            </label>
            <input
              id="pe-threshold"
              className="input"
              type="number"
              min="0"
              value={f.stockThreshold}
              onChange={(e) => setF({ ...f, stockThreshold: e.target.value })}
            />
            {errs.stockThreshold && <p className="f-err">{errs.stockThreshold}</p>}
          </div>
          <div className="f-full">
            <label className="lbl" htmlFor="pe-description">
              Description
            </label>
            <textarea
              id="pe-description"
              className="textarea"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="f-full">
            <label className="lbl" htmlFor="pe-tags">
              Tags (comma separated)
            </label>
            <input
              id="pe-tags"
              className="input"
              value={f.tags}
              onChange={(e) => setF({ ...f, tags: e.target.value })}
              placeholder="wireless, anc"
            />
          </div>
          <div className="f-full">
            <span className="lbl" id="pe-images-label">
              Product images
            </span>
            <div role="group" aria-labelledby="pe-images-label">
              <ImageUploader images={f.images} onChange={(images) => setF({ ...f, images })} />
            </div>
            <p className="image-helper">
              The first image is the primary product image. Uploaded images are resized for this browser-only demo and saved with the
              product.
            </p>
          </div>
          <label className="chk f-full">
            <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Feature on homepage
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save product
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CategoryEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    description: initial?.description || "",
    color: initial?.color || SWATCHES[0],
  }));
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) {
      setErr("Required");
      return;
    }
    const saved = await appActions.upsertCategory({
      id: initial?.id || "c" + uid(),
      name: f.name.trim(),
      description: f.description.trim(),
      color: f.color,
    });
    if (saved) onClose();
  };
  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ce-name">
            Name
          </label>
          <input id="ce-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {err && <p className="f-err">{err}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ce-description">
            Description
          </label>
          <textarea
            id="ce-description"
            className="textarea"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <span className="lbl" id="ce-color-label">
            Color
          </span>
          <div className="swatches" role="group" aria-labelledby="ce-color-label">
            {SWATCHES.map((c) => (
              <button
                type="button"
                key={c}
                className={"swatch" + (f.color === c ? " sel" : "")}
                style={{ background: c }}
                onClick={() => setF({ ...f, color: c })}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save category
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function UserEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    email: initial?.email || "",
    role: initial?.role || "customer",
    password: "",
  }));
  const [errs, setErrs] = useState({});
  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = "Required";
    if (!/.+@.+\..+/.test(f.email)) er.email = "Valid email required";
    if (!initial && f.password.length < 12) er.password = "Min 12 chars";
    setErrs(er);
    if (Object.keys(er).length) return;
    const ok = await appActions.upsertUser({
      id: initial?.id || "u" + uid(),
      name: f.name.trim(),
      email: f.email.trim(),
      role: f.role,
      password: f.password ? f.password : initial?.password || `fikarnot-${uid().slice(0, 8)}`,
    });
    if (ok) onClose();
  };
  return (
    <Modal title={initial ? "Edit user" : "New user"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-name">
            Name
          </label>
          <input id="ue-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {errs.name && <p className="f-err">{errs.name}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-email">
            Email
          </label>
          <input id="ue-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          {errs.email && <p className="f-err">{errs.email}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="lbl" htmlFor="ue-role">
            Role
          </label>
          <select id="ue-role" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="customer">customer</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="lbl" htmlFor="ue-password">
            Password {initial && "(leave blank to keep)"}
          </label>
          <input
            id="ue-password"
            className="input"
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
          {errs.password && <p className="f-err">{errs.password}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save user
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CouponEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({
    code: initial?.code || "",
    type: initial?.type || "percent",
    value: initial?.value ?? 10,
    minSubtotal: initial?.minSubtotal ?? 0,
    maxUses: initial?.maxUses ?? 0,
    expiresAt: initial?.expiresAt ? new Date(initial.expiresAt).toISOString().slice(0, 10) : "",
    active: initial?.active !== false,
    description: initial?.description || "",
  }));
  const [errs, setErrs] = useState({});
  const save = (event) => {
    event.preventDefault();
    const next = {};
    if (!f.code.trim()) next.code = "Required";
    if (f.type !== "free_shipping" && !(+f.value > 0)) next.value = "Must be > 0";
    if (f.type === "percent" && +f.value > 100) next.value = "Cannot exceed 100";
    if (+f.minSubtotal < 0) next.minSubtotal = "Cannot be negative";
    if (+f.maxUses < 0) next.maxUses = "Cannot be negative";
    setErrs(next);
    if (Object.keys(next).length) return;
    const saved = appActions.upsertCoupon({
      id: initial?.id,
      code: f.code,
      type: f.type,
      value: +f.value || 0,
      minSubtotal: +f.minSubtotal || 0,
      maxUses: +f.maxUses || 0,
      usedCount: initial?.usedCount || 0,
      active: f.active,
      expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).getTime() : null,
      description: f.description,
    });
    if (saved) onClose();
  };
  return (
    <Modal title={initial ? "Edit coupon" : "New coupon"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="f-grid">
          <div>
            <label className="lbl" htmlFor="cp-code">
              Code
            </label>
            <input
              id="cp-code"
              className="input"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              placeholder="WELCOME10"
            />
            {errs.code && <p className="f-err">{errs.code}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-type">
              Discount type
            </label>
            <select id="cp-type" className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="cp-value">
              Value
            </label>
            <input
              id="cp-value"
              className="input"
              type="number"
              min="0"
              step="0.01"
              disabled={f.type === "free_shipping"}
              value={f.type === "free_shipping" ? 0 : f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })}
            />
            {errs.value && <p className="f-err">{errs.value}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-min">
              Minimum subtotal
            </label>
            <input
              id="cp-min"
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={f.minSubtotal}
              onChange={(e) => setF({ ...f, minSubtotal: e.target.value })}
            />
            {errs.minSubtotal && <p className="f-err">{errs.minSubtotal}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-uses">
              Maximum uses
            </label>
            <input
              id="cp-uses"
              className="input"
              type="number"
              min="0"
              step="1"
              value={f.maxUses}
              onChange={(e) => setF({ ...f, maxUses: e.target.value })}
            />
            <p className="form-hint">Use 0 for unlimited.</p>
            {errs.maxUses && <p className="f-err">{errs.maxUses}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="cp-expiry">
              Expiry date
            </label>
            <input
              id="cp-expiry"
              className="input"
              type="date"
              value={f.expiresAt}
              onChange={(e) => setF({ ...f, expiresAt: e.target.value })}
            />
          </div>
          <div className="f-full">
            <label className="lbl" htmlFor="cp-desc">
              Description
            </label>
            <input
              id="cp-desc"
              className="input"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="10% off your first order over $50."
            />
          </div>
          <label className="chk f-full">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Coupon active
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark">
            <Ic n="check" s={15} /> Save coupon
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CouponsTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [now] = useState(() => Date.now());
  const coupons = (s.coupons || [])
    .slice()
    .sort((a, b) => Number(b.active) - Number(a.active) || String(a.code).localeCompare(String(b.code)));
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(coupons, 10);
  return (
    <div>
      <div className="admin-tab-actions">
        <div>
          <p style={{ color: "var(--ink2)", marginTop: 4 }}>Create simple promotions your customers can redeem at checkout.</p>
        </div>
        <button className="btn btn-dark" onClick={() => setEditing({})}>
          <Ic n="plus" s={15} /> New coupon
        </button>
      </div>
      {!coupons.length ? (
        <Empty icon="tag" title="No coupons yet" sub="Create your first promotion to make checkout more flexible." />
      ) : (
        <div className="table-wrap coupon-table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Minimum</th>
                <th>Uses</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((coupon) => {
                const expired = coupon.expiresAt && coupon.expiresAt < now;
                const status = expired ? "Expired" : coupon.active ? "Active" : "Paused";
                const offer =
                  coupon.type === "percent"
                    ? `${coupon.value}% off`
                    : coupon.type === "fixed"
                      ? `${fmt(coupon.value)} off`
                      : "Free shipping";
                return (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{coupon.description || "—"}</div>
                    </td>
                    <td>{offer}</td>
                    <td>{coupon.minSubtotal ? fmt(coupon.minSubtotal) : "No minimum"}</td>
                    <td>
                      {coupon.usedCount}
                      {coupon.maxUses ? ` / ${coupon.maxUses}` : " / ∞"}
                    </td>
                    <td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "No expiry"}</td>
                    <td>
                      <span className={`coupon-status ${status.toLowerCase()}`}>{status}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-btn"
                          title="Edit coupon"
                          aria-label={`Edit ${coupon.code}`}
                          onClick={() => setEditing(coupon)}
                        >
                          <Ic n="edit" s={14} />
                        </button>
                        {!expired && (
                          <button
                            className="icon-btn"
                            title={coupon.active ? "Pause coupon" : "Activate coupon"}
                            aria-label={`${coupon.active ? "Pause" : "Activate"} ${coupon.code}`}
                            onClick={() => appActions.toggleCoupon(coupon.id)}
                          >
                            <Ic n="check" s={14} />
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          title="Delete coupon"
                          aria-label={`Delete ${coupon.code}`}
                          onClick={() => {
                            if (window.confirm(`Delete coupon ${coupon.code}?`)) appActions.deleteCoupon(coupon.id);
                          }}
                        >
                          <Ic n="trash" s={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="coupons" />
      {editing && <CouponEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function DashboardTab() {
  const s = useApp();
  const revenue = s.orders.reduce((t, o) => t + o.total, 0);
  const revByCat = s.categories.map((c) => ({
    name: c.name,
    revenue: +s.orders
      .flatMap((o) => o.items)
      .filter((i) => (s.products.find((p) => p.id === i.productId)?.categoryId || "") === c.id)
      .reduce((t, i) => t + i.price * i.qty, 0)
      .toFixed(2),
  }));
  const byCat = s.categories
    .map((c) => ({ name: c.name, value: s.products.filter((p) => p.categoryId === c.id).length, color: c.color }))
    .filter((d) => d.value > 0);
  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <span className="ic">
            <Ic n="box" s={17} />
          </span>
          <b>{s.products.length}</b>
          <span>Products live</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="tag" s={17} />
          </span>
          <b>{s.categories.length}</b>
          <span>Categories</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="cart" s={17} />
          </span>
          <b>{s.orders.length}</b>
          <span>Orders</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="chart" s={17} />
          </span>
          <b>{fmt(revenue)}</b>
          <span>Revenue (mock)</span>
        </div>
      </div>
      <div className="chart-row">
        <div className="chart-card">
          <h4>Revenue by category</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revByCat}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E1D4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
              <RTooltip formatter={(v) => fmt(+v)} />
              <Bar dataKey="revenue" fill="#17150F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h4>Catalogue mix</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>
                {byCat.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.orders.slice(0, 5).map((o) => (
              <tr key={o.id}>
                <td>
                  <b>{o.id}</b>
                </td>
                <td>{o.customer.name}</td>
                <td>{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                <td>{fmt(o.total)}</td>
                <td>
                  <span className="role-badge editor">{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function ProductsTab() {
  const s = useApp();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const editId = query.get("edit");
    if (editId) {
      const p = s.products.find((x) => x.id === editId);
      if (p) setEditing(p);
      navigate("/admin/products");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const catName = (id) => s.categories.find((c) => c.id === id)?.name || "—";
  const list = s.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(list, 10);
  return (
    <>
      <div className="toolbar">
        <label className="search-box">
          <Ic n="search" s={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter products…" aria-label="Filter products" />
        </label>
        <span className="result-count">{list.length} products</span>
        <button className="btn btn-dark" onClick={() => setCreating(true)}>
          <Ic n="plus" s={15} /> New product
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Featured</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <img className="thumb" src={p.image} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{p.tags.map((t) => "#" + t).join(" ")}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="sku-pill">{p.sku || "—"}</span>
                </td>
                <td>{catName(p.categoryId)}</td>
                <td>{fmt(p.price)}</td>
                <td>
                  {p.stock === 0 ? (
                    <span className="low">Out</span>
                  ) : p.stock <= (p.stockThreshold ?? 10) ? (
                    <span className="low">{p.stock} low</span>
                  ) : (
                    p.stock
                  )}
                </td>
                <td>
                  <button
                    className="icon-btn"
                    title={p.featured ? "Unfeature" : "Feature on homepage"}
                    aria-label="Toggle featured"
                    onClick={() => appActions.toggleFeatured(p.id)}
                    style={p.featured ? { background: "var(--lime)", borderColor: "var(--lime)" } : {}}
                  >
                    <Ic n="star" s={14} filled={p.featured} />
                  </button>
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                      <Ic n="edit" s={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${p.name}?`)) appActions.deleteProduct(p.id);
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
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="products" />
      {(editing || creating) && (
        <ProductEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
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
              <th style={{ textAlign: "right" }}>Action</th>
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
                      <img className="thumb" src={p.image} alt="" />
                      <div>
                        <b>{p.name}</b>
                        <div style={{ fontSize: 12, color: "var(--ink2)" }}>{fmt(p.price)} each</div>
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
                  <td style={{ textAlign: "right" }}>
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

function StockAdjuster({ product, onClose }) {
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

export function CategoriesTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="toolbar">
        <span className="result-count">{s.categories.length} categories</span>
        <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
          <Ic n="plus" s={15} /> New category
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Products</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cat-dot" style={{ background: c.color, marginBottom: 0 }} />
                    <b>{c.name}</b>
                  </div>
                </td>
                <td style={{ color: "var(--ink2)" }}>{c.description}</td>
                <td>{s.products.filter((p) => p.categoryId === c.id).length}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                      <Ic n="edit" s={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${c.name}?`)) appActions.deleteCategory(c.id);
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
      {(editing || creating) && (
        <CategoryEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
export function UsersTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(s.users, 10);
  return (
    <>
      <div className="toolbar">
        <span className="result-count">{s.users.length} users</span>
        <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
          <Ic n="plus" s={15} /> New user
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar">
                      {u.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <b>{u.name}</b>
                    {s.session?.id === u.id && <span className="tag">you</span>}
                  </div>
                </td>
                <td style={{ color: "var(--ink2)" }}>{u.email}</td>
                <td>
                  <select
                    className="status-sel"
                    value={u.role}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => appActions.setRole(u.id, e.target.value)}
                  >
                    <option>customer</option>
                    <option>editor</option>
                    <option>admin</option>
                  </select>
                </td>
                <td style={{ color: "var(--ink2)" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                      <Ic n="edit" s={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${u.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${u.name}?`)) appActions.deleteUser(u.id);
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
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="users" />
      {(editing || creating) && (
        <UserEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
export function OrdersTab() {
  const s = useApp();
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(s.orders, 10);
  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
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
                  <div style={{ fontSize: 12, color: "var(--ink2)" }}>{o.customer.email}</div>
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
                    <option>paid</option>
                    <option>processing</option>
                    <option>shipped</option>
                    <option>delivered</option>
                    <option>cancelled</option>
                  </select>
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
function ReviewsTab() {
  const s = useApp();
  const reviews = (s.reviews || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="sec-hd">
        <div>
          <p className="eyebrow">Customer voice</p>
          <h2 className="sec-title display">Reviews</h2>
        </div>
      </div>
      {!reviews.length ? (
        <Empty icon="star" title="No reviews yet" sub="Customer reviews will appear here after purchases." />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Customer</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => {
                const product = s.products.find((p) => p.id === review.productId);
                return (
                  <tr key={review.id}>
                    <td>
                      <strong>{product?.name || review.productId}</strong>
                    </td>
                    <td>
                      <div>{review.authorName}</div>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{review.verifiedPurchase ? "Verified purchase" : "Customer"}</div>
                    </td>
                    <td>
                      <Stars v={review.rating} size={13} />
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <strong>{review.title}</strong>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{review.body}</div>
                    </td>
                    <td>{new Date(review.createdAt).toLocaleDateString()}</td>
                    <td>
                      {review.status === "hidden" ? (
                        <span className="role-badge editor" style={{ marginRight: 8 }}>
                          Hidden
                        </span>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginRight: 8 }}
                        onClick={() => appActions.setReviewStatus(review.id, review.status === "hidden" ? "published" : "hidden")}
                      >
                        {review.status === "hidden" ? "Restore" : "Hide"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (window.confirm("Remove this review?")) appActions.deleteReview(review.id);
                        }}
                      >
                        <Ic n="trash" s={13} /> Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ReturnsTab() {
  const s = useApp();
  const requests = (s.returnRequests || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="sec-hd">
        <div>
          <p className="eyebrow">After-sales</p>
          <h2 className="sec-title display">Returns</h2>
        </div>
      </div>
      {!requests.length ? (
        <Empty
          icon="refresh"
          title="No return requests"
          sub="Customer return requests will appear here after an eligible delivered order is submitted."
        />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Request</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Reason</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const order = s.orders.find((item) => item.id === request.orderId);
                return (
                  <tr key={request.id}>
                    <td>
                      <b>#{request.id.replace(/^ret-/, "RET-")}</b>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{request.note || "No additional note"}</div>
                    </td>
                    <td>
                      <b>{request.orderId}</b>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{order ? fmt(order.total) : "Order unavailable"}</div>
                    </td>
                    <td>
                      <div>{order?.customer?.name || "Customer"}</div>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{order?.customer?.email || "—"}</div>
                    </td>
                    <td>{request.reason}</td>
                    <td>{new Date(request.createdAt).toLocaleDateString()}</td>
                    <td>
                      <select
                        className="status-sel"
                        value={request.status}
                        aria-label={`Status for return ${request.id}`}
                        onChange={(e) => appActions.setReturnStatus(request.id, e.target.value)}
                      >
                        {Object.values(RETURN_STATUSES).map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SupportTab() {
  const s = useApp();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const all = s.supportTickets || [];
  const tickets = all
    .filter((t) => filter === "all" || t.status === filter)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const open = all.filter((t) => t.status === "open").length;
  const progress = all.filter((t) => t.status === "in_progress").length;
  const resolved = all.filter((t) => t.status === "resolved").length;
  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(tickets, 10);
  return (
    <div>
      <div className="stat-grid">
        <div className="stat">
          <span className="ic">
            <Ic n="mail" s={17} />
          </span>
          <b>{all.length}</b>
          <span>Total requests</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="alert" s={17} />
          </span>
          <b>{open}</b>
          <span>Open</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="refresh" s={17} />
          </span>
          <b>{progress}</b>
          <span>In progress</span>
        </div>
        <div className="stat">
          <span className="ic">
            <Ic n="check" s={17} />
          </span>
          <b>{resolved}</b>
          <span>Resolved</span>
        </div>
      </div>
      <div className="toolbar support-toolbar">
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter support requests">
          <option value="all">All requests</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <span className="result-count">{tickets.length} requests</span>
      </div>
      {!tickets.length ? (
        <Empty icon="mail" title="No support requests" sub="Customer messages will appear here when they contact FikarNot." />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Customer</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong>{ticket.id}</strong>
                  </td>
                  <td>
                    <div>
                      <b>{ticket.name}</b>
                      <div style={{ fontSize: 12, color: "var(--ink2)" }}>{ticket.email}</div>
                    </div>
                  </td>
                  <td style={{ maxWidth: 260 }}>{ticket.subject}</td>
                  <td style={{ textTransform: "capitalize" }}>{ticket.category}</td>
                  <td>{new Date(ticket.createdAt).toLocaleDateString()}</td>
                  <td>
                    <select
                      className="status-sel"
                      value={ticket.status}
                      onChange={(e) => appActions.setSupportTicketStatus(ticket.id, e.target.value)}
                      aria-label={`Status for ${ticket.id}`}
                    >
                      <option value="open">open</option>
                      <option value="in_progress">in progress</option>
                      <option value="resolved">resolved</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(ticket)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="requests" />
      {selected && (
        <Modal title={`${selected.id} · ${selected.subject}`} onClose={() => setSelected(null)} wide>
          <div className="support-detail">
            <div className="support-detail-meta">
              <strong>{selected.name}</strong>
              <span>{selected.email}</span>
              <span>{new Date(selected.createdAt).toLocaleString()}</span>
            </div>
            <div className="support-detail-message">{selected.message}</div>
            <div className="support-detail-actions">
              <select
                className="select"
                value={selected.status}
                onChange={(e) => {
                  appActions.setSupportTicketStatus(selected.id, e.target.value);
                  setSelected({ ...selected, status: e.target.value });
                }}
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`Delete ${selected.id}?`)) {
                    appActions.deleteSupportTicket(selected.id);
                    setSelected(null);
                  }
                }}
              >
                Delete request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


function MediaTab() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const result = await mediaApi.list({ limit: 100, offset: 0 });
      setAssets(result.assets || []);
    } catch (error) {
      appActions.toast(error.message || "Could not load media", "err");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const remove = async (asset) => {
    if (asset.usageCount > 0) {
      appActions.toast("This image is currently in use. Remove its references first.", "err");
      return;
    }
    if (!window.confirm(`Delete ${asset.originalName || asset.filename}?`)) return;
    setWorking(true);
    try {
      await mediaApi.remove(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      appActions.toast("Media deleted");
    } catch (error) {
      appActions.toast(error.message || "Could not delete media", "err");
    } finally {
      setWorking(false);
    }
  };
  const cleanup = async () => {
    if (!window.confirm("Remove all uploaded images that are no longer used anywhere in FikarNot?")) return;
    setWorking(true);
    try {
      const result = await mediaApi.cleanup();
      appActions.toast(`${result.removed || 0} unused image${result.removed === 1 ? "" : "s"} removed`);
      await load();
    } catch (error) {
      appActions.toast(error.message || "Could not clean media", "err");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      <div className="sec-hd">
        <div>
          <h2 className="sec-title display">Media library</h2>
          <p className="section-sub">Uploaded product and storefront images stored by FikarNot.</p>
        </div>
        <button className="btn btn-ghost" onClick={cleanup} disabled={working || loading}>Clean unused</button>
      </div>
      {loading ? <div className="panel"><p>Loading media…</p></div> : assets.length === 0 ? (
        <Empty icon="box" title="No uploaded media" sub="Images uploaded from a device will appear here." />
      ) : (
        <div className="media-library-grid">
          {assets.map((asset) => (
            <article className="media-library-card" key={asset.id}>
              <div className="media-library-thumb"><img src={asset.url} alt={asset.originalName || "Uploaded media"} loading="lazy" /></div>
              <div className="media-library-info">
                <strong title={asset.originalName || asset.filename}>{asset.originalName || asset.filename}</strong>
                <span>{(asset.byteSize / 1024).toFixed(0)} KB · {asset.mimeType.replace("image/", "").toUpperCase()}</span>
                <span>{asset.usageCount > 0 ? `Used in ${asset.usageCount} place${asset.usageCount === 1 ? "" : "s"}` : "Unused"}</span>
              </div>
              <button className="btn btn-danger btn-sm" disabled={working || asset.usageCount > 0} onClick={() => remove(asset)}>Delete</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroUploadError, setHeroUploadError] = useState("");
  const [form, setForm] = useState({
    storeName: "FikarNot",
    supportEmail: "support@fikarnot.shop",
    heroKicker: "",
    heroEyebrow: "",
    heroTitle: "",
    heroHighlight: "",
    heroSubtitle: "",
    heroSticker: "",
    heroImage: "",
    announcement: "",
    aboutTitle: "",
    aboutIntro: "",
    aboutBody: "",
    whatsappNumber: "",
    instagramUrl: "",
    facebookUrl: "",
    metaTitle: "",
    metaDescription: "",
  });
  useEffect(() => {
    let alive = true;
    siteApi.get().then((result) => {
      if (alive) setForm((current) => ({ ...current, ...(result.settings || {}) }));
    }).catch(() => appActions.toast("Could not load store settings", "err")).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const uploadHeroImage = async (file) => {
    if (!file) return;
    setHeroUploading(true);
    setHeroUploadError("");
    try {
      const dataUrl = await prepareImageFile(file);
      const result = await uploadsApi.uploadImage(dataUrl, file.name);
      set("heroImage", result.url);
      appActions.toast("Hero image uploaded. Save settings to publish it.");
    } catch (error) {
      setHeroUploadError(error.message || "Could not upload hero image.");
    } finally {
      setHeroUploading(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await siteApi.update(form);
      appActions.toast("Store settings saved");
    } catch (error) {
      appActions.toast(error.message || "Could not save settings", "err");
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <div className="panel"><p>Loading store settings…</p></div>;
  return (
    <form className="panel" onSubmit={save}>
      <h3 className="display">Store & homepage settings</h3>
      <p style={{ color: "var(--ink2)", marginBottom: 18 }}>These settings are stored in the backend. Change them here instead of editing the React source.</p>
      <div className="f-grid">
        <div><label className="lbl" htmlFor="settings-store-name">Store name</label><input id="settings-store-name" className="input" value={form.storeName} onChange={(e) => set("storeName", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-support-email">Support email</label><input id="settings-support-email" className="input" type="email" value={form.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-kicker">Hero kicker</label><input id="settings-kicker" className="input" value={form.heroKicker} onChange={(e) => set("heroKicker", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-eyebrow">Hero eyebrow</label><input id="settings-eyebrow" className="input" value={form.heroEyebrow} onChange={(e) => set("heroEyebrow", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-title">Hero title</label><input id="settings-title" className="input" value={form.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-highlight">Hero highlight</label><input id="settings-highlight" className="input" value={form.heroHighlight} onChange={(e) => set("heroHighlight", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-subtitle">Hero subtitle</label><textarea id="settings-subtitle" className="textarea" value={form.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-sticker">Hero sticker</label><input id="settings-sticker" className="input" value={form.heroSticker} onChange={(e) => set("heroSticker", e.target.value)} /></div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-hero-image">Hero image</label>
          <div className="media-upload-inline">
            <input id="settings-hero-image" className="input" placeholder="https://… or upload from device" value={form.heroImage} onChange={(e) => set("heroImage", e.target.value)} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                {heroUploading ? "Uploading…" : "Upload from device"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={heroUploading} onChange={(e) => { uploadHeroImage(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <span className="image-hint">JPG, PNG, WebP or GIF · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB</span>
            </div>
            {heroUploadError && <p className="f-err">{heroUploadError}</p>}
            {form.heroImage && <div className="hero-image-setting-preview"><img src={form.heroImage} alt="Current FikarNot hero preview" /></div>}
          </div>
        </div>
        <div className="f-full"><label className="lbl" htmlFor="settings-announcement">Announcement bar</label><input id="settings-announcement" className="input" value={form.announcement} onChange={(e) => set("announcement", e.target.value)} /></div>
        <div className="f-full"><h4 className="display" style={{ margin: "12px 0 4px" }}>About page</h4></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-about-title">About title</label><input id="settings-about-title" className="input" value={form.aboutTitle} onChange={(e) => set("aboutTitle", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-about-intro">About intro</label><textarea id="settings-about-intro" className="textarea" value={form.aboutIntro} onChange={(e) => set("aboutIntro", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-about-body">About body</label><textarea id="settings-about-body" className="textarea" value={form.aboutBody} onChange={(e) => set("aboutBody", e.target.value)} /></div>
        <div className="f-full"><h4 className="display" style={{ margin: "12px 0 4px" }}>Contact, social & SEO</h4></div>
        <div><label className="lbl" htmlFor="settings-whatsapp">WhatsApp number</label><input id="settings-whatsapp" className="input" placeholder="923001234567" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-instagram">Instagram URL</label><input id="settings-instagram" className="input" value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-facebook">Facebook URL</label><input id="settings-facebook" className="input" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} /></div>
        <div><label className="lbl" htmlFor="settings-meta-title">SEO title</label><input id="settings-meta-title" className="input" value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} /></div>
        <div className="f-full"><label className="lbl" htmlFor="settings-meta-description">SEO description</label><textarea id="settings-meta-description" className="textarea" value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-dark" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  );
}

export default function AdminPage({ tab }) {
  const s = useApp();
  useDocumentMeta({ title: "Studio", noindex: true });
  const [now] = useState(() => Date.now());
  const tabs = [
    { id: "dashboard", path: "/admin", label: "Dashboard", icon: "chart" },
    { id: "analytics", path: "/admin/analytics", label: "Analytics", icon: "chart" },
    { id: "products", path: "/admin/products", label: "Products", icon: "box", n: s.products.length },
    {
      id: "inventory",
      path: "/admin/inventory",
      label: "Inventory",
      icon: "box",
      n: s.products.filter((p) => p.stock <= (p.stockThreshold ?? 10)).length,
    },
    { id: "categories", path: "/admin/categories", label: "Categories", icon: "tag", n: s.categories.length },
    { id: "orders", path: "/admin/orders", label: "Orders", icon: "cart", n: s.orders.length },
    {
      id: "returns",
      path: "/admin/returns",
      label: "Returns",
      icon: "refresh",
      n: s.returnRequests?.filter((item) => item.status === "requested").length || 0,
    },
    {
      id: "coupons",
      path: "/admin/coupons",
      label: "Coupons",
      icon: "tag",
      n: s.coupons?.filter((coupon) => coupon.active && (!coupon.expiresAt || coupon.expiresAt > now)).length || 0,
    },
    {
      id: "reviews",
      path: "/admin/reviews",
      label: "Reviews",
      icon: "star",
      n: s.reviews?.filter((review) => review.status === "published").length || 0,
    },
    {
      id: "support",
      path: "/admin/support",
      label: "Support",
      icon: "mail",
      n: s.supportTickets?.filter((ticket) => ticket.status === "open").length || 0,
    },
    ...(s.session.role === "admin" ? [{ id: "media", path: "/admin/media", label: "Media", icon: "box" }, { id: "users", path: "/admin/users", label: "Users", icon: "users", n: s.users.length }, { id: "settings", path: "/admin/settings", label: "Settings", icon: "tag" }] : []),
  ];
  const activeTab = tabs.find((t) => t.id === tab);
  return (
    <div className="container admin">
      <aside className="admin-side" aria-label="Studio navigation">
        {tabs.map((t) => (
          <NavLink key={t.id} to={t.path} className="side-btn">
            <Ic n={t.icon} s={16} /> {t.label}
            {t.n != null && <span className="n">{t.n}</span>}
          </NavLink>
        ))}
      </aside>
      <main>
        <div className="sec-hd">
          <h1 className="sec-title display">{activeTab ? activeTab.label : "Dashboard"}</h1>
        </div>
        {tab === "dashboard" && <DashboardTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "inventory" && <InventoryTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "coupons" && <CouponsTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "support" && <SupportTab />}
        {tab === "returns" && <ReturnsTab />}
        {tab === "media" && s.session.role === "admin" && <MediaTab />}
        {tab === "users" && s.session.role === "admin" && <UsersTab />}
        {tab === "settings" && s.session.role === "admin" && <SettingsTab />}
      </main>
    </div>
  );
}
