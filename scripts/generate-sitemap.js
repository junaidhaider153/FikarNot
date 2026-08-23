// Generates dist/sitemap.xml from the current product/category catalog.
// Runs automatically after `npm run build` (see package.json "postbuild").
//
// NOTE: this reads from the static demo seed data. Once products live in a
// real database (see the Supabase migration), swap the `seedData()` call
// below for a real fetch against that database instead.
import { writeFileSync } from "node:fs";
import { seedData } from "../src/data/seedData.js";

const SITE_URL = process.env.SITE_URL || "https://www.fikarnot.shop";

const { products, categories } = seedData();
const today = new Date().toISOString().slice(0, 10);

const staticUrls = [
  { loc: "/", priority: "1.0" },
  { loc: "/products", priority: "0.9" },
  ...categories.map((c) => ({ loc: `/products?cat=${c.id}`, priority: "0.7" })),
];

const productUrls = products.map((p) => ({ loc: `/product/${p.id}`, priority: "0.8" }));

const urls = [...staticUrls, ...productUrls];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

writeFileSync(new URL("../dist/sitemap.xml", import.meta.url), xml);
console.log(`sitemap.xml written with ${urls.length} URLs`);
