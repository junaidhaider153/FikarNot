// FikarNot admin Edge Function.
// Ported from server/index.js:
//   GET  /api/reviews                       -> GET  /reviews            (public, published only)
//   POST /api/reviews                       -> POST /reviews            (customer, must have purchased)
//   POST /api/reviews/:id/status (staff)      -> POST /reviews/:id/status
//   DELETE /api/reviews/:id                   -> DELETE /reviews/:id      (owner or staff)
//   POST /api/support                         -> POST /support            (public — creates a ticket)
//   POST /api/support/:id/status (staff)        -> POST /support/:id/status
//   DELETE /api/support/:id (staff)              -> DELETE /support/:id
//   POST /api/returns                          -> POST /returns           (customer)
//   POST /api/returns/:id/status (staff)          -> POST /returns/:id/status
//   POST /api/admin/returns/:id/refund (staff)      -> POST /returns/:id/refund
//   GET  /api/notifications                    -> GET  /notifications      (own)
//   POST /api/notifications/:id/read              -> POST /notifications/:id/read
//   POST /api/notifications/read-all               -> POST /notifications/read-all
//   DELETE /api/notifications                        -> DELETE /notifications
//   GET  /api/site-settings                     -> GET  /site-settings      (public)
//   PATCH /api/site-settings (staff)              -> PATCH /site-settings
//   GET  /api/audit-logs (admin only)             -> GET  /audit-logs
//   GET  /api/engagement                        -> GET  /engagement         (own, or all if staff)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const ALLOWED_ORIGINS = (Deno.env.get("FIKARNOT_FRONTEND_ORIGIN") || "http://localhost:5173")
  .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });
}

type Caller = { id: string; role: string; name: string } | null;
async function getCaller(req: Request): Promise<Caller> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: profile } = await admin.from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();
  if (!profile) return null;
  return { id: userData.user.id, role: profile.role, name: profile.name };
}
const isStaff = (c: Caller) => !!c && ["admin", "editor"].includes(c.role);

// deno-lint-ignore no-explicit-any
const reviewRow = (row: any) => ({
  id: row.id, productId: row.product_id, userId: row.user_id, authorName: row.author_name, rating: Number(row.rating),
  title: row.title, body: row.body, status: row.status, verifiedPurchase: Boolean(row.verified_purchase), createdAt: row.created_at, updatedAt: row.updated_at,
});
// deno-lint-ignore no-explicit-any
const supportRow = (row: any) => ({
  id: row.id, userId: row.user_id, name: row.name, email: row.email, subject: row.subject, message: row.message,
  category: row.category, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
});
// deno-lint-ignore no-explicit-any
const returnRow = (row: any) => ({
  id: row.id, orderId: row.order_id, userId: row.user_id, reason: row.reason, note: row.note, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at,
  refund: row.refund ? { id: row.refund.id, amount: Number(row.refund.amount), currency: row.refund.currency, status: row.refund.status, providerRef: row.refund.provider_ref, method: row.refund.method, note: row.refund.note } : null,
});
// deno-lint-ignore no-explicit-any
const notificationRow = (row: any) => ({ id: row.id, type: row.type, title: row.title, message: row.message, link: row.link, orderId: row.order_id, read: Boolean(row.read), createdAt: row.created_at });
// deno-lint-ignore no-explicit-any
const catalogRow = (row: any) => ({
  id: row.id, name: row.name, sku: row.sku, categoryId: row.category_id, price: Number(row.price), stock: Number(row.stock),
  stockThreshold: Number(row.stock_threshold), rating: Number(row.rating), image: row.image, images: row.images_json ?? [],
  tags: row.tags_json ?? [], featured: Boolean(row.featured), createdAt: row.created_at, updatedAt: row.updated_at, description: row.description,
});

async function createNotification(userId: string | null, opts: { type: string; title: string; message: string; link?: string; orderId?: string | null }) {
  if (!userId) return;
  await admin.from("notifications").insert({ id: `n-${crypto.randomUUID()}`, user_id: userId, type: opts.type, title: opts.title, message: opts.message, link: opts.link || "/account", order_id: opts.orderId || null, read: false });
}

