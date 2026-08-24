import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Stars, Empty } from "../components/common";
import { Ic } from "../components/icons";

export default function ComparePage() {
  const s = useApp();
  const products = s.comparison.map((id) => s.products.find((p) => p.id === id)).filter(Boolean);
  if (!products.length) {
    return (
      <div className="container" style={{ padding: "60px 24px" }}>
        <Empty
          icon="box"
          title="Nothing to compare"
          sub="Add up to three products to compare their essentials side by side."
          cta={
            <Link className="btn btn-dark" to="/products">
              Browse products
            </Link>
          }
        />
      </div>
    );
  }
  const rows = [
    ["Category", (p) => s.categories.find((c) => c.id === p.categoryId)?.name || "—"],
    ["Price", (p) => fmt(p.price)],
    [
      "Rating",
      (p) => (
        <span>
          <Stars v={p.rating} /> {p.rating.toFixed(1)}
        </span>
      ),
    ],
    ["Availability", (p) => (p.stock === 0 ? "Out of stock" : `${p.stock} in stock`)],
    ["SKU", (p) => p.sku || "—"],
    ["Tags", (p) => (p.tags?.length ? p.tags.map((t) => `#${t}`).join(", ") : "—")],
    ["Description", (p) => p.description || "—"],
  ];
  return (
    <div className="container compare-page">
      <div className="sec-hd">
        <div>
          <p className="eyebrow">Compare</p>
          <h1 className="sec-title display">Find the better fit.</h1>
          <p className="compare-sub">Compare up to three FikarNot products side by side.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => appActions.clearComparison()}>
          <Ic n="x" s={15} /> Clear
        </button>
      </div>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Feature</th>
              {products.map((p) => (
                <th key={p.id}>
                  <div className="compare-product">
                    <img src={p.images?.[0] || p.image} alt="" />
                    <Link to={`/product/${p.id}`}>{p.name}</Link>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${p.name} from comparison`}
                      onClick={() => appActions.toggleComparison(p.id)}
                    >
                      <Ic n="x" s={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, render]) => (
              <tr key={label}>
                <th>{label}</th>
                {products.map((p) => (
                  <td key={p.id}>{render(p)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="compare-actions">
        <Link className="btn btn-lime" to="/products">
          Add another product
        </Link>
        <Link className="btn btn-dark" to={`/product/${products[0].id}`}>
          View product
        </Link>
      </div>
    </div>
  );
}
