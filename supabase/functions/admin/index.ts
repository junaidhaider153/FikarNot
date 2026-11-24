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

import { admin } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json, serverError, text } from "../_shared/http.ts";
import { getCaller, isAdmin, isStaff } from "../_shared/auth.ts";
import { limit } from "../_shared/rateLimit.ts";
import { validateJson, z } from "../_shared/validate.ts";
import { parseRpcError } from "../_shared/rpc.ts";

const siteSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});

const reviewSchema = z.object({
  productId: z.string().min(1, "Product ID is required."),
  rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5.").max(5, "Rating must be between 1 and 5."),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120),
  body: z.string().trim().min(10, "Review body must be at least 10 characters.").max(2000),
});

const reviewStatusSchema = z.object({
  status: z.enum(["published", "hidden"], {
    errorMap: () => ({ message: "Invalid review status." }),
  }),
});

const supportSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254).toLowerCase(),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters.").max(200),
  message: z.string().trim().min(10, "Message must be at least 10 characters.").max(4000),
  category: z.string().trim().max(40).optional().default("general"),
});

const supportStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"], {
    errorMap: () => ({ message: "Invalid support status." }),
  }),
});

const returnCreateSchema = z.object({
  orderId: z.string().min(1, "Order ID is required."),
  reason: z.string().trim().max(200).optional().default("Other"),
  note: z.string().trim().max(1000).optional().default(""),
});

const returnStatusSchema = z.object({
  status: z.enum(["requested", "approved", "rejected", "completed", "cancelled"], {
    errorMap: () => ({ message: "Invalid return status." }),
  }),
});

const refundSchema = z.object({
  status: z.enum(["pending", "processing", "refunded", "failed"], {
    errorMap: () => ({ message: "Invalid refund status." }),
  }),
  amount: z.coerce.number().positive("Refund amount must be greater than zero.").optional(),
  providerRef: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  method: z.string().trim().max(50).optional().default("manual"),
});

