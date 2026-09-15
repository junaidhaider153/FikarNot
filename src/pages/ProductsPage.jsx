import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../store/appStore";
import { useAsync } from "../hooks/useAsync";
import { useDebounced } from "../hooks/useDebounced";
import { ErrorCard, Empty, SkelGrid, Pagination } from "../components/common";
import { ProductCard } from "../components/ProductCard";
import { ProductFilters } from "../components/ProductFilters";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { catalogApi } from "../api/catalogApi";

const SORTS = new Set(["featured", "newest", "rating", "price-asc", "price-desc", "name"]);
const RATINGS = new Set([0, 3, 4, 4.5]);

export default function ProductsPage() {
  const s = useApp();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(Number(params.get("page") || 1) || 1);
  useDocumentMeta({
    title: "Shop all products",
    description: "Browse the full FikarNot catalogue — audio, wearables, home & desk, and carry essentials.",
  });

  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("cat") || "all");
  const [sort, setSort] = useState(SORTS.has(params.get("sort")) ? params.get("sort") : "featured");
  const [inStock, setInStock] = useState(params.get("stock") === "1");
  const [minRating, setMinRating] = useState(RATINGS.has(Number(params.get("rating"))) ? Number(params.get("rating")) : 0);

  const [priceCap, setPriceCap] = useState(Number(params.get("max")) || 100);
  const dq = useDebounced(q, 300);

  useEffect(() => {
    const nextCategory = params.get("cat") || "all";
    const nextSort = params.get("sort");
    const nextStock = params.get("stock") === "1";
    const nextRating = Number(params.get("rating"));
    const nextMax = Number(params.get("max"));
    const nextPage = Math.max(1, Number(params.get("page")) || 1);
    setQ(params.get("q") || "");
    setCategory(nextCategory);
    setSort(SORTS.has(nextSort) ? nextSort : "featured");
    setInStock(nextStock);
    setMinRating(RATINGS.has(nextRating) ? nextRating : 0);
    if (Number.isFinite(nextMax) && nextMax >= 10) setPriceCap(nextMax);
    setPage(nextPage);
  }, [params]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    const normalized = dq.trim();
    if (normalized) next.set("q", normalized);
    else next.delete("q");
    next.delete("page");
    const current = params.get("q") || "";
    if (current !== normalized || params.get("page")) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const updateParam = (key, value, defaultValue) => {
    const next = new URLSearchParams(params);
    if (value === defaultValue || value === "" || value == null) next.delete(key);
    else next.set(key, String(value));
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const changePage = (nextPage) => {
    const safe = Math.max(1, Math.min(pageCount, nextPage));
    setPage(safe);
    updateParam("page", safe, 1);
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const hasExplicitMax = params.has("max");
  const requestParams = {
    q: dq.trim(),
    category: category === "all" ? "" : category,
    sort,
    stock: inStock ? 1 : "",
    rating: minRating || "",
    maxPrice: hasExplicitMax ? priceCap : "",
    limit: 12,
    offset: Math.max(0, (page - 1) * 12),
  };
  const { data, loading, error, retry } = useAsync(() => catalogApi.list(requestParams), [dq, category, sort, inStock, minRating, priceCap, page]);
  const products = data?.products || [];
  const maxPrice = Math.max(100, Math.ceil(Number(data?.maxPrice || 100) / 10) * 10);
  useEffect(() => {
    if (!hasExplicitMax && data?.maxPrice) setPriceCap(Math.max(100, Math.ceil(Number(data.maxPrice) / 10) * 10));
  }, [data?.maxPrice, hasExplicitMax]);
  const total = Number(data?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / 12));
  const start = total === 0 ? 0 : (page - 1) * 12 + 1;
  const end = Math.min(page * 12, total);
  const hasFilters = Boolean(q.trim()) || category !== "all" || sort !== "featured" || inStock || minRating > 0 || priceCap < maxPrice;

  const clear = () => {
    setQ("");
    setCategory("all");
    setSort("featured");
    setInStock(false);
    setMinRating(0);
    setPriceCap(maxPrice);
    setPage(1);
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
        filtered={!loading ? total : 0}
        total={Number(data?.total || 0)}
        searching={Boolean(dq.trim())}
        onClear={clear}
        hasFilters={hasFilters}
      />

      {loading ? (
        <SkelGrid n={8} />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={retry} />
      ) : products.length === 0 ? (
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
            {products.map((product) => (
              <ProductCard key={product.id} p={product} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} setPage={changePage} start={start} end={end} total={total} noun="products" />
        </>
      )}
    </div>
  );
}
