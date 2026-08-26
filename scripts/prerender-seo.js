import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedData } from "../src/data/seedData.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_INDEX = join(__dirname, "..", "dist", "index.html");
const SITE_URL = (process.env.SITE_URL || "https://www.fikarnot.shop").replace(/\/$/, "");
const SITEMAP_API_URL = String(process.env.SITEMAP_API_URL || "").trim().replace(/\/$/, "");
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonEsc = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

const isProduction = process.env.NODE_ENV === "production";

const loadCatalog = async () => {
  if (!SITEMAP_API_URL) {
    // A production build with no SITEMAP_API_URL would otherwise prerender the
    // 8 hardcoded demo products with no error — indistinguishable from a real,
    // deliberate local/dev run. Fail loudly instead of shipping the wrong SEO data.
    if (isProduction) {
      throw new Error(
        "SITEMAP_API_URL is not set. Refusing to prerender SEO pages from seed/demo " +
          "data in a production build. Set SITEMAP_API_URL to the live API origin, or " +
          "run with NODE_ENV unset/development if this is intentionally a local build.",
      );
    }
    return seedData();
  }
  const first = await fetch(`${SITEMAP_API_URL}/api/catalog?limit=100&offset=0`);
  if (!first.ok) throw new Error(`SEO catalog API returned ${first.status}`);
  const payload = await first.json();
  const products = [...(payload.products || [])];
  const total = Number(payload.total || products.length);
  for (let offset = products.length; offset < total; offset += 100) {
    const response = await fetch(`${SITEMAP_API_URL}/api/catalog?limit=100&offset=${offset}`);
    if (!response.ok) throw new Error(`SEO catalog API returned ${response.status}`);
    const page = await response.json();
    products.push(...(page.products || []));
  }
  return { products, categories: payload.categories || [] };
};


const renderProductHtml = (baseHtml, product, category) => {
  const title = `${product.name} — FikarNot`;
  const description = String(product.description || `Shop ${product.name} at FikarNot.`).slice(0, 155);
  const url = `${SITE_URL}/product/${encodeURIComponent(product.id)}`;
  const image = product.image || `${SITE_URL}/favicon.svg`;
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    sku: product.sku,
    image: [image],
    category: category?.name,
    aggregateRating: Number(product.rating) > 0 ? { "@type": "AggregateRating", ratingValue: Number(product.rating), bestRating: 5, ratingCount: 1 } : undefined,
    offers: { "@type": "Offer", url, priceCurrency: "USD", price: Number(product.price).toFixed(2), availability: Number(product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/products` },
      ...(category ? [{ "@type": "ListItem", position: 3, name: category.name, item: `${SITE_URL}/products?cat=${encodeURIComponent(category.id)}` }, { "@type": "ListItem", position: 4, name: product.name, item: url }] : [{ "@type": "ListItem", position: 3, name: product.name, item: url }]),
    ],
  };

  let html = baseHtml;
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<meta name="robots"[^>]*>/i, `<meta name="robots" content="index, follow" />`);
  html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(url)}" />`);
  html = html.replace(/<meta property="og:type"[^>]*>/i, `<meta property="og:type" content="product" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(title)}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(description)}" />`);
  html = html.replace('</head>', `  <script type="application/ld+json" data-prerender="product">${jsonEsc(productLd)}</script>\n  <script type="application/ld+json" data-prerender="breadcrumb">${jsonEsc(breadcrumbLd)}</script>\n</head>`);
  return html;
};

const main = async () => {
  const baseHtml = readFileSync(DIST_INDEX, "utf8");
  const { products, categories } = await loadCatalog();
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  for (const product of products) {
    const outDir = join(__dirname, "..", "dist", "product", String(product.id));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), renderProductHtml(baseHtml, product, categoryById.get(product.categoryId)));
  }
  console.log(`prerendered ${products.length} product SEO pages from ${SITEMAP_API_URL ? "live API" : "seed data"}`);
};

try {
  await main();
} catch (error) {
  if (isProduction) throw error;
  console.warn(`SEO prerender skipped: ${error.message}`);
}
