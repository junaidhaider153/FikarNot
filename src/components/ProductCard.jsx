import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "./icons";
import { Stars } from "./common";

export function ProductCard({ p }) {
  const s = useApp();
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  const navigate = useNavigate();
  return (
    <article className="card">
      <div className="card-media">
        <Link to={`/product/${p.id}`} aria-label={p.name}><img className="card-img" src={p.image} alt={p.name} loading="lazy" /></Link>
        {cat && <Link className="card-cat" to={`/products?cat=${cat.id}`}>{cat.name}</Link>}
        {canEdit && (
          <div className="card-admin">
            <button className="icon-btn" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => navigate(`/admin/products?edit=${p.id}`)}><Ic n="edit" s={14} /></button>
            <button className="icon-btn" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => { if (window.confirm(`Delete ${p.name}?`)) appActions.deleteProduct(p.id); }}><Ic n="trash" s={14} /></button>
          </div>
        )}
      </div>
      <div className="card-body">
        <Link className="card-name" to={`/product/${p.id}`}>{p.name}</Link>
        <div className="card-meta"><Stars v={p.rating} /><span>{p.rating.toFixed(1)}</span>{p.stock === 0 && <span className="low">Out of stock</span>}{p.stock > 0 && p.stock < 10 && <span className="low">Only {p.stock} left</span>}</div>
        <div className="card-foot">
          <span className="price">{fmt(p.price)}</span>
          <button className="btn btn-dark btn-sm" disabled={p.stock === 0} onClick={() => appActions.addToCart(p.id)}><Ic n="cart" s={14} /> Add</button>
        </div>
      </div>
    </article>
  );
}

/* ============================ pages ====================================== */
