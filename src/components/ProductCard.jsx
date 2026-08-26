import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "./icons";
import { ConfirmModal, Stars } from "./common";

export function ProductCard({ p }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = useApp();
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  const isWishlisted = s.wishlist.includes(p.id);
  const isCompared = s.comparison.includes(p.id);
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

  // Memoized callbacks to avoid creating new functions on every render
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setActiveImage(0);
  }, []);

  const handleWishlistClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!s.session) {
      navigate(`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    appActions.toggleWishlist(p.id);
  }, [p.id, s.session, navigate, location]);

  const handleComparisonClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    appActions.toggleComparison(p.id);
  }, [p.id]);

  const handleEditClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    navigate(`/admin/products?edit=${p.id}`);
  }, [p.id, navigate]);

  const handleDeleteClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    appActions.deleteProduct(p.id);
    setConfirmDelete(false);
  }, [p.id]);

  const handleAddToCart = useCallback(() => {
    appActions.addToCart(p.id);
  }, [p.id]);

  return (
    <article
      className="card"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-media">
        <Link to={`/product/${p.id}`} aria-label={p.name}>
          <img className="card-img" src={image} alt={p.name} loading="lazy" />
        </Link>
        {cat && (
          <Link className="card-cat" to={`/products?cat=${cat.id}`}>
            {cat.name}
          </Link>
        )}
        <button
          className={`wishlist-btn${isWishlisted ? " active" : ""}`}
          type="button"
          aria-label={isWishlisted ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
          aria-pressed={isWishlisted}
          title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={handleWishlistClick}
        >
          <Ic n="heart" s={16} filled={isWishlisted} />
        </button>
        <button
          className={`compare-btn${isCompared ? " active" : ""}`}
          type="button"
          aria-label={isCompared ? `Remove ${p.name} from comparison` : `Compare ${p.name}`}
          aria-pressed={isCompared}
          title={isCompared ? "Remove from comparison" : "Compare product"}
          onClick={handleComparisonClick}
        >
          <Ic n="chart" s={15} />
        </button>
        {canEdit && (
          <div className="card-admin">
            <button
              className="icon-btn"
              aria-label={`Edit ${p.name}`}
              title="Edit"
              onClick={handleEditClick}
            >
              <Ic n="edit" s={14} />
            </button>
            <button
              className="icon-btn"
              aria-label={`Delete ${p.name}`}
              title="Delete"
              onClick={handleDeleteClick}
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
        <Link className="card-name" to={`/product/${p.id}`}>
          {p.name}
        </Link>
        <div className="card-meta">
          <Stars v={p.rating} />
          <span>{p.rating.toFixed(1)}</span>
          {p.stock === 0 && <span className="low">Out of stock</span>}
          {p.stock > 0 && p.stock <= (p.stockThreshold ?? 10) && <span className="low">Only {p.stock} left</span>}
        </div>
        <div className="card-foot">
          <span className="price">{fmt(p.price)}</span>
          <button className="btn btn-dark btn-sm" disabled={p.stock === 0} onClick={handleAddToCart}>
            <Ic n="cart" s={14} /> Add
          </button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${p.name}?`}
          message="This removes the product from the catalogue and associated active shopping lists."
          confirmLabel="Delete product"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </article>
  );
}