async function nextTicketNumber() {
  const { data } = await admin.from("support_tickets").select("id").ilike("id", "TKT-%");
  let max = 0;
  for (const row of data || []) { const n = Number(String(row.id).replace(/^TKT-/, "")); if (Number.isFinite(n) && n > max) max = n; }
  return `TKT-${String(max + 1).padStart(4, "0")}`;
}

async function withRefund(returnRows: any[]) {
  const ids = returnRows.map((r) => r.id);
  if (!ids.length) return returnRows.map((r) => ({ ...r, refund: null }));
  const { data: refunds } = await admin.from("refunds").select("*").in("return_id", ids);
  const byReturn = new Map((refunds || []).map((r) => [r.return_id, r]));
  return returnRows.map((r) => ({ ...r, refund: byReturn.get(r.id) || null }));
}

const DEFAULT_SITE_SETTINGS_KEYS = new Set([
  "storeName","supportEmail","heroKicker","heroEyebrow","heroTitle","heroHighlight","heroSubtitle","heroSticker","heroImage","heroImages",
  "heroVideo","heroVideoWebm","logoUrl","navLinks","announcement","aboutTitle","aboutIntro","aboutBody","whatsappNumber","instagramUrl",
  "facebookUrl","metaTitle","metaDescription","currency","currencyLocale","freeShippingThreshold","shippingFlatRate","taxRate","taxLabel",
  "allowCod","allowOnlinePayments","allowManualPayments","jazzcashNumber","easypaisaNumber","bankName","bankAccountTitle","bankAccountNumber",
  "bankIban","bankInstructions","privacyPolicy","termsOfService","shippingPolicy","returnPolicy",
]);

