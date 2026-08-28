import { writeFileSync, mkdirSync } from "node:fs";
import { seedData } from "../src/data/seedData.js";

const SITE_URL = (process.env.SITE_URL || "https://fikarnot.shop").replace(/\/$/, "");
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
<urlset xmlns="http://sitemaps.org">
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

const loadCatalog = async () => {
  if (!SITEMAP_API_URL) return seedData();
  
  const first = await fetch(`${SITEMAP_API_URL}/api/catalog?limit=100&offset=0`);
  if (!first.ok || first.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Sitemap API returned invalid response (${first.status})`);
  }
  
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
  const catalog = seedData();
  const urls = buildUrls(catalog);
  writeFileSync(outPath, toXml(urls));
  console.warn(`Live sitemap generation failed (${error.message}); wrote production fallback with ${urls.length} URLs.`);
}
