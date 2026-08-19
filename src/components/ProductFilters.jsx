import { fmt } from "../utils/helpers";
import { Ic } from "./icons";

export function ProductFilters({
  categories,
  query,
  setQuery,
  category,
  setCategory,
  sort,
  setSort,
  priceCap,
  maxPrice,
  setPriceCap,
  minRating,
  setMinRating,
  inStock,
  setInStock,
  filtered,
  total,
  searching,
  onClear,
  hasFilters,
}) {
  return (
    <>
      <div className="toolbar product-toolbar">
        <label className="search-box product-search">
          <Ic n="search" s={15} />
          <span className="sr-only">Search products</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, tags, or features…" aria-label="Search products" />
        </label>

        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>

        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="rating">Top rated</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="name">Name: A–Z</option>
        </select>

        <select className="select" value={String(minRating)} onChange={(e) => setMinRating(Number(e.target.value))} aria-label="Filter by minimum rating">
          <option value="0">Any rating</option>
          <option value="3">3★ & up</option>
          <option value="4">4★ & up</option>
          <option value="4.5">4.5★ & up</option>
        </select>

        <label className="range-wrap product-range">
          <span>Up to {fmt(priceCap)}</span>
          <input type="range" min={10} max={maxPrice} step={5} value={priceCap} onChange={(e) => setPriceCap(Number(e.target.value))} aria-label="Maximum price" />
        </label>

        <label className="chk">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          In stock
        </label>

        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={onClear}><Ic n="x" s={13} /> Clear</button>}
      </div>

      <div className="catalog-meta">
        <p><strong>{filtered}</strong> {filtered === 1 ? "product" : "products"}{searching ? " found" : " available"}</p>
        <span>{total} total in catalogue</span>
      </div>
    </>
  );
}