async function getSiteSettings() {
  const { data } = await admin.from("site_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const row of data || []) out[row.key] = row.value as string;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?admin/, "") || "/";

  try {
    // ---- Site settings (GET public, PATCH staff) ---------------------------
    if (path === "/site-settings") {
      if (req.method === "GET") return json(req, { settings: await getSiteSettings() });
      if (req.method === "PATCH") {
        const caller = await getCaller(req);
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);
        const body = await req.json().catch(() => ({}));
        const entries = Object.entries(body.settings || {}).filter(([key]) => DEFAULT_SITE_SETTINGS_KEYS.has(key));
        for (const [key, value] of entries) {
          await admin.from("site_settings").upsert({ key, value: String(value ?? ""), updated_at: new Date().toISOString(), updated_by: caller!.id }, { onConflict: "key" });
        }
        await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller!.id, action: "site_settings.update", entity_type: "site_settings", details_json: { keys: entries.map(([k]) => k) } });
        return json(req, { settings: await getSiteSettings() });
      }
    }

    // ---- Reviews (partly public) --------------------------------------------
    if (path === "/reviews" || path.startsWith("/reviews/")) {
      if (req.method === "GET" && path === "/reviews") {
        const { data } = await admin.from("reviews").select("*").eq("status", "published").order("created_at", { ascending: false });
        return json(req, { reviews: (data || []).map(reviewRow) });
      }
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

      if (req.method === "POST" && path === "/reviews") {
        const body = await req.json().catch(() => ({}));
        const productId = String(body.productId || "");
        const { data: product } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
        if (!product) return json(req, { error: "PRODUCT_NOT_FOUND", message: "Product not found." }, 404);
        const { data: purchase } = await admin.from("order_items").select("id, orders!inner(user_id)").eq("product_id", productId).eq("orders.user_id", caller.id).limit(1).maybeSingle();
        if (!purchase) return json(req, { error: "PURCHASE_REQUIRED", message: "Only customers who purchased this product can review it." }, 403);
        const rating = Math.round(Number(body.rating));
        const title = String(body.title || "").trim();
        const reviewBody = String(body.body || "").trim();
        if (rating < 1 || rating > 5 || title.length < 3 || reviewBody.length < 10) return json(req, { error: "INVALID_REVIEW", message: "Please provide a rating, a short title, and a review of at least 10 characters." }, 400);
        const { data: existing } = await admin.from("reviews").select("id").eq("product_id", productId).eq("user_id", caller.id).maybeSingle();
        const id = existing?.id || `r-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await admin.from("reviews").upsert({ id, product_id: productId, user_id: caller.id, author_name: caller.name, rating, title, body: reviewBody, status: "published", verified_purchase: true, created_at: now, updated_at: now }, { onConflict: "id" });
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", productId).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin.from("products").update({ rating: Number(avg.toFixed(1)), updated_at: now }).eq("id", productId);
        const { data: savedReview } = await admin.from("reviews").select("*").eq("id", id).single();
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", productId).single();
        return json(req, { review: reviewRow(savedReview), product: catalogRow(updatedProduct) });
      }
      if (req.method === "POST" && /^\/reviews\/[^/]+\/status$/.test(path)) {
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const body = await req.json().catch(() => ({}));
        if (!["published", "hidden"].includes(body.status)) return json(req, { error: "INVALID_STATUS", message: "Invalid review status." }, 400);
        const { data: review } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
        if (!review) return json(req, { error: "REVIEW_NOT_FOUND", message: "Review not found." }, 404);
        const now = new Date().toISOString();
        await admin.from("reviews").update({ status: body.status, updated_at: now }).eq("id", id);
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", review.product_id).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin.from("products").update({ rating: Number(avg.toFixed(1)), updated_at: now }).eq("id", review.product_id);
        const { data: savedReview } = await admin.from("reviews").select("*").eq("id", id).single();
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", review.product_id).single();
        return json(req, { review: reviewRow(savedReview), product: catalogRow(updatedProduct) });
      }
      if (req.method === "DELETE" && path.startsWith("/reviews/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { data: review } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
        if (!review) return json(req, { error: "REVIEW_NOT_FOUND", message: "Review not found." }, 404);
        if (review.user_id !== caller.id && !isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "You cannot remove this review." }, 403);
        await admin.from("reviews").delete().eq("id", id);
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", review.product_id).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin.from("products").update({ rating: Number(avg.toFixed(1)), updated_at: new Date().toISOString() }).eq("id", review.product_id);
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", review.product_id).single();
        return json(req, { ok: true, product: catalogRow(updatedProduct) });
      }
    }

    // ---- Support (POST public, rest staff) ----------------------------------
    if (path === "/support" || path.startsWith("/support/")) {
      if (req.method === "POST" && path === "/support") {
        const caller = await getCaller(req);
        const body = await req.json().catch(() => ({}));
        const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
        const subject = String(body.subject || "").trim(), message = String(body.message || "").trim();
        if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length < 3 || message.length < 10) {
          return json(req, { error: "INVALID_SUPPORT", message: "Please complete all support fields." }, 400);
        }
        const id = await nextTicketNumber();
        const now = new Date().toISOString();
        await admin.from("support_tickets").insert({ id, user_id: caller?.id || null, name, email, subject, message, category: body.category || "general", status: "open", created_at: now, updated_at: now });
        if (caller?.id) await createNotification(caller.id, { type: "support", title: "Support request received", message: `We received your request: ${subject}.`, link: "/help" });
        const { data: saved } = await admin.from("support_tickets").select("*").eq("id", id).single();
        return json(req, { ticket: supportRow(saved) }, 201);
      }
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);

      if (req.method === "POST" && /^\/support\/[^/]+\/status$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[2]);
        const body = await req.json().catch(() => ({}));
        if (!["open", "in_progress", "resolved"].includes(body.status)) return json(req, { error: "INVALID_STATUS", message: "Invalid support status." }, 400);
        const { data: existing } = await admin.from("support_tickets").select("*").eq("id", id).maybeSingle();
        if (!existing) return json(req, { error: "SUPPORT_NOT_FOUND", message: "Support request not found." }, 404);
        await admin.from("support_tickets").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", id);
        if (existing.user_id) {
          const label = body.status === "in_progress" ? "in progress" : body.status;
          await createNotification(existing.user_id, { type: "support", title: `Support request ${label}`, message: `Your support request "${existing.subject}" is now ${label}.`, link: "/help" });
        }
        const { data: saved } = await admin.from("support_tickets").select("*").eq("id", id).single();
        return json(req, { ticket: supportRow(saved) });
      }
      if (req.method === "DELETE" && path.startsWith("/support/")) {
        await admin.from("support_tickets").delete().eq("id", decodeURIComponent(path.split("/").pop() || ""));
        return json(req, { ok: true });
      }
    }

    // ---- Returns / refunds ---------------------------------------------------
    if (path === "/returns" || path.startsWith("/returns/")) {
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

      if (req.method === "POST" && path === "/returns") {
        const body = await req.json().catch(() => ({}));
        const { data: order } = await admin.from("orders").select("*").eq("id", body.orderId).eq("user_id", caller.id).maybeSingle();
        if (!order || order.status !== "delivered") return json(req, { error: "RETURN_NOT_ELIGIBLE", message: "This order is not eligible for a return." }, 409);
        if (Date.now() - new Date(order.created_at).getTime() > 30 * 86400000) return json(req, { error: "RETURN_WINDOW_EXPIRED", message: "The 30-day return window has expired." }, 409);
        const { data: existing } = await admin.from("return_requests").select("id").eq("order_id", order.id).eq("user_id", caller.id).maybeSingle();
        if (existing) return json(req, { error: "RETURN_EXISTS", message: "A return request already exists." }, 409);
        const id = `ret-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await admin.from("return_requests").insert({ id, order_id: order.id, user_id: caller.id, reason: String(body.reason || "Other"), note: String(body.note || ""), status: "requested", created_at: now, updated_at: now });
        await createNotification(caller.id, { type: "return", title: `Return requested for ${order.id}`, message: "Your return request is awaiting review.", orderId: order.id });
        const { data: saved } = await admin.from("return_requests").select("*").eq("id", id).single();
        const [withRef] = await withRefund([saved]);
        return json(req, { request: returnRow(withRef) }, 201);
      }

      if (req.method === "POST" && /^\/returns\/[^/]+\/status$/.test(path)) {
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const body = await req.json().catch(() => ({}));
        const status = String(body.status || "");
        if (!["requested", "approved", "rejected", "completed", "cancelled"].includes(status)) return json(req, { error: "INVALID_STATUS", message: "Invalid return status." }, 400);
        const { data: request } = await admin.from("return_requests").select("*").eq("id", id).maybeSingle();
        if (!request) return json(req, { error: "RETURN_NOT_FOUND", message: "Return request not found." }, 404);
        const { data: order } = await admin.from("orders").select("*").eq("id", request.order_id).single();
        const previous = request.status;
        const now = new Date().toISOString();

        await admin.from("return_requests").update({ status, updated_at: now }).eq("id", id);
        if (status === "approved" && previous !== "approved") await admin.from("orders").update({ status: "return_approved" }).eq("id", order.id);
        if (status === "rejected") await admin.from("orders").update({ status: "delivered" }).eq("id", order.id).eq("status", "return_approved");
        if (status === "completed" && previous !== "completed") {
          await admin.from("orders").update({ status: "returned" }).eq("id", order.id);
          const { data: items } = await admin.from("order_items").select("*, products(stock, name)").eq("order_id", order.id);
          for (const item of items || []) {
            const stock = Number((item as any).products?.stock || 0);
            await admin.from("products").update({ stock: stock + item.qty, updated_at: now }).eq("id", item.product_id);
            await admin.from("inventory_logs").insert({ id: `inv-${crypto.randomUUID()}`, product_id: item.product_id, product_name: item.product_name, previous_stock: stock, next_stock: stock + item.qty, change: item.qty, reason: `Return ${id} completed`, user_id: caller.id, created_at: now });
          }
          const { data: paidPayment } = await admin.from("payments").select("*").eq("order_id", order.id).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
          const { data: existingRefund } = await admin.from("refunds").select("id").eq("return_id", id).maybeSingle();
          if (paidPayment && !existingRefund) {
            await admin.from("refunds").insert({ id: `ref-${crypto.randomUUID()}`, order_id: order.id, return_id: id, payment_id: paidPayment.id, amount: Number(paidPayment.amount), currency: paidPayment.currency || order.currency || "PKR", method: "manual", status: "pending", note: "Refund is due after return completion; staff must confirm provider payout.", created_at: now, updated_at: now });
          }
        }
        await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller.id, action: "return.status_change", entity_type: "return", entity_id: id, details_json: { orderId: request.order_id, from: previous, to: status } });
        if (request.user_id) {
          const msg = status === "approved" ? "Your return has been approved." : status === "completed" ? "Your return has been completed and items were returned to inventory." : status === "rejected" ? "Your return request was not approved." : "Your return status was updated.";
          await createNotification(request.user_id, { type: "return", title: `Return for ${request.order_id} is ${status.replace("_", " ")}`, message: msg, orderId: request.order_id });
        }
        const { data: updated } = await admin.from("return_requests").select("*").eq("id", id).single();
        const [withRef] = await withRefund([updated]);
        return json(req, { request: returnRow(withRef) });
      }

      if (req.method === "POST" && /^\/returns\/[^/]+\/refund$/.test(path)) {
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const body = await req.json().catch(() => ({}));
        const status = String(body.status || "").trim();
        if (!["pending", "processing", "refunded", "failed"].includes(status)) return json(req, { error: "INVALID_REFUND_STATUS", message: "Invalid refund status." }, 400);
        const { data: request } = await admin.from("return_requests").select("*, orders(total, currency)").eq("id", id).maybeSingle();
        if (!request) return json(req, { error: "RETURN_NOT_FOUND", message: "Return request not found." }, 404);
        if (request.status !== "completed") return json(req, { error: "REFUND_REQUIRES_COMPLETED_RETURN", message: "A refund can only be processed after a return is completed." }, 409);
        const { data: payment } = await admin.from("payments").select("*").eq("order_id", request.order_id).in("status", ["paid", "partially_refunded"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (!payment) return json(req, { error: "NO_REFUNDABLE_PAYMENT", message: "No refundable online payment was found for this order." }, 409);
        const amount = Math.min(Number(body.amount ?? payment.amount), Number(payment.amount));
        if (!Number.isFinite(amount) || amount <= 0) return json(req, { error: "INVALID_REFUND_AMOUNT", message: "Refund amount must be greater than zero." }, 400);
        const now = new Date().toISOString();
        const { data: existing } = await admin.from("refunds").select("*").eq("return_id", id).maybeSingle();
        const refundId = existing?.id || `ref-${crypto.randomUUID()}`;
        const providerRef = String(body.providerRef || "").trim() || null;
        const note = String(body.note || "").trim();
        if (existing) {
          await admin.from("refunds").update({ amount, status, provider_ref: providerRef, note, updated_at: now }).eq("id", refundId);
        } else {
          await admin.from("refunds").insert({ id: refundId, order_id: request.order_id, return_id: id, payment_id: payment.id, amount, currency: payment.currency || (request as any).orders?.currency || "PKR", method: String(body.method || "manual"), status, provider_ref: providerRef, note, created_at: now, updated_at: now });
        }
        if (status === "refunded") {
          const remaining = Math.max(0, Number(payment.amount) - amount);
          await admin.from("payments").update({ status: remaining > 0.005 ? "partially_refunded" : "refunded", updated_at: now }).eq("id", payment.id);
        }
        await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller.id, action: "refund.status_change", entity_type: "refund", entity_id: refundId, details_json: { returnId: id, orderId: request.order_id, status, amount, providerRef } });
        if (request.user_id) {
          const msg = status === "refunded" ? "Your refund has been recorded as completed." : status === "processing" ? "Your refund is being processed." : "Your return refund status was updated.";
          await createNotification(request.user_id, { type: "return", title: `Refund for ${request.order_id} is ${status}`, message: msg, orderId: request.order_id });
        }
        const { data: updated } = await admin.from("return_requests").select("*").eq("id", id).single();
        const [withRef] = await withRefund([updated]);
        return json(req, { request: returnRow(withRef) });
      }
    }

    // ---- Notifications (own) --------------------------------------------------
    if (path === "/notifications" || path.startsWith("/notifications/")) {
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

      if (req.method === "GET" && path === "/notifications") {
        const { data } = await admin.from("notifications").select("*").eq("user_id", caller.id).order("created_at", { ascending: false }).limit(100);
        return json(req, { notifications: (data || []).map(notificationRow) });
      }
      if (req.method === "POST" && /^\/notifications\/[^/]+\/read$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[2]);
        await admin.from("notifications").update({ read: true }).eq("id", id).eq("user_id", caller.id);
        return json(req, { ok: true });
      }
      if (req.method === "POST" && path === "/notifications/read-all") {
        await admin.from("notifications").update({ read: true }).eq("user_id", caller.id);
        return json(req, { ok: true });
      }
      if (req.method === "DELETE" && path === "/notifications") {
        await admin.from("notifications").delete().eq("user_id", caller.id);
        return json(req, { ok: true });
      }
    }

    // ---- Engagement (merged own-lists view) ------------------------------------
    if (req.method === "GET" && path === "/engagement") {
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);
      const staff = isStaff(caller);
      const [{ data: reviews }, { data: coupons }, { data: tickets }, { data: returns }, { data: notifications }] = await Promise.all([
        admin.from("reviews").select("*").order("created_at", { ascending: false }).limit(2000),
        staff ? admin.from("coupons").select("*").order("code").limit(2000) : admin.from("coupons").select("*").eq("active", true).order("code").limit(2000),
        staff ? admin.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(2000) : admin.from("support_tickets").select("*").eq("user_id", caller.id).order("updated_at", { ascending: false }).limit(2000),
        staff ? admin.from("return_requests").select("*").order("updated_at", { ascending: false }).limit(2000) : admin.from("return_requests").select("*").eq("user_id", caller.id).order("updated_at", { ascending: false }).limit(2000),
        admin.from("notifications").select("*").eq("user_id", caller.id).order("created_at", { ascending: false }).limit(100),
      ]);
      const returnsWithRefund = await withRefund(returns || []);
      return json(req, {
        reviews: (reviews || []).map(reviewRow),
        coupons: (coupons || []).map((c) => ({ id: c.id, code: c.code, type: c.type, value: Number(c.value), minSubtotal: Number(c.min_subtotal), maxUses: Number(c.max_uses), usedCount: Number(c.used_count), active: Boolean(c.active), expiresAt: c.expires_at, description: c.description })),
        supportTickets: (tickets || []).map(supportRow),
        returnRequests: returnsWithRefund.map(returnRow),
        notifications: (notifications || []).map(notificationRow),
      });
    }

    // ---- Audit logs (admin only) -----------------------------------------------
    if (req.method === "GET" && path === "/audit-logs") {
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);
      if (caller.role !== "admin") return json(req, { error: "FORBIDDEN", message: "Admin permission required." }, 403);
      const rawLimit = Number(url.searchParams.get("limit"));
      const rawOffset = Number(url.searchParams.get("offset"));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(250, Math.floor(rawLimit)) : 100;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
      const { data, count, error } = await admin.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      const logs = (data || []).map((row) => ({ id: row.id, actorUserId: row.actor_user_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, details: row.details_json || {}, createdAt: row.created_at }));
      return json(req, { logs, total: count ?? 0, limit, offset });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "SERVER_ERROR", message: (error as Error).message || "Internal server error." }, 500);
  }
});