// deno-lint-ignore no-explicit-any
const reviewRow = (row: any) => ({
  id: row.id,
  productId: row.product_id,
  userId: row.user_id,
  authorName: row.author_name,
  rating: Number(row.rating),
  title: row.title,
  body: row.body,
  status: row.status,
  verifiedPurchase: Boolean(row.verified_purchase),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
// deno-lint-ignore no-explicit-any
const supportRow = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  email: row.email,
  subject: row.subject,
  message: row.message,
  category: row.category,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
// deno-lint-ignore no-explicit-any
const returnRow = (row: any) => ({
  id: row.id,
  orderId: row.order_id,
  userId: row.user_id,
  reason: row.reason,
  note: row.note,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  refund: row.refund
    ? {
        id: row.refund.id,
        amount: Number(row.refund.amount),
        currency: row.refund.currency,
        status: row.refund.status,
        providerRef: row.refund.provider_ref,
        method: row.refund.method,
        note: row.refund.note,
      }
    : null,
});
// deno-lint-ignore no-explicit-any
const notificationRow = (row: any) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  link: row.link,
  orderId: row.order_id,
  read: Boolean(row.read),
  createdAt: row.created_at,
});
// deno-lint-ignore no-explicit-any
const catalogRow = (row: any) => ({
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

async function createNotification(
  userId: string | null,
  opts: { type: string; title: string; message: string; link?: string; orderId?: string | null },
) {
  if (!userId) return;
  await admin.from("notifications").insert({
    id: `n-${crypto.randomUUID()}`,
    user_id: userId,
    type: opts.type,
    title: opts.title,
    message: opts.message,
    link: opts.link || "/account",
    order_id: opts.orderId || null,
    read: false,
  });
}

async function getPublicSettings() {
  const all = await getSiteSettings();
  return Object.fromEntries(Object.entries(all).filter(([key]) => DEFAULT_SITE_SETTINGS_KEYS.has(key)));
}

async function nextTicketNumber() {
  const { data, error } = await admin.rpc("next_ticket_id");
  if (error) throw error;
  return String(data);
}

async function withRefund(returnRows: any[]) {
  const ids = returnRows.map((r) => r.id);
  if (!ids.length) return returnRows.map((r) => ({ ...r, refund: null }));
  const { data: refunds } = await admin.from("refunds").select("*").in("return_id", ids);
  const byReturn = new Map((refunds || []).map((r) => [r.return_id, r]));
  return returnRows.map((r) => ({ ...r, refund: byReturn.get(r.id) || null }));
}

const DEFAULT_SITE_SETTINGS_KEYS = new Set([
  "storeName",
  "supportEmail",
  "heroKicker",
  "heroEyebrow",
  "heroTitle",
  "heroHighlight",
  "heroSubtitle",
  "heroSticker",
  "heroImage",
  "heroImages",
  "heroVideo",
  "heroVideoWebm",
  "logoUrl",
  "navLinks",
  "announcement",
  "aboutTitle",
  "aboutIntro",
  "aboutBody",
  "whatsappNumber",
  "contactPhone",
  "storeAddress",
  "instagramUrl",
  "facebookUrl",
  "metaTitle",
  "metaDescription",
  "currency",
  "currencyLocale",
  "freeShippingThreshold",
  "shippingFlatRate",
  "taxRate",
  "taxLabel",
  "allowCod",
  "allowOnlinePayments",
  "allowManualPayments",
  "jazzcashNumber",
  "jazzcashTitle",
  "easypaisaNumber",
  "easypaisaTitle",
  "bankName",
  "bankAccountTitle",
  "bankAccountNumber",
  "bankIban",
  "bankInstructions",
  "privacyPolicy",
  "termsOfService",
  "shippingPolicy",
  "returnPolicy",
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
      if (req.method === "GET") return json(req, { settings: await getPublicSettings() });
      if (req.method === "PATCH") {
        const caller = await getCaller(req);
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);
        const val = await validateJson(req, siteSettingsSchema);
        if (!val.success) return val.response;
        const entries = Object.entries(val.data.settings || {}).filter(([key]) => DEFAULT_SITE_SETTINGS_KEYS.has(key));
        for (const [key, value] of entries) {
          await admin
            .from("site_settings")
            .upsert(
              { key, value: String(value ?? ""), updated_at: new Date().toISOString(), updated_by: caller!.id },
              { onConflict: "key" },
            );
        }
        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller!.id,
          action: "site_settings.update",
          entity_type: "site_settings",
          details_json: { keys: entries.map(([k]) => k) },
        });
        return json(req, { settings: await getPublicSettings() });
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
        const val = await validateJson(req, reviewSchema);
        if (!val.success) return val.response;
        const body = val.data;
        const productId = body.productId;
        const { data: product } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
        if (!product) return json(req, { error: "PRODUCT_NOT_FOUND", message: "Product not found." }, 404);
        const { data: purchase } = await admin
          .from("order_items")
          .select("id, orders!inner(user_id)")
          .eq("product_id", productId)
          .eq("orders.user_id", caller.id)
          .neq("orders.status", "cancelled")
          .limit(1)
          .maybeSingle();
        if (!purchase)
          return json(req, { error: "PURCHASE_REQUIRED", message: "Only customers who purchased this product can review it." }, 403);
        const rating = body.rating;
        const title = body.title;
        const reviewBody = body.body;
        const { data: existing } = await admin
          .from("reviews")
          .select("id, status")
          .eq("product_id", productId)
          .eq("user_id", caller.id)
          .maybeSingle();
        const id = existing?.id || `r-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await admin.from("reviews").upsert(
          {
            id,
            product_id: productId,
            user_id: caller.id,
            author_name: caller.name,
            rating,
            title,
            body: reviewBody,
            status: existing?.status || "published",
            verified_purchase: true,
            created_at: now,
            updated_at: now,
          },
          { onConflict: "id" },
        );
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", productId).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin
          .from("products")
          .update({ rating: Number(avg.toFixed(1)), updated_at: now })
          .eq("id", productId);
        const { data: savedReview } = await admin.from("reviews").select("*").eq("id", id).single();
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", productId).single();
        return json(req, { review: reviewRow(savedReview), product: catalogRow(updatedProduct) });
      }
      if (req.method === "POST" && /^\/reviews\/[^/]+\/status$/.test(path)) {
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const val = await validateJson(req, reviewStatusSchema);
        if (!val.success) return val.response;
        const status = val.data.status;
        const { data: review } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
        if (!review) return json(req, { error: "REVIEW_NOT_FOUND", message: "Review not found." }, 404);
        const now = new Date().toISOString();
        await admin.from("reviews").update({ status, updated_at: now }).eq("id", id);
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", review.product_id).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin
          .from("products")
          .update({ rating: Number(avg.toFixed(1)), updated_at: now })
          .eq("id", review.product_id);
        const { data: savedReview } = await admin.from("reviews").select("*").eq("id", id).single();
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", review.product_id).single();
        return json(req, { review: reviewRow(savedReview), product: catalogRow(updatedProduct) });
      }
      if (req.method === "DELETE" && path.startsWith("/reviews/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { data: review } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
        if (!review) return json(req, { error: "REVIEW_NOT_FOUND", message: "Review not found." }, 404);
        if (review.user_id !== caller.id && !isStaff(caller))
          return json(req, { error: "FORBIDDEN", message: "You cannot remove this review." }, 403);
        await admin.from("reviews").delete().eq("id", id);
        const { data: pub } = await admin.from("reviews").select("rating").eq("product_id", review.product_id).eq("status", "published");
        const avg = pub && pub.length ? pub.reduce((s, r) => s + Number(r.rating), 0) / pub.length : 0;
        await admin
          .from("products")
          .update({ rating: Number(avg.toFixed(1)), updated_at: new Date().toISOString() })
          .eq("id", review.product_id);
        const { data: updatedProduct } = await admin.from("products").select("*").eq("id", review.product_id).single();
        return json(req, { ok: true, product: catalogRow(updatedProduct) });
      }
    }

    // ---- Support (POST public, rest staff) ----------------------------------
    if (path === "/support" || path.startsWith("/support/")) {
      if (req.method === "POST" && path === "/support") {
        const limited = await limit(req, "support", 5, 600);
        if (limited) return limited;
        const caller = await getCaller(req);
        const val = await validateJson(req, supportSchema);
        if (!val.success) return val.response;
        const body = val.data;
        const name = body.name,
          email = body.email;
        const subject = body.subject,
          message = body.message;
        const id = await nextTicketNumber();
        const now = new Date().toISOString();
        await admin.from("support_tickets").insert({
          id,
          user_id: caller?.id || null,
          name,
          email,
          subject,
          message,
          category: body.category,
          status: "open",
          created_at: now,
          updated_at: now,
        });
        if (caller?.id)
          await createNotification(caller.id, {
            type: "support",
            title: "Support request received",
            message: `We received your request: ${subject}.`,
            link: "/help",
          });
        const { data: saved } = await admin.from("support_tickets").select("*").eq("id", id).single();
        return json(req, { ticket: supportRow(saved) }, 201);
      }
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);

      if (req.method === "POST" && /^\/support\/[^/]+\/status$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[2]);
        const val = await validateJson(req, supportStatusSchema);
        if (!val.success) return val.response;
        const status = val.data.status;
        const { data: existing } = await admin.from("support_tickets").select("*").eq("id", id).maybeSingle();
        if (!existing) return json(req, { error: "SUPPORT_NOT_FOUND", message: "Support request not found." }, 404);
        await admin.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
        if (existing.user_id) {
          const label = status === "in_progress" ? "in progress" : status;
          await createNotification(existing.user_id, {
            type: "support",
            title: `Support request ${label}`,
            message: `Your support request "${existing.subject}" is now ${label}.`,
            link: "/help",
          });
        }
        const { data: saved } = await admin.from("support_tickets").select("*").eq("id", id).single();
        return json(req, { ticket: supportRow(saved) });
      }
      if (req.method === "DELETE" && path.startsWith("/support/")) {
        await admin
          .from("support_tickets")
          .delete()
          .eq("id", decodeURIComponent(path.split("/").pop() || ""));
        return json(req, { ok: true });
      }
    }

    // ---- Returns / refunds ---------------------------------------------------
    if (path === "/returns" || path.startsWith("/returns/")) {
      const caller = await getCaller(req);
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

      if (req.method === "POST" && path === "/returns") {
        const val = await validateJson(req, returnCreateSchema);
        if (!val.success) return val.response;
        const body = val.data;
        const { data: order } = await admin.from("orders").select("*").eq("id", body.orderId).eq("user_id", caller.id).maybeSingle();
        if (!order || order.status !== "delivered")
          return json(req, { error: "RETURN_NOT_ELIGIBLE", message: "This order is not eligible for a return." }, 409);
        const returnReferenceMs = new Date(order.delivered_at || order.created_at).getTime();
        if (Date.now() - returnReferenceMs > 30 * 86400000)
          return json(req, { error: "RETURN_WINDOW_EXPIRED", message: "The 30-day return window has expired." }, 409);
        const { data: existing } = await admin
          .from("return_requests")
          .select("id")
          .eq("order_id", order.id)
          .eq("user_id", caller.id)
          .maybeSingle();
        if (existing) return json(req, { error: "RETURN_EXISTS", message: "A return request already exists." }, 409);
        const id = `ret-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await admin.from("return_requests").insert({
          id,
          order_id: order.id,
          user_id: caller.id,
          reason: body.reason,
          note: body.note,
          status: "requested",
          created_at: now,
          updated_at: now,
        });
        await createNotification(caller.id, {
          type: "return",
          title: `Return requested for ${order.id}`,
          message: "Your return request is awaiting review.",
          orderId: order.id,
        });
        const { data: saved } = await admin.from("return_requests").select("*").eq("id", id).single();
        const [withRef] = await withRefund([saved]);
        return json(req, { request: returnRow(withRef) }, 201);
      }

      if (req.method === "POST" && /^\/returns\/[^/]+\/status$/.test(path)) {
        if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const val = await validateJson(req, returnStatusSchema);
        if (!val.success) return val.response;
        const status = val.data.status;
        const { data: request } = await admin.from("return_requests").select("*").eq("id", id).maybeSingle();
        if (!request) return json(req, { error: "RETURN_NOT_FOUND", message: "Return request not found." }, 404);
        const { data: order } = await admin.from("orders").select("*").eq("id", request.order_id).single();
        const previous = request.status;
        const RETURN_FLOW: Record<string, string[]> = {
          requested: ["approved", "rejected", "cancelled"],
          approved: ["completed", "rejected", "cancelled"],
          rejected: [],
          completed: [],
          cancelled: [],
        };
        if (previous !== status && !(RETURN_FLOW[previous] || []).includes(status)) {
          return json(req, { error: "INVALID_RETURN_TRANSITION", message: `A ${previous} return cannot be changed to ${status}.` }, 409);
        }
        const now = new Date().toISOString();

        if (status === "completed") {
          const { error: rpcError } = await admin.rpc("complete_return", {
            p_return_id: id,
            p_actor: caller.id,
          });
          if (rpcError) {
            const parsed = parseRpcError(rpcError.message);
            if (parsed) {
              const statusMap: Record<string, number> = {
                RETURN_NOT_FOUND: 404,
                ORDER_NOT_FOUND: 404,
                RETURN_ALREADY_COMPLETED: 409,
                INVALID_RETURN_STATUS: 409,
              };
              return json(req, { error: parsed.code, message: parsed.message }, statusMap[parsed.code] || 400);
            }
            throw rpcError;
          }
        } else {
          await admin.from("return_requests").update({ status, updated_at: now }).eq("id", id);
          if (status === "approved" && previous !== "approved")
            await admin.from("orders").update({ status: "return_approved" }).eq("id", order.id);
          if (status === "rejected")
            await admin.from("orders").update({ status: "delivered" }).eq("id", order.id).eq("status", "return_approved");
        }
        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "return.status_change",
          entity_type: "return",
          entity_id: id,
          details_json: { orderId: request.order_id, from: previous, to: status },
        });
        if (request.user_id) {
          const msg =
            status === "approved"
              ? "Your return has been approved."
              : status === "completed"
                ? "Your return has been completed and items were returned to inventory."
                : status === "rejected"
                  ? "Your return request was not approved."
                  : "Your return status was updated.";
          await createNotification(request.user_id, {
            type: "return",
            title: `Return for ${request.order_id} is ${status.replace("_", " ")}`,
            message: msg,
            orderId: request.order_id,
          });
        }
        const { data: updated } = await admin.from("return_requests").select("*").eq("id", id).single();
        const [withRef] = await withRefund([updated]);
        return json(req, { request: returnRow(withRef) });
      }

      if (req.method === "POST" && /^\/returns\/[^/]+\/refund$/.test(path)) {
        if (!isAdmin(caller)) return json(req, { error: "FORBIDDEN", message: "Admin permission required to issue refunds." }, 403);
        const id = decodeURIComponent(path.split("/")[2]);
        const val = await validateJson(req, refundSchema);
        if (!val.success) return val.response;
        const body = val.data;
        const status = body.status;
        const { data: request } = await admin.from("return_requests").select("*, orders(total, currency)").eq("id", id).maybeSingle();
        if (!request) return json(req, { error: "RETURN_NOT_FOUND", message: "Return request not found." }, 404);
        if (request.status !== "completed")
          return json(
            req,
            { error: "REFUND_REQUIRES_COMPLETED_RETURN", message: "A refund can only be processed after a return is completed." },
            409,
          );
        const { data: payment } = await admin
          .from("payments")
          .select("*")
          .eq("order_id", request.order_id)
          .in("status", ["paid", "partially_refunded"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!payment)
          return json(req, { error: "NO_REFUNDABLE_PAYMENT", message: "No refundable online payment was found for this order." }, 409);
        const amount = Math.min(Number(body.amount ?? payment.amount), Number(payment.amount));
        if (!Number.isFinite(amount) || amount <= 0)
          return json(req, { error: "INVALID_REFUND_AMOUNT", message: "Refund amount must be greater than zero." }, 400);
        const now = new Date().toISOString();
        const { data: existing } = await admin.from("refunds").select("*").eq("return_id", id).maybeSingle();
        const refundId = existing?.id || `ref-${crypto.randomUUID()}`;
        const providerRef = body.providerRef || null;
        const note = body.note || "";
        if (existing) {
          await admin.from("refunds").update({ amount, status, provider_ref: providerRef, note, updated_at: now }).eq("id", refundId);
        } else {
          await admin.from("refunds").insert({
            id: refundId,
            order_id: request.order_id,
            return_id: id,
            payment_id: payment.id,
            amount,
            currency: payment.currency || (request as any).orders?.currency || "PKR",
            method: body.method,
            status,
            provider_ref: providerRef,
            note,
            created_at: now,
            updated_at: now,
          });
        }
        if (status === "refunded") {
          const remaining = Math.max(0, Number(payment.amount) - amount);
          await admin
            .from("payments")
            .update({ status: remaining > 0.005 ? "partially_refunded" : "refunded", updated_at: now })
            .eq("id", payment.id);
        }
        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "refund.status_change",
          entity_type: "refund",
          entity_id: refundId,
          details_json: { returnId: id, orderId: request.order_id, status, amount, providerRef },
        });
        if (request.user_id) {
          const msg =
            status === "refunded"
              ? "Your refund has been recorded as completed."
              : status === "processing"
                ? "Your refund is being processed."
                : "Your return refund status was updated.";
          await createNotification(request.user_id, {
            type: "return",
            title: `Refund for ${request.order_id} is ${status}`,
            message: msg,
            orderId: request.order_id,
          });
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
        const { data } = await admin
          .from("notifications")
          .select("*")
          .eq("user_id", caller.id)
          .order("created_at", { ascending: false })
          .limit(100);
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
        staff
          ? admin.from("coupons").select("*").order("code").limit(2000)
          : admin.from("coupons").select("*").eq("active", true).order("code").limit(2000),
        staff
          ? admin.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(2000)
          : admin.from("support_tickets").select("*").eq("user_id", caller.id).order("updated_at", { ascending: false }).limit(2000),
        staff
          ? admin.from("return_requests").select("*").order("updated_at", { ascending: false }).limit(2000)
          : admin.from("return_requests").select("*").eq("user_id", caller.id).order("updated_at", { ascending: false }).limit(2000),
        admin.from("notifications").select("*").eq("user_id", caller.id).order("created_at", { ascending: false }).limit(100),
      ]);
      const returnsWithRefund = await withRefund(returns || []);
      return json(req, {
        reviews: (reviews || []).map(reviewRow),
        coupons: (coupons || []).map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          value: Number(c.value),
          minSubtotal: Number(c.min_subtotal),
          maxUses: Number(c.max_uses),
          usedCount: Number(c.used_count),
          active: Boolean(c.active),
          expiresAt: c.expires_at,
          description: c.description,
        })),
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
      const { data, count, error } = await admin
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      const logs = (data || []).map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row.details_json || {},
        createdAt: row.created_at,
      }));
      return json(req, { logs, total: count ?? 0, limit, offset });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return serverError(req, error);
  }
});
