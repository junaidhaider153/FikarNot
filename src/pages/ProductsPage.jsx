import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../store/appStore";
import { api } from "../api/storeApi";
import { useAsync } from "../hooks/useAsync";
import { useDebounced } from "../hooks/useDebounced";
import { ErrorCard, Empty, SkelGrid, Pagination } from "../components/common";
import { ProductCard } from "../components/ProductCard";
import { ProductFilters } from "../components/ProductFilters";
import { searchProducts } from "../utils/search";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { usePagination } from "../hooks/usePagination";

const SORTS = new Set(["featured", "newest", "rating", "price-asc", "price-desc", "name"]);
const RATINGS = new Set([0, 3, 4, 4.5]);

export default function ProductsPage() {
  const s = useApp();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, retry } = useAsync(() => api.listProducts(), []);
  const products = data || [];
  useDocumentMeta({
    title: "Shop all products",
    description: "Browse the full FikarNot catalogue — audio, wearables, home & desk, and carry essentials.",
  });

  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("cat") || "all");
  const [sort, setSort] = useState(SORTS.has(params.get("sort")) ? params.get("sort") : "featured");
  const [inStock, setInStock] = useState(params.get("stock") === "1");
  const [minRating, setMinRating] = useState(RATINGS.has(Number(params.get("rating"))) ? Number(params.get("rating")) : 0);

  const maxPrice = Math.max(100, ...products.map((product) => Math.ceil(Number(product.price) / 10) * 10), 100);
  const parsedPrice = Number(params.get("max"));
  const initialPrice = Number.isFinite(parsedPrice) && parsedPrice >= 10 ? Math.min(parsedPrice, maxPrice) : maxPrice;
  const [priceCap, setPriceCap] = useState(initialPrice);
  const dq = useDebounced(q, 300);

  useEffect(() => {
    const nextCategory = params.get("cat") || "all";
    const nextSort = params.get("sort");
    const nextStock = params.get("stock") === "1";
    const nextRating = Number(params.get("rating"));
    const nextMax = Number(params.get("max"));

    setQ(params.get("q") || "");
    setCategory(nextCategory);
    setSort(SORTS.has(nextSort) ? nextSort : "featured");
    setInStock(nextStock);
    setMinRating(RATINGS.has(nextRating) ? nextRating : 0);
    setPriceCap(Number.isFinite(nextMax) && nextMax >= 10 ? Math.min(nextMax, maxPrice) : maxPrice);
  }, [params, maxPrice]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    const normalized = dq.trim();
    if (normalized) next.set("q", normalized);
    else next.delete("q");
    const current = params.get("q") || "";
    if (current !== normalized) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const updateParam = (key, value, defaultValue) => {
    const next = new URLSearchParams(params);
    if (value === defaultValue || value === "" || value == null) next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  const hasFilters = Boolean(q.trim()) || category !== "all" || sort !== "featured" || inStock || minRating > 0 || priceCap < maxPrice;

  const list = useMemo(() => {
    let out = searchProducts(products, dq);

    out = out.filter((product) => {
      if (category !== "all" && product.categoryId !== category) return false;
      if (product.price > priceCap) return false;
      if (inStock && product.stock <= 0) return false;
      if (minRating > 0 && Number(product.rating) < minRating) return false;
      return true;
    });

    if (dq.trim()) return out;

    const by = {
      featured: (a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating,
      newest: (a, b) => b.createdAt - a.createdAt,
      rating: (a, b) => b.rating - a.rating,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
    };

    return [...out].sort(by[sort] || by.featured);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depending on `data`, not the derived `products` (a fresh array reference every render), so this actually memoizes.
  }, [data, dq, category, priceCap, inStock, minRating, sort]);

  const { page, pageCount, pageItems, setPage, start, end, total } = usePagination(list, 12);

  const clear = () => {
    setQ("");
    setCategory("all");
    setSort("featured");
    setInStock(false);
    setMinRating(0);
    setPriceCap(maxPrice);
    setParams({}, { replace: true });
  };

  return (
    <div className="container catalog-page" style={{ padding: "36px 24px" }}>
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">The collection</p>
          <h1 className="sec-title display">{dq.trim() ? `Results for “${dq.trim()}”` : "Shop all"}</h1>
          <p className="catalog-intro">Thoughtfully selected everyday objects, ready to find their place in your life.</p>
        </div>
      </div>

      <ProductFilters
        categories={s.categories}
        query={q}
        setQuery={setQ}
        category={category}
        setCategory={(value) => {
          setCategory(value);
          updateParam("cat", value, "all");
        }}
        sort={sort}
        setSort={(value) => {
          setSort(value);
          updateParam("sort", value, "featured");
        }}
        priceCap={priceCap}
        maxPrice={maxPrice}
        setPriceCap={(value) => {
          setPriceCap(value);
          updateParam("max", value, maxPrice);
        }}
        minRating={minRating}
        setMinRating={(value) => {
          setMinRating(value);
          updateParam("rating", value, 0);
        }}
        inStock={inStock}
        setInStock={(value) => {
          setInStock(value);
          updateParam("stock", value ? 1 : 0, 0);
        }}
        filtered={!loading ? list.length : 0}
        total={products.length}
        searching={Boolean(dq.trim())}
        onClear={clear}
        hasFilters={hasFilters}
      />

      {loading ? (
        <SkelGrid n={8} />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={retry} />
      ) : list.length === 0 ? (
        <Empty
          icon="search"
          title="Nothing matches"
          sub="Try a broader search or remove one of your filters."
          cta={
            <button className="btn btn-dark" onClick={clear}>
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <div className="prod-grid catalog-grid">
            {pageItems.map((product) => (
              <ProductCard key={product.id} p={product} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} setPage={setPage} start={start} end={end} total={total} noun="products" />
        </>
      )}
    </div>
  );
}
