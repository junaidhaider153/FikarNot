import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { useApp, appActions } from "../store/appStore";
import { GALLERY, SWATCHES } from "../assets/assets";
import { fmt, uid } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Modal, Empty } from "../components/common";
import { ImageUploader } from "../components/ImageUploader";

export function ProductEditor({ initial, onClose }) {
  const s = useApp();
  const [f, setF] = useState(() => ({
    name: initial?.name || "", categoryId: initial?.categoryId || s.categories[0]?.id || "",
    price: initial?.price ?? "", stock: initial?.stock ?? "", rating: initial?.rating ?? 4.5,
    description: initial?.description || "", images: initial?.images?.length ? initial.images : [initial?.image || GALLERY[0][1]],
    tags: (initial?.tags || []).join(", "), featured: initial?.featured || false,
  }));
  const [errs, setErrs] = useState({});
  const save = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = "Required";
    if (!(+f.price > 0)) er.price = "Must be > 0";
    if (f.stock === "" || +f.stock < 0) er.stock = "≥ 0";
    if (!f.categoryId) er.categoryId = "Required";
    setErrs(er); if (Object.keys(er).length) return;
    appActions.upsertProduct({
      id: initial?.id || "p" + uid(), name: f.name.trim(), categoryId: f.categoryId,
      price: +(+f.price).toFixed(2), stock: Math.floor(+f.stock), rating: Math.min(5, Math.max(0, +f.rating || 0)),
      description: f.description.trim(), images: f.images, image: f.images[0] || "", tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      featured: !!f.featured,
    });
    onClose();
  };
  return (
    <Modal title={initial ? "Edit product" : "New product"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="f-grid">
          <div className="f-full"><label className="lbl">Name</label><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{errs.name && <p className="f-err">{errs.name}</p>}</div>
          <div><label className="lbl">Category</label><select className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="lbl">Rating (0–5)</label><input className="input" type="number" step="0.1" min="0" max="5" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} /></div>
          <div><label className="lbl">Price (USD)</label><input className="input" type="number" step="0.01" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />{errs.price && <p className="f-err">{errs.price}</p>}</div>
          <div><label className="lbl">Stock</label><input className="input" type="number" min="0" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />{errs.stock && <p className="f-err">{errs.stock}</p>}</div>
          <div className="f-full"><label className="lbl">Description</label><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="f-full"><label className="lbl">Tags (comma separated)</label><input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="wireless, anc" /></div>
          <div className="f-full">
            <label className="lbl">Product images</label>
            <ImageUploader images={f.images} onChange={(images) => setF({ ...f, images })} />
            <p className="image-helper">The first image is the primary product image. Uploaded images are resized for this browser-only demo and saved with the product.</p>
          </div>
          <label className="chk f-full"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Feature on homepage</label>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark"><Ic n="check" s={15} /> Save product</button>
        </div>
      </form>
    </Modal>
  );
}
export function CategoryEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({ name: initial?.name || "", description: initial?.description || "", color: initial?.color || SWATCHES[0] }));
  const [err, setErr] = useState("");
  const save = (e) => {
    e.preventDefault();
    if (!f.name.trim()) { setErr("Required"); return; }
    appActions.upsertCategory({ id: initial?.id || "c" + uid(), name: f.name.trim(), description: f.description.trim(), color: f.color });
    onClose();
  };
  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}><label className="lbl">Name</label><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{err && <p className="f-err">{err}</p>}</div>
        <div style={{ marginBottom: 12 }}><label className="lbl">Description</label><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div style={{ marginBottom: 20 }}><label className="lbl">Color</label>
          <div className="swatches">{SWATCHES.map((c) => <button type="button" key={c} className={"swatch" + (f.color === c ? " sel" : "")} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={`Color ${c}`} />)}</div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark"><Ic n="check" s={15} /> Save category</button>
        </div>
      </form>
    </Modal>
  );
}
export function UserEditor({ initial, onClose }) {
  const [f, setF] = useState(() => ({ name: initial?.name || "", email: initial?.email || "", role: initial?.role || "customer", password: "" }));
  const [errs, setErrs] = useState({});
  const save = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = "Required";
    if (!/.+@.+\..+/.test(f.email)) er.email = "Valid email required";
    if (!initial && f.password.length < 6) er.password = "Min 6 chars";
    setErrs(er); if (Object.keys(er).length) return;
    const ok = appActions.upsertUser({ id: initial?.id || "u" + uid(), name: f.name.trim(), email: f.email.trim(), role: f.role, password: f.password ? f.password : initial?.password || "kiosk123" });
    if (ok) onClose();
  };
  return (
    <Modal title={initial ? "Edit user" : "New user"} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ marginBottom: 12 }}><label className="lbl">Name</label><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{errs.name && <p className="f-err">{errs.name}</p>}</div>
        <div style={{ marginBottom: 12 }}><label className="lbl">Email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />{errs.email && <p className="f-err">{errs.email}</p>}</div>
        <div style={{ marginBottom: 12 }}><label className="lbl">Role</label><select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="customer">customer</option><option value="editor">editor</option><option value="admin">admin</option></select></div>
        <div style={{ marginBottom: 20 }}><label className="lbl">Password {initial && "(leave blank to keep)"}</label><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{errs.password && <p className="f-err">{errs.password}</p>}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-dark"><Ic n="check" s={15} /> Save user</button>
        </div>
      </form>
    </Modal>
  );
}
export function DashboardTab() {
  const s = useApp();
  const revenue = s.orders.reduce((t, o) => t + o.total, 0);
  const revByCat = s.categories.map((c) => ({
    name: c.name,
    revenue: +s.orders.flatMap((o) => o.items).filter((i) => (s.products.find((p) => p.id === i.productId)?.categoryId || "") === c.id).reduce((t, i) => t + i.price * i.qty, 0).toFixed(2),
  }));
  const byCat = s.categories.map((c) => ({ name: c.name, value: s.products.filter((p) => p.categoryId === c.id).length, color: c.color })).filter((d) => d.value > 0);
  return (
    <>
      <div className="stat-grid">
        <div className="stat"><span className="ic"><Ic n="box" s={17} /></span><b>{s.products.length}</b><span>Products live</span></div>
        <div className="stat"><span className="ic"><Ic n="tag" s={17} /></span><b>{s.categories.length}</b><span>Categories</span></div>
        <div className="stat"><span className="ic"><Ic n="cart" s={17} /></span><b>{s.orders.length}</b><span>Orders</span></div>
        <div className="stat"><span className="ic"><Ic n="chart" s={17} /></span><b>{fmt(revenue)}</b><span>Revenue (mock)</span></div>
      </div>
      <div className="chart-row">
        <div className="chart-card"><h4>Revenue by category</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revByCat}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E1D4" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={52} /><RTooltip formatter={(v) => fmt(+v)} /><Bar dataKey="revenue" fill="#17150F" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card"><h4>Catalogue mix</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={byCat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>{byCat.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie><Legend formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{s.orders.slice(0, 5).map((o) => (
            <tr key={o.id}><td><b>{o.id}</b></td><td>{o.customer.name}</td><td>{o.items.reduce((n, i) => n + i.qty, 0)}</td><td>{fmt(o.total)}</td><td><span className="role-badge editor">{o.status}</span></td></tr>
          ))}</tbody></table>
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
      const p = state.products.find((x) => x.id === editId);
      if (p) setEditing(p);
      navigate("/admin/products");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const catName = (id) => s.categories.find((c) => c.id === id)?.name || "—";
  const list = s.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="toolbar">
        <label className="search-box"><Ic n="search" s={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter products…" aria-label="Filter products" /></label>
        <span className="result-count">{list.length} products</span>
        <button className="btn btn-dark" onClick={() => setCreating(true)}><Ic n="plus" s={15} /> New product</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Featured</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><div style={{ display: "flex", alignItems: "center", gap: 12 }}><img className="thumb" src={p.image} alt="" /><div><b>{p.name}</b><div style={{ fontSize: 12, color: "var(--ink2)" }}>{p.tags.map((t) => "#" + t).join(" ")}</div></div></div></td>
                <td>{catName(p.categoryId)}</td>
                <td>{fmt(p.price)}</td>
                <td>{p.stock === 0 ? <span className="low">Out</span> : p.stock < 10 ? <span className="low">{p.stock} low</span> : p.stock}</td>
                <td><button className="icon-btn" title={p.featured ? "Unfeature" : "Feature on homepage"} aria-label="Toggle featured" onClick={() => appActions.toggleFeatured(p.id)} style={p.featured ? { background: "var(--lime)", borderColor: "var(--lime)" } : {}}><Ic n="star" s={14} filled={p.featured} /></button></td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Ic n="edit" s={14} /></button>
                    <button className="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => { if (window.confirm(`Delete ${p.name}?`)) appActions.deleteProduct(p.id); }}><Ic n="trash" s={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && <ProductEditor initial={editing} onClose={() => { setEditing(null); setCreating(false); }} />}
    </>
  );
}
export function CategoriesTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="toolbar"><span className="result-count">{s.categories.length} categories</span>
        <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}><Ic n="plus" s={15} /> New category</button></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Category</th><th>Description</th><th>Products</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.id}>
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="cat-dot" style={{ background: c.color, marginBottom: 0 }} /><b>{c.name}</b></div></td>
                <td style={{ color: "var(--ink2)" }}>{c.description}</td>
                <td>{s.products.filter((p) => p.categoryId === c.id).length}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Ic n="edit" s={14} /></button>
                    <button className="icon-btn" aria-label={`Delete ${c.name}`} onClick={() => { if (window.confirm(`Delete ${c.name}?`)) appActions.deleteCategory(c.id); }}><Ic n="trash" s={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && <CategoryEditor initial={editing} onClose={() => { setEditing(null); setCreating(false); }} />}
    </>
  );
}
export function UsersTab() {
  const s = useApp();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="toolbar"><span className="result-count">{s.users.length} users</span>
        <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}><Ic n="plus" s={15} /> New user</button></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {s.users.map((u) => (
              <tr key={u.id}>
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="avatar">{u.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span><b>{u.name}</b>{s.session?.id === u.id && <span className="tag">you</span>}</div></td>
                <td style={{ color: "var(--ink2)" }}>{u.email}</td>
                <td><select className="status-sel" value={u.role} aria-label={`Role for ${u.name}`} onChange={(e) => appActions.setRole(u.id, e.target.value)}><option>customer</option><option>editor</option><option>admin</option></select></td>
                <td style={{ color: "var(--ink2)" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="icon-btn" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}><Ic n="edit" s={14} /></button>
                    <button className="icon-btn" aria-label={`Delete ${u.name}`} onClick={() => { if (window.confirm(`Delete ${u.name}?`)) appActions.deleteUser(u.id); }}><Ic n="trash" s={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(editing || creating) && <UserEditor initial={editing} onClose={() => { setEditing(null); setCreating(false); }} />}
    </>
  );
}
export function OrdersTab() {
  const s = useApp();
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          {s.orders.map((o) => (
            <tr key={o.id}>
              <td><b>{o.id}</b></td>
              <td><div>{o.customer.name}</div><div style={{ fontSize: 12, color: "var(--ink2)" }}>{o.customer.email}</div></td>
              <td style={{ maxWidth: 260 }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
              <td>{fmt(o.total)}</td>
              <td style={{ color: "var(--ink2)" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
              <td><select className="status-sel" value={o.status} aria-label={`Status for order ${o.id}`} onChange={(e) => appActions.setOrderStatus(o.id, e.target.value)}><option>paid</option><option>shipped</option><option>delivered</option><option>cancelled</option></select></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function AdminPage({ tab }) {
  const s = useApp();
  const tabs = [
    { id: "dashboard", path: "/admin", label: "Dashboard", icon: "chart" },
    { id: "products", path: "/admin/products", label: "Products", icon: "box", n: s.products.length },
    { id: "categories", path: "/admin/categories", label: "Categories", icon: "tag", n: s.categories.length },
    { id: "orders", path: "/admin/orders", label: "Orders", icon: "cart", n: s.orders.length },
    ...(s.session.role === "admin" ? [{ id: "users", path: "/admin/users", label: "Users", icon: "users", n: s.users.length }] : []),
  ];
  const activeTab = tabs.find((t) => t.id === tab);
  return (
    <div className="container admin">
      <aside className="admin-side" aria-label="Studio navigation">
        {tabs.map((t) => (
          <NavLink key={t.id} to={t.path} className="side-btn">
            <Ic n={t.icon} s={16} /> {t.label}{t.n != null && <span className="n">{t.n}</span>}
          </NavLink>
        ))}
      </aside>
      <main>
        <div className="sec-hd"><h1 className="sec-title display">{activeTab ? activeTab.label : "Dashboard"}</h1></div>
        {tab === "dashboard" && <DashboardTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "users" && s.session.role === "admin" && <UsersTab />}
      </main>
    </div>
  );
}
