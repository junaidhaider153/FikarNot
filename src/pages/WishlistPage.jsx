import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { ProductCard } from "../components/ProductCard";
import { Empty } from "../components/common";
import { Ic } from "../components/icons";

export default function WishlistPage() {
  const s = useApp();
  const products = useMemo(() => s.wishlist
    .map((id) => s.products.find((product) => product.id === id))
    .filter(Boolean), [s.wishlist, s.products]);

  return (
    <div className="container page-pad wishlist-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Saved for later</p>
          <h1 className="h1 display">Your wishlist</h1>
          <p className="page-sub">Keep the things you love close. Add them to your bag whenever you are ready.</p>
        </div>
        {products.length > 0 && (
          <button className="btn btn-ghost" onClick={appActions.clearWishlist}>
            <Ic n="trash" s={14} /> Clear wishlist
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <Empty
          icon="heart"
          title="Your wishlist is empty"
          sub="Save products you want to compare or come back to later."
          cta={<Link className="btn btn-dark" to="/products">Explore products</Link>}
        />
      ) : (
        <>
          <div className="wishlist-meta">
            <span>{products.length} saved {products.length === 1 ? "item" : "items"}</span>
            <Link className="sec-link" to="/products">Continue shopping <Ic n="arrow" s={14} /></Link>
          </div>
          <div className="prod-grid">
            {products.map((product) => <ProductCard key={product.id} p={product} />)}
          </div>
        </>
      )}
    </div>
  );
}
