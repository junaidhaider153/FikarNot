// FikarNot catalog Edge Function.
// Ported from server/index.js: GET /api/catalog, POST /api/catalog/products,
// DELETE /api/catalog/products/:id, POST /api/catalog/categories,
// DELETE /api/catalog/categories/:id, POST /api/catalog/inventory/adjust.
//
// Deployed with verify_jwt=false because catalog browsing (GET /) is public —
// auth is checked manually per-route below instead, same as the old
// requireUser()/role checks in server/index.js.
//
// Env vars (set automatically by Supabase for every Edge Function):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env var you set yourself (Project Settings -> Edge Functions -> Secrets):
//   FIKARNOT_FRONTEND_ORIGIN  e.g. "https://fikarnot.shop,http://localhost:5173"

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ORIGINS = (Deno.env.get("FIKARNOT_FRONTEND_ORIGIN") || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

type Profile = { id: string; name: string; role: string };

// Resolves the caller from the Authorization header. Returns null for
// anonymous requests — catalog browsing doesn't require auth.
async function getCallerProfile(req: Request): Promise<Profile | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, name, role")
    .eq("id", userData.user.id)
    .maybeSingle();
  return profile ? (profile as Profile) : null;
}

const isStaff = (profile: Profile | null) => !!profile && ["admin", "editor"].includes(profile.role);

// deno-lint-ignore no-explicit-any
const toCatalogRow = (row: any) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  categoryId: row.category_id,
  price: Number(row.price),
  stock: Number(row.stock),
  stockThreshold: Number(row.stock_threshold),
  rating: Number(row.rating),
  image: row.image,
  images: row.images_json ?? [],
  tags: row.tags_json ?? [],
  featured: Boolean(row.featured),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  description: row.description,
});

// deno-lint-ignore no-explicit-any
const toCategoryRow = (row: any) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SORT_MAP: Record<string, { column: string; ascending: boolean }[]> = {
  featured: [
    { column: "featured", ascending: false },
    { column: "rating", ascending: false },
    { column: "created_at", ascending: false },
  ],
  newest: [{ column: "created_at", ascending: false }],
  rating: [{ column: "rating", ascending: false }, { column: "created_at", ascending: false }],
  "price-asc": [{ column: "price", ascending: true }, { column: "created_at", ascending: false }],
  "price-desc": [{ column: "price", ascending: false }, { column: "created_at", ascending: false }],
  name: [{ column: "name", ascending: true }, { column: "created_at", ascending: false }],
};

