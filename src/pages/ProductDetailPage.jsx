import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { api } from "../api/storeApi";
import { useAsync } from "../hooks/useAsync";
import { fmt, NotFoundError } from "../utils/helpers";
import { Ic } from "../components/icons";
import { ProductCard } from "../components/ProductCard";
import { ErrorCard, Empty, Qty, SkelDetail, Stars } from "../components/common";

const readRecentlyViewed = () => {
  try { return JSON.parse(localStorage.getItem("fikarnot_recently_viewed") || "[]"); } catch { return []; }
};

function rememberProduct(product) {
  try {
    const current = readRecentlyViewed().filter((id) => id !== product.id);
    localStorage.setItem("fikarnot_recently_viewed", JSON.stringify([product.id, ...current].slice(0, 6)));
  } catch { /* demo storage can be unavailable */ }
}

export default function ProductDetailPage() {
  const s = useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, loading, error, retry } = useAsync(() => api.getProduct(id), [id]);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => setQty(1), [id]);
  useEffect(() => setActiveImage(0), [id]);
  useEffect(() => { if (p) rememberProduct(p); }, [p]);

  if (loading) return <div className="container"><SkelDetail /></div>;

  if (error) {
    return (
      <div className="container" style={{ padding: "60px 24px" }}>
        {error instanceof NotFoundError
          ? <Empty icon="box" title="Product not found" sub={error.message + ". It may have been removed from the catalogue."} cta={<Link className="btn btn-dark" to="/products">Back to shop</Link>} />
          : <ErrorCard message={error.message} onRetry={retry} />}
      </div>
    );
  }

  const cat = s.categories.find((c) => c.id === p.categoryId);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  const isWishlisted = s.wishlist.includes(p.id);
  const related = s.products.filter((x) => x.categoryId === p.categoryId && x.id !== p.id).slice(0, 4);
  const images = (Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(Boolean);
  const currentImage = images[Math.min(activeImage, images.length - 1)] || p.image;
  const stockLabel = p.stock > 0 ? `${p.stock} in stock` : "Out of stock";
  const featureRows = [
    { label: "Category", value: cat?.name || "General" },
    { label: "Rating", value: `${p.rating.toFixed(1)} / 5` },
    { label: "Availability", value: stockLabel },
    { label: "Tags", value: p.tags?.length ? p.tags.map((t) => `#${t}`).join(" ") : "—" },
  ];

  const addToCart = () => appActions.addToCart(p.id, qty);

  return (
    <div className="container product-detail-page">
      <div className="detail">
        <div>
          <div className="detail-media detail-gallery-main">
            <button className="detail-image-button" type="button" onClick={() => setZoomed(true)} aria-label="Open product image">
              <img src={currentImage} alt={p.name} />
            </button>
          </div>
          {images.length > 1 && (
            <div className="detail-thumbs" aria-label="Product images">
              {images.map((image, index) => (
                <button
                  type="button"
                  key={`${image}-${index}`}
                  className={"detail-thumb" + (index === activeImage ? " active" : "")}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View product image ${index + 1}`}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-copy">
          <p className="crumbs"><Link to="/">Home</Link> / <Link to="/products">Shop</Link>{cat && <> / <Link to={`/products?cat=${cat.id}`}>{cat.name}</Link></>}</p>
          <span className="eyebrow">Product details</span>
          <h1 className="display">{p.name}</h1>
          <div className="card-meta product-rating-row" style={{ margin: "10px 0 4px" }}>
            <Stars v={p.rating} size={15} />
            <span>{p.rating.toFixed(1)} · {stockLabel}</span>
          </div>
          <div className="price product-price">{fmt(p.price)}</div>
          <p className="desc product-description">{p.description}</p>

          <div className="product-benefits">
            <div><Ic n="check" s={15} /><span>Carefully selected by FikarNot</span></div>
            <div><Ic n="truck" s={15} /><span>Free shipping over $75</span></div>
            <div><Ic n="shield" s={15} /><span>Simple 30-day returns</span></div>
          </div>

          <div className="product-actions">
            <Qty value={qty} set={setQty} max={Math.max(1, p.stock)} />
            <button className="btn btn-dark" disabled={p.stock === 0} onClick={addToCart}>
              <Ic n="cart" s={16} /> Add to cart
            </button>
            <button className="btn btn-lime" disabled={p.stock === 0} onClick={() => { addToCart(); navigate("/checkout"); }}>
              Buy now
            </button>
            <button className={`btn btn-ghost wishlist-detail-btn${isWishlisted ? " active" : ""}`} onClick={() => appActions.toggleWishlist(p.id)} aria-pressed={isWishlisted}>
              <Ic n="heart" s={15} filled={isWishlisted} /> {isWishlisted ? "Saved" : "Wishlist"}
            </button>
            {canEdit && <button className="btn btn-ghost" onClick={() => navigate(`/admin/products?edit=${p.id}`)}><Ic n="edit" s={15} /> Edit</button>}
          </div>

          <div className="tag-row">{p.tags?.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        </div>
      </div>

      <div className="product-info-grid section">
        <div className="product-info-panel">
          <span className="eyebrow">At a glance</span>
          <h2 className="sec-title display">Product information</h2>
          <div className="product-spec-grid">
            {featureRows.map((row) => <div className="product-spec" key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
          </div>
        </div>
        <div className="product-info-panel">
          <span className="eyebrow">Need to know</span>
          <h2 className="sec-title display">Shopping with confidence</h2>
          <div className="confidence-list">
            <div><span className="step-n">1</span><p><b>Choose your quantity.</b> Stock is checked before items are added to the cart.</p></div>
            <div><span className="step-n">2</span><p><b>Review your order.</b> Your cart keeps quantities and totals in sync.</p></div>
            <div><span className="step-n">3</span><p><b>Keep browsing.</b> Related products are shown below so you can compare similar items.</p></div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="section">
          <div className="sec-hd"><h2 className="sec-title display">More in {cat ? cat.name : "this range"}</h2><Link className="sec-link" to={`/products?cat=${cat?.id || ""}`}>View category <Ic n="arrow" s={14} /></Link></div>
          <div className="prod-grid">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </div>
      )}

      {zoomed && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Product image preview" onMouseDown={(e) => { if (e.target === e.currentTarget) setZoomed(false); }}>
          <button className="icon-btn dark lightbox-close" onClick={() => setZoomed(false)} aria-label="Close image preview"><Ic n="x" s={18} /></button>
          <img src={currentImage} alt={p.name} />
        </div>
      )}
    </div>
  );
}
