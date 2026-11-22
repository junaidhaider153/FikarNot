// Loads the live catalogue for build-time SEO output (sitemap + prerender) from
// the Supabase `catalog` Edge Function. Returns null when no backend is configured.
//
// Env: SITEMAP_API_URL  — optional override of the catalog endpoint
//      VITE_SUPABASE_URL (+ VITE_SUPABASE_ANON_KEY) — default source
export const catalogEndpoint = () => {
  const explicit = String(process.env.SITEMAP_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;
  const supabase = String(process.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  return supabase ? `${supabase}/functions/v1/catalog` : "";
};

export async function loadLiveCatalog() {
  const endpoint = catalogEndpoint();
  if (!endpoint) return null;
  const headers = { Accept: "application/json" };
  const key = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (key) headers.apikey = key;

  const get = async (offset) => {
    const response = await fetch(`${endpoint}?limit=100&offset=${offset}`, { headers });
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`Catalog API returned an invalid response (${response.status})`);
    }
    return response.json();
  };

  const first = await get(0);
  const products = [...(first.products || [])];
  const total = Number(first.total || products.length);
  for (let offset = products.length; offset < total; offset += 100) {
    const page = await get(offset);
    if (!page.products?.length) break;
    products.push(...page.products);
  }
  return { products, categories: first.categories || [] };
}