function parseCatalogQuery(url: URL) {
  const hasCatalogQuery = ["q", "category", "stock", "rating", "maxPrice", "sort", "limit", "offset"].some((k) =>
    url.searchParams.has(k)
  );
  const defaultLimit = hasCatalogQuery ? 24 : 2000;
  const maxLimit = hasCatalogQuery ? 100 : 5000;
  const rawLimit = Number(url.searchParams.get("limit"));
  const rawOffset = Number(url.searchParams.get("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(maxLimit, Math.floor(rawLimit)) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
  const category = String(url.searchParams.get("category") || "").trim();
  const inStock = url.searchParams.get("stock") === "1";
  const ratingValue = Number(url.searchParams.get("rating"));
  const minRating = Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0;
  const maxPriceParam = url.searchParams.get("maxPrice");
  const maxPriceValue = Number(maxPriceParam);
  const maxPrice = maxPriceParam !== null && Number.isFinite(maxPriceValue) && maxPriceValue >= 0
    ? Math.min(1_000_000, maxPriceValue)
    : null;
  const sort = SORT_MAP[url.searchParams.get("sort") || ""] ? url.searchParams.get("sort")! : "featured";
  return { limit, offset, q, category, inStock, minRating, maxPrice, sort };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  // Supabase may route the request in as either /functions/v1/catalog(/...)
  // or bare /catalog(/...) depending on how it's invoked — strip whichever
  // prefix is present so the routes below match by suffix either way.
  const path = url.pathname.replace(/^\/(functions\/v1\/)?catalog/, "") || "/";

  try {
    // ---- GET /  (public catalog listing) ---------------------------------
    if (req.method === "GET" && path === "/") {
      const query = parseCatalogQuery(url);

      let productsQuery = admin.from("products").select("*", { count: "exact" });
      if (query.q) {
        const pattern = `%${query.q}%`;
        productsQuery = productsQuery.or(
          `name.ilike.${pattern},description.ilike.${pattern},sku.ilike.${pattern}`,
        );
      }
      if (query.category && query.category !== "all") productsQuery = productsQuery.eq("category_id", query.category);
      if (query.inStock) productsQuery = productsQuery.gt("stock", 0);
      if (query.minRating > 0) productsQuery = productsQuery.gte("rating", query.minRating);
      if (query.maxPrice !== null) productsQuery = productsQuery.lte("price", query.maxPrice);
      for (const { column, ascending } of SORT_MAP[query.sort]) productsQuery = productsQuery.order(column, { ascending });
      productsQuery = productsQuery.range(query.offset, query.offset + query.limit - 1);

      const [productsResult, categoriesResult, maxPriceResult] = await Promise.all([
        productsQuery,
        admin.from("categories").select("*").order("name"),
        admin.from("products").select("price").order("price", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (productsResult.error) throw productsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const profile = await getCallerProfile(req);
      let inventoryLog: unknown[] = [];
      if (isStaff(profile)) {
        const { data: logs } = await admin
          .from("inventory_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        // deno-lint-ignore no-explicit-any
        inventoryLog = (logs || []).map((r: any) => ({
          id: r.id,
          productId: r.product_id,
          productName: r.product_name,
          previousStock: r.previous_stock,
          nextStock: r.next_stock,
          change: r.change,
          reason: r.reason,
          userId: r.user_id,
          createdAt: r.created_at,
        }));
      }
      const { data: migratedMeta } = await admin.from("catalog_meta").select("value").eq("key", "migrated").maybeSingle();

      return json(req, {
        categories: (categoriesResult.data || []).map(toCategoryRow),
        products: (productsResult.data || []).map(toCatalogRow),
        inventoryLog,
        migrated: migratedMeta?.value === true || migratedMeta?.value === "1",
        total: productsResult.count ?? 0,
        limit: query.limit,
        offset: query.offset,
        maxPrice: Number(maxPriceResult.data?.price ?? 0),
        query,
      });
    }

    // Everything below is staff-only (admin/editor), same as the old
    // requireUser() + role check in server/index.js.
    if (req.method === "POST" || req.method === "DELETE") {
      const profile = await getCallerProfile(req);
      if (!profile) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);
      if (!isStaff(profile)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);

      // ---- POST /products ---------------------------------------------
      if (req.method === "POST" && path === "/products") {
        const body = await req.json().catch(() => ({}));
        const p = body.product || body;
        try {
          const sku = String(p.sku || "").trim().toUpperCase();
          if (!sku) throw Object.assign(new Error("SKU is required"), { code: "INVALID_PRODUCT" });
          const name = String(p.name || "").trim();
          if (name.length < 2 || name.length > 160) {
            throw Object.assign(new Error("Product name must be between 2 and 160 characters."), { code: "INVALID_PRODUCT" });
          }
          const categoryId = String(p.categoryId || "").trim();
          const { data: categoryRow } = await admin.from("categories").select("id").eq("id", categoryId).maybeSingle();
          if (!categoryId || !categoryRow) {
            throw Object.assign(new Error("A valid product category is required."), { code: "INVALID_CATEGORY" });
          }
          const price = Number(p.price);
          if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
            throw Object.assign(new Error("Product price is invalid."), { code: "INVALID_PRICE" });
          }
          const stock = Number(p.stock);
          if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
            throw Object.assign(new Error("Product stock is invalid."), { code: "INVALID_STOCK" });
          }
          const stockThreshold = Number(p.stockThreshold ?? 10);
          if (!Number.isFinite(stockThreshold) || stockThreshold < 0 || !Number.isInteger(stockThreshold)) {
            throw Object.assign(new Error("Stock threshold is invalid."), { code: "INVALID_STOCK_THRESHOLD" });
          }

          let dupQuery = admin.from("products").select("id").ilike("sku", sku);
          if (p.id) dupQuery = dupQuery.neq("id", p.id);
          const { data: dup } = await dupQuery.maybeSingle();
          if (dup) throw Object.assign(new Error("SKU is already in use."), { code: "DUPLICATE_SKU" });

          const id = p.id || `prod-${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          const row: Record<string, unknown> = {
            id,
            name,
            sku,
            category_id: categoryId,
            price,
            stock,
            stock_threshold: stockThreshold,
            rating: Math.max(0, Math.min(5, Number(p.rating) || 0)),
            image: String(p.image || ""),
            images_json: Array.isArray(p.images) && p.images.length ? p.images : [String(p.image || "")],
            tags_json: Array.isArray(p.tags) ? p.tags : [],
            featured: Boolean(p.featured),
            description: String(p.description || ""),
            updated_at: now,
          };
          if (!p.id) row.created_at = now;

          const { data: saved, error: upsertError } = await admin
            .from("products")
            .upsert(row, { onConflict: "id" })
            .select()
            .single();
          if (upsertError) throw upsertError;

          await admin.from("audit_logs").insert({
            id: `audit-${crypto.randomUUID()}`,
            actor_user_id: profile.id,
            action: p.id ? "product.update" : "product.create",
            entity_type: "product",
            entity_id: saved.id,
            details_json: { sku: saved.sku },
          });

          return json(req, { product: toCatalogRow(saved) });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          return json(req, { error: err.code || "INVALID_PRODUCT", message: err.message }, err.code === "DUPLICATE_SKU" ? 409 : 400);
        }
      }

      // ---- DELETE /products/:id -----------------------------------------
      if (req.method === "DELETE" && path.startsWith("/products/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { count } = await admin.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", id);
        if ((count || 0) > 0) {
          return json(req, {
            error: "PRODUCT_HAS_ORDER_HISTORY",
            message: "This product has order history and cannot be deleted. Set its stock to 0 or hide it instead.",
          }, 409);
        }
        await admin.from("products").delete().eq("id", id);
        return json(req, { ok: true });
      }

      // ---- POST /categories -----------------------------------------------
      if (req.method === "POST" && path === "/categories") {
        const body = await req.json().catch(() => ({}));
        const c = body.category || body;
        const now = new Date().toISOString();
        const id = c.id || `cat-${crypto.randomUUID()}`;
        const { data: saved, error } = await admin
          .from("categories")
          .upsert(
            {
              id,
              name: String(c.name || "").trim(),
              description: String(c.description || ""),
              color: c.color || "#3E8E5A",
              updated_at: now,
              ...(c.id ? {} : { created_at: now }),
            },
            { onConflict: "id" },
          )
          .select()
          .single();
        if (error) throw error;
        return json(req, { category: toCategoryRow(saved) });
      }

      // ---- DELETE /categories/:id -----------------------------------------
      if (req.method === "DELETE" && path.startsWith("/categories/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { count } = await admin.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
        if ((count || 0) > 0) return json(req, { error: "CATEGORY_IN_USE", message: "Reassign or delete its products first." }, 409);
        await admin.from("categories").delete().eq("id", id);
        return json(req, { ok: true });
      }

      // ---- POST /inventory/adjust -------------------------------------------
      if (req.method === "POST" && path === "/inventory/adjust") {
        const body = await req.json().catch(() => ({}));
        const { data: product } = await admin.from("products").select("*").eq("id", body.productId).maybeSingle();
        if (!product) return json(req, { error: "PRODUCT_NOT_FOUND", message: "Product not found." }, 404);
        const next = Math.max(0, Math.floor(Number(body.nextStock)));
        if (!Number.isFinite(next)) return json(req, { error: "INVALID_STOCK", message: "Invalid stock value." }, 400);
        const now = new Date().toISOString();
        await admin.from("products").update({ stock: next, updated_at: now }).eq("id", body.productId);

        const log = {
          id: `inv-${crypto.randomUUID()}`,
          product_id: product.id,
          product_name: product.name,
          previous_stock: product.stock,
          next_stock: next,
          change: next - product.stock,
          reason: String(body.reason || "Manual stock adjustment"),
          user_id: profile.id,
          created_at: now,
        };
        await admin.from("inventory_logs").insert(log);
        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: profile.id,
          action: "inventory.adjust",
          entity_type: "product",
          entity_id: product.id,
          details_json: { previousStock: product.stock, nextStock: next, change: log.change, reason: log.reason },
        });

        const { data: updated } = await admin.from("products").select("*").eq("id", body.productId).single();
        return json(req, {
          product: toCatalogRow(updated),
          log: {
            id: log.id,
            productId: log.product_id,
            productName: log.product_name,
            previousStock: log.previous_stock,
            nextStock: log.next_stock,
            change: log.change,
            reason: log.reason,
            userId: log.user_id,
            createdAt: log.created_at,
          },
        });
      }
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "SERVER_ERROR", message: (error as Error).message || "Internal server error." }, 500);
  }
});
