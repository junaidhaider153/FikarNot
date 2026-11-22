import { writeFileSync, mkdirSync } from "node:fs";
import { seedData } from "../src/data/seedData.js";
import { catalogEndpoint, loadLiveCatalog } from "./catalog-source.js";

const SITE_URL = (process.env.SITE_URL || "https://fikarnot.shop").replace(/\/$/, "");
const xmlEscape = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

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

const loadCatalog = async () => {
  const live = await loadLiveCatalog();
  if (live) return live;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VITE_SUPABASE_URL (or SITEMAP_API_URL) is required in production builds — refusing to write demo/seed sitemap output.",
    );
  }
  return seedData();
};

const outPath = new URL("../dist/sitemap.xml", import.meta.url);
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });

try {
  const catalog = await loadCatalog();
  const urls = buildUrls(catalog);
  writeFileSync(outPath, toXml(urls));
  console.log(`sitemap.xml written from ${catalogEndpoint() ? "live API" : "seed data"} with ${urls.length} URLs`);
} catch (error) {
  if (process.env.NODE_ENV === "production") {
    console.error(`Sitemap generation failed in production: ${error.message}`);
    process.exit(1);
  }
  const catalog = seedData();
  const urls = buildUrls(catalog);
  writeFileSync(outPath, toXml(urls));
  console.warn(`Live sitemap generation failed (${error.message}); wrote local fallback with ${urls.length} URLs.`);
}
