import { writeFileSync, mkdirSync } from "node:fs";
import { seedData } from "../src/data/seedData.js";

const SITE_URL = (process.env.SITE_URL || "https://www.fikarnot.shop").replace(/\/$/, "");
const SITEMAP_API_URL = String(process.env.SITEMAP_API_URL || "").trim().replace(/\/$/, "");
const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const buildUrls = ({ products, categories }) => {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { loc: "/", priority: "1.0", lastmod: today },
    { loc: "/products", priority: "0.9", lastmod: today },
    ...categories.map((c) => ({ loc: `/products?cat=${encodeURIComponent(c.id)}`, priority: "0.7", lastmod: today })),
    ...products.map((p) => ({
      loc: `/product/${encodeURIComponent(p.id)}`,
      priority: "0.8",
      lastmod: new Date(p.updatedAt || Date.now()).toISOString().slice(0, 10),
    })),
  ];
};

const toXml = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${xmlEscape(`${SITE_URL}${u.loc}`)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const isProduction = process.env.NODE_ENV === "production";

const loadCatalog = async () => {
  if (!SITEMAP_API_URL) {
    // Same reasoning as scripts/prerender-seo.js: a production build with no
    // SITEMAP_API_URL would otherwise silently write a sitemap.xml built from the
    // 8 hardcoded demo products, with nothing failing. Fail loudly instead.
    //
    // Note: server/index.js also serves a live, DB-backed /sitemap.xml route.
    // If your host proxies /sitemap.xml to the API server, you don't need this
    // static file at all — see README "Production deployment notes".
    if (isProduction) {
      throw new Error(
        "SITEMAP_API_URL is not set. Refusing to generate sitemap.xml from seed/demo " +
          "data in a production build. Set SITEMAP_API_URL to the live API origin, or " +
          "route /sitemap.xml to the API server's live route instead of using this file.",
      );
    }
    return seedData();
  }
  const first = await fetch(`${SITEMAP_API_URL}/api/catalog?limit=100&offset=0`);
  if (!first.ok) throw new Error(`Sitemap API returned ${first.status}`);
  const payload = await first.json();
  const products = [...(payload.products || [])];
  const total = Number(payload.total || products.length);
  for (let offset = products.length; offset < total; offset += 100) {
    const response = await fetch(`${SITEMAP_API_URL}/api/catalog?limit=100&offset=${offset}`);
    if (!response.ok) throw new Error(`Sitemap API returned ${response.status}`);
    const page = await response.json();
    products.push(...(page.products || []));
  }
  return { products, categories: payload.categories || [] };
};

const outPath = new URL("../dist/sitemap.xml", import.meta.url);
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
try {
  const catalog = await loadCatalog();
  const urls = buildUrls(catalog);
  writeFileSync(outPath, toXml(urls));
  console.log(`sitemap.xml written from ${SITEMAP_API_URL ? "live API" : "seed data"} with ${urls.length} URLs`);
} catch (error) {
  if (isProduction) throw error;
  const catalog = seedData();
  const urls = buildUrls(catalog);
  writeFileSync(outPath, toXml(urls));
  console.warn(`Live sitemap generation failed (${error.message}); wrote development fallback with ${urls.length} URLs.`);
}
