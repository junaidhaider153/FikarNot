import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { resolveRecentlyViewed } from "../utils/recommendations";
import { ProductCard } from "../components/ProductCard";
import { ConfirmModal, Empty } from "../components/common";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export default function RecentlyViewedPage() {
  const s = useApp();
  const products = useMemo(() => resolveRecentlyViewed(s.recentlyViewed, s.products, 8), [s.recentlyViewed, s.products]);
  const hasHistory = products.length > 0;
  const [confirmClear, setConfirmClear] = useState(false);
  useDocumentMeta({ title: "Recently viewed", noindex: true });
  return (
    <div className="container section recently-viewed-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">Your browsing trail</span>
          <h1 className="h1 page-title">Recently viewed.</h1>
          <p className="hero-sub">Pick up where you left off. Your most recent FikarNot product views stay here for a while.</p>
        </div>
        {hasHistory && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setConfirmClear(true);
            }}
          >
            <Ic n="trash" s={15} /> Clear history
          </button>
        )}
      </div>
      {hasHistory ? (
        <div className="prod-grid recently-viewed-grid">
          {products.map((product) => (
            <ProductCard key={product.id} p={product} />
          ))}
        </div>
      ) : (
        <Empty
          icon="clock"
          title="Nothing here yet"
          sub="Open a few products and they'll appear here so you can return to them quickly."
          cta={
            <Link className="btn btn-dark" to="/products">
              Browse products
            </Link>
          }
        />
      )}
      {confirmClear && (
        <ConfirmModal
          title="Clear recently viewed?"
          message="Your recent product history will be removed from this device."
          confirmLabel="Clear history"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            appActions.clearRecentlyViewed();
            setConfirmClear(false);
          }}
        />
      )}
    </div>
  );
}
