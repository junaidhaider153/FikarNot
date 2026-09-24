import { supabase } from "../lib/supabaseClient";

const FUNCTIONS_BASE = `${(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Every api/*.js module in this project was written against the old
 * Express-style server (e.g. request("/api/catalog/products")). Rather than
 * rewrite all 14 of those files, this table maps each old path onto the
 * Supabase Edge Function (+ new path) that now serves it. The rest of the
 * codebase — components, pages, everything that imports { catalogApi },
 * { ordersApi}, etc. — does not need to change.
 *
 * Each entry: [regex matching the OLD path, edge function name, function
 * that turns the regex match into the NEW path on that function].
 * Order matters — more specific patterns must come before general ones.
 */
const ROUTES = [
  // ---- catalog ------------------------------------------------------------
  [/^\/api\/catalog\/products\/(.+)$/, "catalog", (m) => `/products/${m[1]}`],
  [/^\/api\/catalog\/products$/, "catalog", () => "/products"],
  [/^\/api\/catalog\/categories\/(.+)$/, "catalog", (m) => `/categories/${m[1]}`],
  [/^\/api\/catalog\/categories$/, "catalog", () => "/categories"],
  [/^\/api\/catalog\/inventory\/adjust$/, "catalog", () => "/inventory/adjust"],
  [/^\/api\/catalog(\?.*)?$/, "catalog", (m) => `/${m[1] || ""}`],

  // ---- account + users (account Edge Function) -----------------------------
  [/^\/api\/auth\/me$/, "account", () => "/"],
  [/^\/api\/auth\/delete-account$/, "account", () => "/delete-account"],
  [/^\/api\/account\/profile$/, "account", () => "/profile"],
  [/^\/api\/account\/state$/, "account", () => "/state"],
  [/^\/api\/account\/addresses\/(.+)$/, "account", (m) => `/addresses/${m[1]}`],
  [/^\/api\/account\/addresses$/, "account", () => "/addresses"],
  [/^\/api\/users\/(.+)\/role$/, "account", (m) => `/users/${m[1]}/role`],
  [/^\/api\/users\/(.+)$/, "account", (m) => `/users/${m[1]}`],
  [/^\/api\/users$/, "account", () => "/users"],

  // ---- storage (uploads + payment proofs) — checked BEFORE orders ----------
  [/^\/api\/uploads\/image$/, "storage", () => "/image"],
  [/^\/api\/media\/(.+)$/, "storage", (m) => `/media/${m[1]}`],
  [/^\/api\/media$/, "storage", () => "/media"],
  [/^\/api\/orders\/(.+)\/payment-proof$/, "storage", (m) => `/payment-proof/${m[1]}`],
  [/^\/api\/admin\/orders\/(.+)\/payment-proof$/, "storage", (m) => `/payment-proof/${m[1]}`],
  [/^\/api\/admin\/orders\/(.+)\/confirm-payment$/, "storage", (m) => `/confirm-payment/${m[1]}`],

  // ---- orders + coupons -----------------------------------------------------
  [/^\/api\/commerce-settings$/, "orders", () => "/commerce-settings"],
  [/^\/api\/coupons\/validate$/, "orders", () => "/coupons/validate"],
  [/^\/api\/coupons\/(.+)$/, "orders", (m) => `/coupons/${m[1]}`],
  [/^\/api\/coupons$/, "orders", () => "/coupons"],
  [/^\/api\/admin\/orders\/(.+)\/fulfilment$/, "orders", (m) => `/${m[1]}/fulfilment`],
  [/^\/api\/orders\/(.+)\/cancel$/, "orders", (m) => `/${m[1]}/cancel`],
  [/^\/api\/orders\/(.+)\/status$/, "orders", (m) => `/${m[1]}/status`],
  [/^\/api\/orders\/(.+)$/, "orders", (m) => `/${m[1]}`],
  [/^\/api\/orders$/, "orders", () => "/"],

  // ---- admin domain (reviews, support, returns, notifications, settings) ---
  [/^\/api\/reviews\/(.+)\/status$/, "admin", (m) => `/reviews/${m[1]}/status`],
  [/^\/api\/reviews\/(.+)$/, "admin", (m) => `/reviews/${m[1]}`],
  [/^\/api\/reviews$/, "admin", () => "/reviews"],
  [/^\/api\/support\/(.+)\/status$/, "admin", (m) => `/support/${m[1]}/status`],
  [/^\/api\/support\/(.+)$/, "admin", (m) => `/support/${m[1]}`],
  [/^\/api\/support$/, "admin", () => "/support"],
  [/^\/api\/admin\/returns\/(.+)\/refund$/, "admin", (m) => `/returns/${m[1]}/refund`],
  [/^\/api\/returns\/(.+)\/status$/, "admin", (m) => `/returns/${m[1]}/status`],
  [/^\/api\/returns$/, "admin", () => "/returns"],
  [/^\/api\/notifications\/(.+)\/read$/, "admin", (m) => `/notifications/${m[1]}/read`],
  [/^\/api\/notifications\/read-all$/, "admin", () => "/notifications/read-all"],
  [/^\/api\/notifications$/, "admin", () => "/notifications"],
  [/^\/api\/site-settings$/, "admin", () => "/site-settings"],
  [/^\/api\/audit-logs(\?.*)?$/, "admin", (m) => `/audit-logs${m[1] || ""}`],
  [/^\/api\/engagement$/, "admin", () => "/engagement"],
];

// Old routes that were either one-time migration tools (not needed — we
// already migrated your data directly) or features not built yet. Calling
// these throws a clear error instead of a confusing 404.
const KNOWN_UNSUPPORTED = {
  "/api/catalog/migrate": "One-time data migration tool — no longer needed, your data is already in Supabase.",
  "/api/orders/migrate": "One-time data migration tool — no longer needed, your data is already in Supabase.",
  "/api/engagement/migrate": "One-time data migration tool — no longer needed, your data is already in Supabase.",
  "/api/media/cleanup": "Bulk media cleanup hasn't been ported yet.",
  "/api/uploads/video": "Video upload hasn't been ported yet (only images are supported so far).",
  "/api/chat": "The AI chat assistant hasn't been ported yet.",
  "/api/payments/payfast/session": "Online/card payments (PayFast) aren't wired up yet — only COD and manual transfer work right now.",
};

function resolveRoute(path) {
  const [bare] = path.split("?");
  if (KNOWN_UNSUPPORTED[bare]) {
    throw Object.assign(new Error(KNOWN_UNSUPPORTED[bare]), { code: "NOT_YET_MIGRATED", status: 501 });
  }
  for (const [regex, fn, toPath] of ROUTES) {
    const match = path.match(regex);
    if (match) return { fn, newPath: toPath(match) };
  }
  throw Object.assign(new Error(`No route mapping for "${path}" — this endpoint hasn't been ported to Supabase yet.`), {
    code: "NOT_YET_MIGRATED",
    status: 501,
  });
}

/**
 * Shared request helper for every API module (unchanged signature from the
 * old apiClient — callers don't need to change).
 * - Attaches the current Supabase session's access token as a Bearer header.
 * - Routes the old /api/... path to the matching Edge Function.
 */
export async function apiRequest(path, options = {}, defaultErrorMessage = "Request failed") {
  const { fn, newPath } = resolveRoute(path);
  const method = (options.method || "GET").toUpperCase();

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${FUNCTIONS_BASE}/${fn}${newPath}`, {
    ...options,
    method,
    headers,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // no JSON body — fine for 204s etc.
  }

  if (!response.ok) {
    const error = new Error(payload.message || defaultErrorMessage);
    error.code = payload.error || "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}
