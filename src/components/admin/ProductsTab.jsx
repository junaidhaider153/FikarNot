import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp, appActions } from "../../store/appStore";
import { GALLERY } from "../../assets/assets";
import { fmt, uid } from "../../utils/helpers";
import { Ic } from "../icons";
import { Modal, Pagination } from "../common";
import { ImageUploader } from "../ImageUploader";
import { usePagination } from "../../hooks/usePagination";

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
              <th className="u-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <img className="thumb" src={p.image} alt="" loading="lazy" />
                    <div>
                      <b>{p.name}</b>
                      <div className="field-hint">{p.tags.map((t) => "#" + t).join(" ")}</div>
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
                <td className="u-right">
                  <div className="u-row-end">
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
