import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "./icons";
import { Stars } from "./common";

export function ProductCard({ p }) {
  const s = useApp();
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  const isWishlisted = s.wishlist.includes(p.id);
  const navigate = useNavigate();
  const location = useLocation();
  const images = useMemo(() => {
    const list = Array.isArray(p.images) && p.images.length ? p.images : [p.image];
    return [...new Set(list.filter(Boolean))];
  }, [p.images, p.image]);
  const [activeImage, setActiveImage] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setActiveImage(0);
  }, [p.id]);

  useEffect(() => {
    if (!hovered || images.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % images.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [hovered, images.length]);

  const image = images[activeImage] || images[0];

  return (
    <article
      className="card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setActiveImage(0); }}
    >
      <div className="card-media">
        <Link to={`/product/${p.id}`} aria-label={p.name}>
          <img className="card-img" src={image} alt={p.name} loading="lazy" />
        </Link>
        {cat && <Link className="card-cat" to={`/products?cat=${cat.id}`}>{cat.name}</Link>}
        <button
          className={`wishlist-btn${isWishlisted ? " active" : ""}`}
          type="button"
          aria-label={isWishlisted ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
          aria-pressed={isWishlisted}
          title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!s.session) {
              navigate(`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
              return;
            }
            appActions.toggleWishlist(p.id);
          }}
        >
          <Ic n="heart" s={16} filled={isWishlisted} />
        </button>
        {canEdit && (
          <div className="card-admin">
            <button
              className="icon-btn"
              aria-label={`Edit ${p.name}`}
              title="Edit"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigate(`/admin/products?edit=${p.id}`);
              }}
            >
              <Ic n="edit" s={14} />
            </button>
            <button
              className="icon-btn"
              aria-label={`Delete ${p.name}`}
              title="Delete"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (window.confirm(`Delete ${p.name}?`)) appActions.deleteProduct(p.id);
              }}
            >
              <Ic n="trash" s={14} />
            </button>
          </div>
        )}
        {images.length > 1 && (
          <span className="image-count" aria-label={`${images.length} product images`}>
            {activeImage + 1}/{images.length}
          </span>
        )}
      </div>
      <div className="card-body">
        <Link className="card-name" to={`/product/${p.id}`}>{p.name}</Link>
        <div className="card-meta"><Stars v={p.rating} /><span>{p.rating.toFixed(1)}</span>{p.stock === 0 && <span className="low">Out of stock</span>}{p.stock > 0 && p.stock <= (p.stockThreshold ?? 10) && <span className="low">Only {p.stock} left</span>}</div>
        <div className="card-foot">
          <span className="price">{fmt(p.price)}</span>
          <button className="btn btn-dark btn-sm" disabled={p.stock === 0} onClick={() => appActions.addToCart(p.id)}><Ic n="cart" s={14} /> Add</button>
        </div>
      </div>
    </article>
  );
}
