import { Link } from "react-router-dom";
import { appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "./icons";
import { Qty } from "./common";

function getImages(product) {
  const list = Array.isArray(product.images) && product.images.length ? product.images : [product.image];
  return [...new Set(list.filter(Boolean))];
}

export function CartItem({ line }) {
  const { p, qty } = line;
  const images = getImages(p);
  const maxQty = Math.max(1, p.stock);
  const stockAdjusted = qty > p.stock;
  const image = images[0];

  return (
    <article className="cart-item">
      <Link className="cart-item-media" to={`/product/${p.id}`} aria-label={`View ${p.name}`}>
        <img src={image} alt={p.name} loading="lazy" />
        {images.length > 1 && <span className="cart-item-image-count">{images.length} photos</span>}
      </Link>
      <div className="cart-item-info">
        <div>
          <Link className="cart-item-name" to={`/product/${p.id}`}>{p.name}</Link>
          <p className="cart-item-category">{p.tags?.slice(0, 2).map((tag) => `#${tag}`).join(" · ") || "Everyday essential"}</p>
        </div>
        <div className="cart-item-meta">
          <span>{fmt(p.price)} each</span>
          {p.stock > 0 && p.stock < 10 && <span className="low">Only {p.stock} left</span>}
          {p.stock === 0 && <span className="low">Currently unavailable</span>}
        </div>
        {stockAdjusted && <p className="cart-stock-warning">Quantity adjusted to available stock.</p>}
        <div className="cart-item-actions">
          <Qty value={Math.min(qty, maxQty)} set={(value) => appActions.setCartQty(p.id, value)} max={maxQty} />
          <button className="cart-remove" type="button" onClick={() => appActions.removeFromCart(p.id)}>
            <Ic n="trash" s={14} /> Remove
          </button>
        </div>
      </div>
      <div className="cart-item-total">
        <span className="price">{fmt(p.price * Math.min(qty, maxQty))}</span>
      </div>
    </article>
  );
}
