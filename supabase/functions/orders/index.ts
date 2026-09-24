// FikarNot orders Edge Function.
// Ported from server/index.js:
//   GET  /api/orders                    -> GET  /            (own orders, or all if staff)
//   POST /api/orders                    -> POST /            (checkout)
//   POST /api/orders/:id/cancel          -> POST /:id/cancel
//   POST /api/orders/:id/status (staff)   -> POST /:id/status
//   DELETE /api/orders/:id (staff)         -> DELETE /:id
//   GET  /api/coupons                     -> GET  /coupons
//   POST /api/coupons/validate             -> POST /coupons/validate
//   POST /api/coupons (staff)               -> POST /coupons
//   DELETE /api/coupons/:id (staff)          -> DELETE /coupons/:id
//
// NOT included yet (later stages): the invoice HTML page, payment-proof
// upload (needs Supabase Storage first), and online/card payments (no
// payment gateway wired up yet — only cod + manual methods work for now).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ORIGINS = (Deno.env.get("FIKARNOT_FRONTEND_ORIGIN") || "http://localhost:5173")
  .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });
}

type Caller = { id: string; role: string } | null;

async function getCaller(req: Request): Promise<Caller> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (!profile) return null;
  return { id: userData.user.id, role: profile.role };
}
const isStaff = (c: Caller) => !!c && ["admin", "editor"].includes(c.role);

// deno-lint-ignore no-explicit-any
const orderRow = (row: any, items: any[]) => ({
  id: row.id,
  customer: { ...(row.user_id ? { userId: row.user_id } : {}), name: row.customer_name, email: row.customer_email, address: row.customer_address, paymentMethod: row.payment_method },
  items,
  subtotal: Number(row.subtotal),
  discount: Number(row.discount),
  shipping: Number(row.shipping),
  tax: Number(row.tax || 0),
  total: Number(row.total),
  currency: row.currency || "PKR",
  paymentStatus: row.payment_status || (row.status === "paid" ? "paid" : "pending"),
  paymentMethod: row.payment_method,
  courier: row.courier || "",
  trackingNumber: row.tracking_number || "",
  trackingUrl: row.tracking_url || "",
  shipmentStatus: row.shipment_status || (row.tracking_number ? "shipped" : "not_created"),
  invoiceNumber: row.invoice_number || "",
  coupon: row.coupon_json || null,
  status: row.status,
  createdAt: row.created_at,
  ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
});

// deno-lint-ignore no-explicit-any
const couponRow = (row: any) => ({
  id: row.id, code: row.code, type: row.type, value: Number(row.value), minSubtotal: Number(row.min_subtotal),
  maxUses: Number(row.max_uses), usedCount: Number(row.used_count), active: Boolean(row.active),
  expiresAt: row.expires_at, description: row.description,
});

async function getSiteSettings() {
  const { data } = await admin.from("site_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const row of data || []) out[row.key] = row.value as string;
  return out;
}

async function getCommerceConfig() {
  const s = await getSiteSettings();
  return {
    currency: String(s.currency || "PKR").toUpperCase(),
    freeShippingThreshold: Math.max(0, Number(s.freeShippingThreshold) || 0),
    shippingFlatRate: Math.max(0, Number(s.shippingFlatRate) || 0),
    taxRate: Math.max(0, Math.min(100, Number(s.taxRate) || 0)),
    allowCod: String(s.allowCod) !== "0",
    allowManualPayments: String(s.allowManualPayments) !== "0",
    manualPaymentDetails: {
      jazzcashNumber: String(s.jazzcashNumber || ""), easypaisaNumber: String(s.easypaisaNumber || ""),
      bankName: String(s.bankName || ""), bankAccountTitle: String(s.bankAccountTitle || ""),
      bankAccountNumber: String(s.bankAccountNumber || ""), bankIban: String(s.bankIban || ""), bankInstructions: String(s.bankInstructions || ""),
    },
  };
}

async function validateCoupon(code: string, subtotal: number) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return { coupon: null as any, discount: 0, shippingFree: false };
  const { data: coupon } = await admin.from("coupons").select("*").ilike("code", normalized).maybeSingle();
  if (!coupon) throw Object.assign(new Error("That coupon code is not valid"), { code: "INVALID_COUPON" });
  const expired = coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now();
  if (!coupon.active || expired || (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses)) {
    throw Object.assign(new Error("That coupon is expired, inactive, or has reached its usage limit"), { code: "INVALID_COUPON" });
  }
  if (subtotal < Number(coupon.min_subtotal || 0)) {
    throw Object.assign(new Error(`Spend at least ${Number(coupon.min_subtotal).toFixed(2)} to use ${normalized}`), { code: "COUPON_MIN_SUBTOTAL" });
  }
  const shippingFree = coupon.type === "free_shipping";
  let discount = 0;
  if (coupon.type === "percent") discount = Math.min(subtotal, (subtotal * Number(coupon.value)) / 100);
  else if (coupon.type === "fixed") discount = Math.min(subtotal, Number(coupon.value));
  return { coupon, discount: Number(discount.toFixed(2)), shippingFree };
}

