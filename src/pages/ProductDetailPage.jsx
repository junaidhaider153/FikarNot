import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { api } from "../api/storeApi";
import { useAsync } from "../hooks/useAsync";
import { fmt, NotFoundError } from "../utils/helpers";
import { getProductReviews, getProductReviewSummary } from "../utils/reviews";
import { Ic } from "../components/icons";
import { ProductCard } from "../components/ProductCard";
import { ErrorCard, Empty, Modal, Qty, SkelDetail, Stars } from "../components/common";

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
  const location = useLocation();
  const { data: p, loading, error, retry } = useAsync(() => api.getProduct(id), [id]);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [removeReviewOpen, setRemoveReviewOpen] = useState(false);

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
  const reviewSummary = getProductReviewSummary(s.reviews || [], p.id, p.rating);
  const productReviews = getProductReviews(s.reviews || [], p.id);
  const myReview = s.session ? productReviews.find((review) => review.userId === s.session.id) : null;
  const canReview = Boolean(s.session && s.orders.some((order) => (order.customer?.userId === s.session.id || (!order.customer?.userId && order.customer?.email?.toLowerCase() === s.session.email.toLowerCase())) && order.items?.some((item) => item.productId === p.id)));
  const related = s.products.filter((x) => x.categoryId === p.categoryId && x.id !== p.id).slice(0, 4);
  const images = (Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(Boolean);
  const currentImage = images[Math.min(activeImage, images.length - 1)] || p.image;
  const stockLabel = p.stock > 0 ? `${p.stock} in stock` : "Out of stock";
  const featureRows = [
    { label: "Category", value: cat?.name || "General" },
    { label: "SKU", value: p.sku || "—" },
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
            <span>{reviewSummary.average.toFixed(1)} · {reviewSummary.count ? `${reviewSummary.count} review${reviewSummary.count === 1 ? "" : "s"}` : stockLabel}</span>
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
            <button className={`btn btn-ghost wishlist-detail-btn${isWishlisted ? " active" : ""}`} onClick={() => {
              if (!s.session) {
                navigate(`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
                return;
              }
              appActions.toggleWishlist(p.id);
            }} aria-pressed={isWishlisted}>
              <Ic n="heart" s={15} filled={isWishlisted} /> {isWishlisted ? "Saved" : "Wishlist"}
            </button>
            {canEdit && <button className="btn btn-ghost" onClick={() => navigate(`/admin/products?edit=${p.id}`)}><Ic n="edit" s={15} /> Edit</button>}
          </div>

          <div className="tag-row">{p.tags?.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        </div>
      </div>

      <section className="section review-section" aria-labelledby="reviews-heading">
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Customer voice</span>
            <h2 id="reviews-heading" className="sec-title display">Reviews & ratings</h2>
          </div>
          {canReview ? (
            <button className="btn btn-dark" onClick={() => {
              setReviewRating(myReview?.rating || 5);
              setReviewTitle(myReview?.title || "");
              setReviewBody(myReview?.body || "");
              setReviewOpen(true);
            }}>
              {myReview ? "Edit your review" : "Write a review"}
            </button>
          ) : !s.session ? (
            <Link className="btn btn-ghost" to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}>Sign in to review</Link>
          ) : null}
        </div>
        <div className="review-summary-grid">
          <div className="review-score-card">
            <strong>{reviewSummary.average.toFixed(1)}</strong>
            <Stars v={reviewSummary.average} size={16} />
            <span>{reviewSummary.count ? `${reviewSummary.count} verified review${reviewSummary.count === 1 ? "" : "s"}` : "No reviews yet"}</span>
          </div>
          <div className="review-bars">
            {[5,4,3,2,1].map((score) => {
              const count = reviewSummary.distribution[score] || 0;
              const pct = reviewSummary.count ? Math.round(count / reviewSummary.count * 100) : 0;
              return <div className="review-bar" key={score}><span>{score} ★</span><div><span style={{ width: `${pct}%` }} /></div><b>{count}</b></div>;
            })}
          </div>
        </div>
        {productReviews.length ? <div className="review-list">{productReviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-card-top">
              <div><strong>{review.title}</strong><div className="review-meta"><Stars v={review.rating} size={13} /> <span>{review.authorName}</span>{review.verifiedPurchase && <span className="verified-review">Verified purchase</span>}</div></div>
              <time dateTime={new Date(review.createdAt).toISOString()}>{new Date(review.createdAt).toLocaleDateString()}</time>
            </div>
            <p>{review.body}</p>
            {myReview?.id === review.id && <button className="btn btn-danger btn-sm" onClick={() => setRemoveReviewOpen(true)}><Ic n="trash" s={13} /> Remove your review</button>}
          </article>
        ))}</div> : <Empty icon="star" title="Be the first to review" sub="Purchase this product and share what you think." />}
      </section>

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

      {removeReviewOpen && myReview && (
        <Modal title="Remove your review" onClose={() => setRemoveReviewOpen(false)}>
          <div className="delete-account-warning">
            <span className="empty-ic"><Ic n="alert" s={26} /></span>
            <h3 className="display">Remove this review?</h3>
            <p>Your review and rating will be removed from this product. This action cannot be undone.</p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRemoveReviewOpen(false)}>Keep review</button>
            <button type="button" className="btn btn-danger" onClick={() => { appActions.deleteReview(myReview.id); setRemoveReviewOpen(false); }}>Remove review</button>
          </div>
        </Modal>
      )}

      {reviewOpen && (
        <div className="modal-bk" onMouseDown={(e) => { if (e.target === e.currentTarget) setReviewOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Write a review">
            <div className="modal-hd"><h3 className="display">{myReview ? "Edit your review" : "Write a review"}</h3><button className="icon-btn" onClick={() => setReviewOpen(false)} aria-label="Close"><Ic n="x" /></button></div>
            <form className="modal-bd" onSubmit={(e) => { e.preventDefault(); const ok = appActions.submitReview({ productId: p.id, rating: reviewRating, title: reviewTitle, body: reviewBody }); if (ok) setReviewOpen(false); }}>
              <label className="lbl">Rating</label>
              <div className="review-star-picker" role="radiogroup" aria-label="Rating">
                {[1,2,3,4,5].map((score) => <button type="button" key={score} className={score <= reviewRating ? "active" : ""} onClick={() => setReviewRating(score)} aria-label={`${score} star${score === 1 ? "" : "s"}`}><Ic n="star" s={22} filled={score <= reviewRating} /></button>)}
              </div>
              <div style={{ marginTop: 16 }}><label className="lbl" htmlFor="review-title">Title</label><input id="review-title" className="input" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} maxLength={80} placeholder="What stood out?" /></div>
              <div style={{ marginTop: 14 }}><label className="lbl" htmlFor="review-body">Review</label><textarea id="review-body" className="textarea" value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} maxLength={600} placeholder="Tell other shoppers about your experience." /></div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}><button type="button" className="btn btn-ghost" onClick={() => setReviewOpen(false)}>Cancel</button><button className="btn btn-dark"><Ic n="check" s={15} /> Save review</button></div>
            </form>
          </div>
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