async function nextOrderNumber() {
  const { data } = await admin.from("orders").select("id").ilike("id", "FN-%");
  let max = 0;
  for (const row of data || []) {
    const n = Number(String(row.id).replace(/^FN-/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `FN-${String(max + 1).padStart(4, "0")}`;
}

async function createNotification(userId: string | null, opts: { type: string; title: string; message: string; link?: string; orderId?: string | null }) {
  if (!userId) return;
  await admin.from("notifications").insert({
    id: `n-${crypto.randomUUID()}`, user_id: userId, type: opts.type, title: opts.title, message: opts.message,
    link: opts.link || "/account", order_id: opts.orderId || null, read: false,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?orders/, "") || "/";

  try {
    // ---- GET /commerce-settings (public) ------------------------------------
    if (req.method === "GET" && path === "/commerce-settings") {
      return json(req, await getCommerceConfig());
    }

    // ---- Coupons (partly public) -------------------------------------------
    if (path === "/coupons" || path.startsWith("/coupons/")) {
      if (req.method === "GET" && path === "/coupons") {
        const { data } = await admin.from("coupons").select("*").eq("active", true).order("code");
        const now = Date.now();
        const active = (data || []).filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now);
        return json(req, { coupons: active.map(couponRow) });
      }
      if (req.method === "POST" && path === "/coupons/validate") {
        const body = await req.json().catch(() => ({}));
        try {
          const result = await validateCoupon(body.code || "", Number(body.subtotal || 0));
          return json(req, { coupon: result.coupon ? couponRow(result.coupon) : null, discount: result.discount, shippingFree: result.shippingFree });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          return json(req, { error: err.code || "INVALID_COUPON", message: err.message }, 400);
        }
      }
      // Everything else under /coupons is staff-only.
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);

      if (req.method === "POST" && path === "/coupons") {
        const body = await req.json().catch(() => ({}));
        const c = body.coupon || body;
        const id = c.id || `cp-${crypto.randomUUID()}`;
        const { data: saved, error } = await admin.from("coupons").upsert({
          id, code: String(c.code || "").trim().toUpperCase(), type: c.type || "percent", value: Number(c.value) || 0,
          min_subtotal: Number(c.minSubtotal) || 0, max_uses: Number(c.maxUses) || 0, used_count: Number(c.usedCount) || 0,
          active: c.active !== false, expires_at: c.expiresAt ? new Date(c.expiresAt).toISOString() : null, description: String(c.description || ""),
        }, { onConflict: "id" }).select().single();
        if (error) throw error;
        return json(req, { coupon: couponRow(saved) });
      }
      if (req.method === "DELETE" && path.startsWith("/coupons/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        await admin.from("coupons").delete().eq("id", id);
        return json(req, { ok: true });
      }
    }

    // Everything below requires auth.
    const caller = await getCaller(req);

    // ---- GET /  (own orders, or all if staff) ------------------------------
    if (req.method === "GET" && path === "/") {
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);
      const rawLimit = Number(url.searchParams.get("limit"));
      const rawOffset = Number(url.searchParams.get("offset"));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.floor(rawLimit)) : 200;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

      let ordersQuery = admin.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (!isStaff(caller)) ordersQuery = ordersQuery.eq("user_id", caller.id);
      const { data: orders, count, error } = await ordersQuery;
      if (error) throw error;

      const ids = (orders || []).map((o) => o.id);
      const itemsByOrder = new Map<string, unknown[]>();
      if (ids.length) {
        const { data: items } = await admin.from("order_items").select("*").in("order_id", ids);
        for (const item of items || []) {
          const bucket = itemsByOrder.get(item.order_id) || [];
          bucket.push({ productId: item.product_id, name: item.product_name, price: Number(item.price), qty: Number(item.qty) });
          itemsByOrder.set(item.order_id, bucket);
        }
      }
      return json(req, { orders: (orders || []).map((o) => orderRow(o, itemsByOrder.get(o.id) || [])), total: count ?? 0, limit, offset });
    }

    // ---- POST /  (checkout) -------------------------------------------------
    if (req.method === "POST" && path === "/") {
      const body = await req.json().catch(() => ({}));
      const customer = body.customer || {};
      const paymentMethod = String(customer.paymentMethod || "cod").trim().toLowerCase();
      const commerce = await getCommerceConfig();
      const isManual = ["jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod);
      if (!["cod", "jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod)) {
        return json(req, { error: "INVALID_PAYMENT_METHOD", message: "Unsupported payment method (card/online payments aren't wired up yet)." }, 400);
      }
      if (paymentMethod === "cod" && !commerce.allowCod) return json(req, { error: "PAYMENT_METHOD_DISABLED", message: "Cash on delivery is currently unavailable." }, 409);
      if (isManual && !commerce.allowManualPayments) return json(req, { error: "PAYMENT_METHOD_DISABLED", message: "Manual payment methods are currently unavailable." }, 503);

      const email = String(customer.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "INVALID_EMAIL", message: "A valid customer email is required." }, 400);
      const requestedItems = Array.isArray(body.items) ? body.items : [];
      if (!requestedItems.length) return json(req, { error: "EMPTY_ORDER", message: "Your order has no items." }, 400);

      try {
        const items: { productId: string; name: string; price: number; qty: number }[] = [];
        for (const requested of requestedItems) {
          const { data: product } = await admin.from("products").select("*").eq("id", requested.productId).maybeSingle();
          const qty = Math.max(0, Math.floor(Number(requested.qty || 0)));
          if (!product) throw Object.assign(new Error(`Product ${requested.productId} was not found.`), { code: "PRODUCT_NOT_FOUND" });
          if (!qty) continue;
          if (product.stock < qty) throw Object.assign(new Error(`${product.name} only has ${product.stock} item(s) left.`), { code: "INSUFFICIENT_STOCK" });
          items.push({ productId: product.id, name: product.name, price: Number(product.price), qty });
        }
        if (!items.length) throw Object.assign(new Error("Your cart is empty or unavailable."), { code: "EMPTY_ORDER" });

        const subtotal = Number(items.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2));
        const baseShipping = subtotal === 0 ? 0 : subtotal >= commerce.freeShippingThreshold ? 0 : commerce.shippingFlatRate;
        const couponResult = await validateCoupon(body.couponCode || "", subtotal);
        const shipping = couponResult.shippingFree ? 0 : baseShipping;
        const discount = couponResult.discount;
        const taxable = Math.max(0, subtotal - discount);
        const tax = Number(((taxable * commerce.taxRate) / 100).toFixed(2));
        const total = Number((taxable + shipping + tax).toFixed(2));
        const id = await nextOrderNumber();
        const now = new Date().toISOString();
        const paymentStatus = isManual ? "pending" : "unpaid";

        const { error: insertError } = await admin.from("orders").insert({
          id, user_id: caller?.id || null, customer_name: String(customer.name || "Guest").trim(), customer_email: email,
          customer_address: String(customer.address || ""), payment_method: paymentMethod, subtotal, discount, shipping, tax, total,
          coupon_json: couponResult.coupon ? { code: couponResult.coupon.code, type: couponResult.coupon.type, value: couponResult.coupon.value, discount, shippingFree: couponResult.shippingFree } : null,
          status: paymentMethod === "cod" ? "processing" : "paid", payment_status: paymentStatus, currency: commerce.currency,
          invoice_number: `INV-${id.replace(/^FN-/, "")}`, created_at: now, updated_at: now,
        });
        if (insertError) throw insertError;

        for (const item of items) {
          await admin.from("order_items").insert({ id: `${id}-${item.productId}`, order_id: id, product_id: item.productId, product_name: item.name, price: item.price, qty: item.qty });
          const { data: product } = await admin.from("products").select("stock").eq("id", item.productId).single();
          const nextStock = Number(product.stock) - item.qty;
          if (nextStock < 0) throw Object.assign(new Error(`${item.name} is no longer available in that quantity.`), { code: "INSUFFICIENT_STOCK" });
          await admin.from("products").update({ stock: nextStock, updated_at: now }).eq("id", item.productId);
          await admin.from("inventory_logs").insert({
            id: `inv-${crypto.randomUUID()}`, product_id: item.productId, product_name: item.name, previous_stock: Number(product.stock),
            next_stock: nextStock, change: -item.qty, reason: `Order ${id}`, user_id: caller?.id || null, created_at: now,
          });
        }

        if (couponResult.coupon) {
          await admin.from("coupons").update({ used_count: couponResult.coupon.used_count + 1 }).eq("id", couponResult.coupon.id);
        }

        const { data: savedOrder } = await admin.from("orders").select("*").eq("id", id).single();
        if (caller?.id) await createNotification(caller.id, { type: "order", title: `Order ${id} received`, message: "Thanks for your order. We are preparing it for dispatch.", orderId: id });

        return json(req, { order: orderRow(savedOrder, items), manualPaymentDetails: isManual ? commerce.manualPaymentDetails : null }, 201);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        const status = ["INVALID_COUPON", "COUPON_MIN_SUBTOTAL", "PRODUCT_NOT_FOUND", "INSUFFICIENT_STOCK", "EMPTY_ORDER", "PAYMENT_METHOD_DISABLED"].includes(err.code || "") ? 409 : 400;
        return json(req, { error: err.code || "ORDER_CREATE_FAILED", message: err.message || "Order could not be created." }, status);
      }
    }

    if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

    // ---- POST /:id/cancel ---------------------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/cancel$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[1]);
      const { data: order } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (!(isStaff(caller) || order.user_id === caller.id)) return json(req, { error: "FORBIDDEN", message: "You cannot cancel this order." }, 403);
      if (!["paid", "processing"].includes(order.status)) return json(req, { error: "ORDER_NOT_CANCELLABLE", message: "This order can no longer be cancelled." }, 409);

      const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
      const now = new Date().toISOString();
      for (const item of items || []) {
        const { data: product } = await admin.from("products").select("stock").eq("id", item.product_id).maybeSingle();
        if (product) {
          await admin.from("products").update({ stock: Number(product.stock) + Number(item.qty), updated_at: now }).eq("id", item.product_id);
          await admin.from("inventory_logs").insert({
            id: `inv-${crypto.randomUUID()}`, product_id: item.product_id, product_name: item.product_name, previous_stock: Number(product.stock),
            next_stock: Number(product.stock) + Number(item.qty), change: Number(item.qty), reason: `Order ${id} cancelled`, user_id: caller.id, created_at: now,
          });
        }
      }
      await admin.from("orders").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", id);
      if (order.user_id) await createNotification(order.user_id, { type: "order", title: `Order ${id} cancelled`, message: "Your cancellation was completed and the items were returned to stock.", orderId: id });
      const { data: updated } = await admin.from("orders").select("*").eq("id", id).single();
      return json(req, { order: orderRow(updated, (items || []).map((i) => ({ productId: i.product_id, name: i.product_name, price: Number(i.price), qty: Number(i.qty) }))) });
    }

    // ---- POST /:id/status (staff) -------------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/status$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.split("/")[1]);
      const body = await req.json().catch(() => ({}));
      const allowed = new Set(["paid", "processing", "shipped", "delivered", "cancelled"]);
      if (!allowed.has(body.status)) return json(req, { error: "INVALID_STATUS", message: "Invalid order status." }, 400);
      const { data: previous } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!previous) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (previous.status === body.status) return json(req, { ok: true, orderId: id, status: body.status });
      if (previous.status === "cancelled") return json(req, { error: "INVALID_STATUS_TRANSITION", message: "A cancelled order cannot be moved back into fulfilment." }, 409);

      const now = new Date().toISOString();
      if (body.status === "cancelled") {
        if (!["paid", "processing"].includes(previous.status)) return json(req, { error: "ORDER_NOT_CANCELLABLE", message: "Only paid or processing orders can be cancelled." }, 409);
        const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
        for (const item of items || []) {
          const { data: product } = await admin.from("products").select("stock").eq("id", item.product_id).maybeSingle();
          if (product) {
            await admin.from("products").update({ stock: Number(product.stock) + Number(item.qty), updated_at: now }).eq("id", item.product_id);
            await admin.from("inventory_logs").insert({
              id: `inv-${crypto.randomUUID()}`, product_id: item.product_id, product_name: item.product_name, previous_stock: Number(product.stock),
              next_stock: Number(product.stock) + Number(item.qty), change: Number(item.qty), reason: `Order ${id} cancelled by staff`, user_id: caller.id, created_at: now,
            });
          }
        }
        await admin.from("orders").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", id);
      } else {
        const patch: Record<string, unknown> = { status: body.status, updated_at: now, cancelled_at: null };
        if (body.status === "shipped" && !previous.shipped_at) patch.shipped_at = now;
        if (body.status === "delivered" && !previous.delivered_at) patch.delivered_at = now;
        await admin.from("orders").update(patch).eq("id", id);
      }
      if (previous.user_id) {
        await createNotification(previous.user_id, { type: "order", title: `Order ${id} is ${body.status === "paid" ? "confirmed" : body.status}`, message: `Your order status has been updated to ${body.status}.`, orderId: id });
      }
      const { data: updatedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
      return json(req, { ok: true, orderId: id, status: body.status, order: orderRow(updatedOrder, (items || []).map((i) => ({ productId: i.product_id, name: i.product_name, price: Number(i.price), qty: Number(i.qty) }))) });
    }

    // ---- POST /:id/fulfilment (staff) ----------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/fulfilment$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.split("/")[1]);
      const body = await req.json().catch(() => ({}));
      const { data: order } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        courier: String(body.courier ?? order.courier ?? ""),
        tracking_number: String(body.trackingNumber ?? order.tracking_number ?? ""),
        tracking_url: String(body.trackingUrl ?? order.tracking_url ?? ""),
        shipment_status: String(body.shipmentStatus ?? order.shipment_status ?? "not_created"),
        updated_at: now,
      };
      if (patch.shipment_status === "shipped" && !order.shipment_created_at) patch.shipment_created_at = now;
      await admin.from("orders").update(patch).eq("id", id);
      await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller.id, action: "order.fulfilment_update", entity_type: "order", entity_id: id, details_json: { courier: patch.courier, trackingNumber: patch.tracking_number, trackingUrl: patch.tracking_url, shipmentStatus: patch.shipment_status } });
      if (order.user_id && patch.tracking_number) {
        await createNotification(order.user_id, { type: "order", title: `Tracking added for ${id}`, message: `Courier: ${patch.courier || "N/A"}, Tracking #: ${patch.tracking_number}`, orderId: id });
      }
      const { data: updatedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
      return json(req, { order: orderRow(updatedOrder, (items || []).map((i) => ({ productId: i.product_id, name: i.product_name, price: Number(i.price), qty: Number(i.qty) }))) });
    }

    // ---- DELETE /:id (staff) -------------------------------------------------
    if (req.method === "DELETE" && /^\/[^/]+$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.slice(1));
      const { data: order } = await admin.from("orders").select("id").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      await admin.from("orders").delete().eq("id", id);
      return json(req, { ok: true });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "SERVER_ERROR", message: (error as Error).message || "Internal server error." }, 500);
  }
});
