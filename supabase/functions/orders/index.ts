// FikarNot orders Edge Function.
//   GET    /                      own orders (all, for MFA-verified staff)
//   POST   /                      checkout  (guests: Cash on Delivery only)
//   GET    /:id/invoice           invoice data (order owner or staff)
//   POST   /:id/cancel            owner or staff — atomic cancel + restock
//   POST   /:id/status            staff — forward-only for editors, admin may correct
//   POST   /:id/fulfilment        staff — courier + tracking (emails the customer)
//   DELETE /:id                   admin only (audit-logged)
//   GET    /commerce-settings     public
//   GET    /coupons               public list of active coupons
//   POST   /coupons/validate      public (rate limited)
//   POST   /coupons               staff
//   POST   /coupons/:id/toggle    staff
//   DELETE /coupons/:id           staff
//
// Checkout runs inside the Postgres function public.create_order() so stock,
// coupon usage, numbering and order rows commit (or roll back) together.
// NOT included: online/card payments (PayFast) — returns INVALID_PAYMENT_METHOD.

import { admin } from "../_shared/supabase.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { json, serverError, text } from "../_shared/http.ts";
import { getCaller, isAdmin, isStaff } from "../_shared/auth.ts";
import { limit } from "../_shared/rateLimit.ts";
import { queueEmail } from "../_shared/email.ts";
import { orderConfirmation, trackingAdded } from "../_shared/emailTemplates.ts";
import { validateJson, z } from "../_shared/validate.ts";
import { parseRpcError } from "../_shared/rpc.ts";
import { validateStatusTransition } from "../_shared/orderLifecycle.ts";

void corsHeaders; // re-exported for symmetry with other functions

const couponValidateSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required.").max(40),
  subtotal: z.coerce.number().min(0).default(0),
});

const couponInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "Coupon code is required.").max(40),
  type: z.enum(["percent", "fixed", "free_shipping"]).optional().default("percent"),
  value: z.coerce.number().min(0).optional().default(0),
  minSubtotal: z.coerce.number().min(0).optional().default(0),
  maxUses: z.coerce.number().int().min(0).optional().default(0),
  usedCount: z.coerce.number().int().min(0).optional().default(0),
  active: z.boolean().optional().default(true),
  expiresAt: z.string().nullable().optional(),
  description: z.string().trim().max(300).optional().default(""),
});
const couponPayloadSchema = z
  .union([z.object({ coupon: couponInputSchema }), couponInputSchema])
  .transform((val) => ("coupon" in val ? val.coupon : val));

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().max(120).default("Guest"),
    email: z.string().trim().email("A valid customer email is required.").max(254),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine(
        (val) => /^(?:\+92|0092|92|0)?3[0-9]{9}$/.test(val.replace(/[\s\-()]/g, "")),
        "A valid Pakistani mobile number is required (e.g. 0300 1234567).",
      ),
    address: z.string().trim().max(500).default(""),
    paymentMethod: z
      .enum(["cod", "jazzcash", "easypaisa", "bank_transfer"], {
        errorMap: () => ({ message: "Unsupported payment method (card/online payments aren't available yet)." }),
      })
      .default("cod"),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, "Product ID is required.").max(80),
        qty: z.coerce.number().int().min(1, "Item quantity must be at least 1.").max(100),
      }),
    )
    .min(1, "Your order has no items.")
    .max(50, "An order can contain at most 50 different products."),
  couponCode: z.string().trim().max(40).optional().nullable(),
});

const orderStatusSchema = z.object({
  status: z.enum(["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled"], {
    errorMap: () => ({ message: "Invalid order status." }),
  }),
});

export const orderLookupSchema = z.object({
  orderId: z.string().trim().min(3, "Order ID is required.").max(40),
  contact: z.string().trim().min(3, "Phone number or email is required.").max(254),
});

const fulfilmentSchema = z.object({
  courier: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: z.string().trim().max(500).optional(),
  shipmentStatus: z.string().trim().max(40).optional(),
});

const STATUS_RANK: Record<string, number> = { pending_payment: 0, paid: 1, processing: 2, shipped: 3, delivered: 4 };
const RPC_STATUS: Record<string, number> = {
  LOGIN_REQUIRED: 401,
  INVALID_PAYMENT_METHOD: 400,
  INVALID_COD_ORDER: 400,
  INVALID_ORDER_STATUS: 409,
  EMPTY_ORDER: 400,
  PRODUCT_NOT_FOUND: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_COUPON: 409,
  COUPON_MIN_SUBTOTAL: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_CANCELLABLE: 409,
};

type ItemOut = { productId: string; name: string; price: number; qty: number };
// deno-lint-ignore no-explicit-any
const itemRow = (i: any): ItemOut => ({ productId: i.product_id, name: i.product_name, price: Number(i.price), qty: Number(i.qty) });
async function itemsOf(orderId: string): Promise<ItemOut[]> {
  const { data } = await admin.from("order_items").select("*").eq("order_id", orderId);
  return (data || []).map(itemRow);
}

// deno-lint-ignore no-explicit-any
const orderRow = (row: any, items: any[], proof: any = null, payment: any = null) => ({
  id: row.id,
  customer: {
    ...(row.user_id ? { userId: row.user_id } : {}),
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone || "",
    address: row.customer_address,
    paymentMethod: row.payment_method,
  },
  items,
  subtotal: Number(row.subtotal),
  discount: Number(row.discount),
  shipping: Number(row.shipping),
  tax: Number(row.tax || 0),
  total: Number(row.total),
  currency: row.currency || "PKR",
  paymentStatus: row.payment_status || (row.status === "paid" ? "paid" : "pending"),
  paymentMethod: row.payment_method,
  paymentProof: proof || null,
  paymentReference: payment?.provider_payment_id || null,
  paymentNote: payment?.raw_status || null,
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
  id: row.id,
  code: row.code,
  type: row.type,
  value: Number(row.value),
  minSubtotal: Number(row.min_subtotal),
  maxUses: Number(row.max_uses),
  usedCount: Number(row.used_count),
  active: Boolean(row.active),
  expiresAt: row.expires_at,
  description: row.description,
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
      jazzcashNumber: String(s.jazzcashNumber || ""),
      easypaisaNumber: String(s.easypaisaNumber || ""),
      bankName: String(s.bankName || ""),
      bankAccountTitle: String(s.bankAccountTitle || ""),
      bankAccountNumber: String(s.bankAccountNumber || ""),
      bankIban: String(s.bankIban || ""),
      bankInstructions: String(s.bankInstructions || ""),
    },
  };
}

/** Read-only preview used by the cart. Checkout re-validates inside create_order(). */
async function validateCoupon(code: string, subtotal: number) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase()
    .slice(0, 40);
  if (!normalized) return { coupon: null as any, discount: 0, shippingFree: false };
  // .eq (NOT .ilike): the column is citext, and ilike would treat % and _ in user input as wildcards.
  const { data: coupon } = await admin.from("coupons").select("*").eq("code", normalized).maybeSingle();
  if (!coupon) throw Object.assign(new Error("That coupon code is not valid"), { code: "INVALID_COUPON" });
  const expired = coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now();
  if (!coupon.active || expired || (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses)) {
    throw Object.assign(new Error("That coupon is expired, inactive, or has reached its usage limit"), { code: "INVALID_COUPON" });
  }
  if (subtotal < Number(coupon.min_subtotal || 0)) {
    throw Object.assign(new Error(`Spend at least ${Number(coupon.min_subtotal).toFixed(2)} to use ${normalized}`), {
      code: "COUPON_MIN_SUBTOTAL",
    });
  }
  const shippingFree = coupon.type === "free_shipping";
  let discount = 0;
  if (coupon.type === "percent") discount = Math.min(subtotal, (subtotal * Number(coupon.value)) / 100);
  else if (coupon.type === "fixed") discount = Math.min(subtotal, Number(coupon.value));
  return { coupon, discount: Number(discount.toFixed(2)), shippingFree };
}

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

async function audit(actorId: string, action: string, entityId: string, details: Record<string, unknown>) {
  await admin.from("audit_logs").insert({
    id: `audit-${crypto.randomUUID()}`,
    actor_user_id: actorId,
    action,
    entity_type: "order",
    entity_id: entityId,
    details_json: details,
  });
}

export async function handleOrdersRequest(req: Request): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?orders/, "") || "/";

  try {
    // ---- GET /commerce-settings (public) ------------------------------------
    if (req.method === "GET" && path === "/commerce-settings") {
      return json(req, await getCommerceConfig());
    }

    // ---- POST /lookup (public, rate limited) --------------------------------
    if (req.method === "POST" && path === "/lookup") {
      const limited = await limit(req, "order_lookup", 10, 60);
      if (limited) return limited;
      const val = await validateJson(req, orderLookupSchema);
      if (!val.success) return val.response;
      const { orderId, contact } = val.data;

      const normalizedId = orderId.toUpperCase();
      const rawContact = contact.toLowerCase().trim();
      const cleanContact = rawContact.replace(/[\s\-()]/g, "");

      const { data: order } = await admin.from("orders").select("*").eq("id", normalizedId).maybeSingle();
      if (!order) {
        return json(
          req,
          { error: "NOT_FOUND", message: "No order found matching those details. Please check your Order ID and phone/email." },
          404,
        );
      }

      const orderEmail = (order.customer_email || "").toLowerCase().trim();
      const orderPhone = (order.customer_phone || "").replace(/[\s\-()]/g, "");

      const matchesEmail = orderEmail === rawContact;
      const matchesPhone = Boolean(
        orderPhone &&
        cleanContact &&
        (orderPhone.endsWith(cleanContact) ||
          cleanContact.endsWith(orderPhone) ||
          (orderPhone.length >= 7 && cleanContact.includes(orderPhone.slice(-7)))),
      );

      if (!matchesEmail && !matchesPhone) {
        return json(
          req,
          { error: "NOT_FOUND", message: "No order found matching those details. Please check your Order ID and phone/email." },
          404,
        );
      }

      const items = await itemsOf(order.id);
      return json(req, {
        order: {
          id: order.id,
          status: order.status,
          paymentStatus: order.payment_status || (order.status === "paid" ? "paid" : "pending"),
          paymentMethod: order.payment_method,
          total: Number(order.total),
          subtotal: Number(order.subtotal),
          shipping: Number(order.shipping),
          discount: Number(order.discount),
          currency: order.currency || "PKR",
          createdAt: order.created_at,
          courier: order.courier || "",
          trackingNumber: order.tracking_number || "",
          trackingUrl: order.tracking_url || "",
          shipmentStatus: order.shipment_status || (order.tracking_number ? "shipped" : "not_created"),
          customer: {
            name: order.customer_name,
            email: order.customer_email,
            phone: order.customer_phone || "",
            address: order.customer_address,
          },
          items,
        },
      });
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
        const limited = await limit(req, "coupon-validate", 40, 60);
        if (limited) return limited;
        const val = await validateJson(req, couponValidateSchema);
        if (!val.success) return val.response;
        try {
          const result = await validateCoupon(val.data.code, val.data.subtotal);
          return json(req, {
            coupon: result.coupon ? couponRow(result.coupon) : null,
            discount: result.discount,
            shippingFree: result.shippingFree,
          });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          return json(req, { error: err.code || "INVALID_COUPON", message: err.message }, 400);
        }
      }
      // Everything else under /coupons is staff-only.
      const staffCaller = await getCaller(req);
      if (!isStaff(staffCaller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, staffCaller ? 403 : 401);

      if (req.method === "POST" && path === "/coupons") {
        const val = await validateJson(req, couponPayloadSchema);
        if (!val.success) return val.response;
        const c = val.data;
        const id = c.id || `cp-${crypto.randomUUID()}`;
        const { data: saved, error } = await admin
          .from("coupons")
          .upsert(
            {
              id,
              code: c.code.toUpperCase(),
              type: c.type,
              value: c.value,
              min_subtotal: c.minSubtotal,
              max_uses: c.maxUses,
              used_count: c.usedCount,
              active: c.active,
              expires_at: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
              description: c.description,
            },
            { onConflict: "id" },
          )
          .select()
          .single();
        if (error) throw error;
        await audit(staffCaller!.id, "coupon.save", saved.id, { code: saved.code });
        return json(req, { coupon: couponRow(saved) });
      }
      if (req.method === "POST" && /^\/coupons\/[^/]+\/toggle$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[2]);
        const { data: existing } = await admin.from("coupons").select("*").eq("id", id).maybeSingle();
        if (!existing) return json(req, { error: "NOT_FOUND", message: "Coupon not found." }, 404);
        const { data: saved, error } = await admin.from("coupons").update({ active: !existing.active }).eq("id", id).select().single();
        if (error) throw error;
        await audit(staffCaller!.id, "coupon.toggle", id, { active: saved.active });
        return json(req, { coupon: couponRow(saved) });
      }
      if (req.method === "DELETE" && path.startsWith("/coupons/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        await admin.from("coupons").delete().eq("id", id);
        await audit(staffCaller!.id, "coupon.delete", id, {});
        return json(req, { ok: true });
      }
    }

    // Everything below may use auth (checkout also allows guests).
    const caller = await getCaller(req);

    // ---- GET /  (own orders, or all if staff) ------------------------------
    if (req.method === "GET" && path === "/") {
      if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);
      const rawLimit = Number(url.searchParams.get("limit"));
      const rawOffset = Number(url.searchParams.get("offset"));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.floor(rawLimit)) : 200;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

      let ordersQuery = admin
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (!isStaff(caller)) ordersQuery = ordersQuery.eq("user_id", caller.id);
      const { data: orders, count, error } = await ordersQuery;
      if (error) throw error;

      const ids = (orders || []).map((o) => o.id);
      const itemsByOrder = new Map<string, unknown[]>();
      // deno-lint-ignore no-explicit-any
      const proofsByOrder = new Map<string, any>();
      // deno-lint-ignore no-explicit-any
      const paymentsByOrder = new Map<string, any>();

      if (ids.length) {
        const [itemsRes, proofsRes, paymentsRes] = await Promise.all([
          admin.from("order_items").select("*").in("order_id", ids),
          admin.from("payment_proofs").select("order_id, original_name, filename, mime_type, byte_size, created_at").in("order_id", ids),
          admin.from("payments").select("order_id, provider_payment_id, raw_status, status").in("order_id", ids),
        ]);

        for (const item of itemsRes.data || []) {
          const bucket = itemsByOrder.get(item.order_id) || [];
          bucket.push({ productId: item.product_id, name: item.product_name, price: Number(item.price), qty: Number(item.qty) });
          itemsByOrder.set(item.order_id, bucket);
        }

        for (const p of proofsRes.data || []) {
          proofsByOrder.set(p.order_id, {
            originalName: p.original_name,
            filename: p.filename,
            mimeType: p.mime_type,
            byteSize: Number(p.byte_size),
            createdAt: p.created_at,
          });
        }

        for (const pay of paymentsRes.data || []) {
          paymentsByOrder.set(pay.order_id, pay);
        }
      }
      return json(req, {
        orders: (orders || []).map((o) =>
          orderRow(o, itemsByOrder.get(o.id) || [], proofsByOrder.get(o.id) || null, paymentsByOrder.get(o.id) || null),
        ),
        total: count ?? 0,
        limit,
        offset,
      });
    }

    // ---- POST /  (checkout) -------------------------------------------------
    if (req.method === "POST" && path === "/") {
      const limited = await limit(req, "checkout", 15, 600);
      if (limited) return limited;
      const val = await validateJson(req, checkoutSchema);
      if (!val.success) return val.response;
      const body = val.data;
      const customer = body.customer;
      const paymentMethod = customer.paymentMethod;
      const commerce = await getCommerceConfig();
      const isManual = ["jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod);

      // POLICY: guests may only use Cash on Delivery.
      if (isManual && !caller) {
        return json(
          req,
          {
            error: "LOGIN_REQUIRED",
            message: "Please sign in to pay by bank transfer or mobile wallet. Guests can choose Cash on Delivery.",
          },
          401,
        );
      }
      if (paymentMethod === "cod" && !commerce.allowCod)
        return json(req, { error: "PAYMENT_METHOD_DISABLED", message: "Cash on delivery is currently unavailable." }, 409);
      if (isManual && !commerce.allowManualPayments)
        return json(req, { error: "PAYMENT_METHOD_DISABLED", message: "Manual payment methods are currently unavailable." }, 503);

      const email = customer.email.toLowerCase();
      const phone = customer.phone.trim();
      const items = body.items.map((r) => ({
        productId: r.productId,
        qty: r.qty,
      }));

      const { data: created, error: rpcError } = await admin.rpc("create_order", {
        p_user_id: caller?.id || null,
        p_customer: { name: customer.name || "Guest", email, phone, address: customer.address || "", paymentMethod },
        p_items: items,
        p_coupon_code: body.couponCode ? text(body.couponCode, 40) : null,
        p_config: {
          currency: commerce.currency,
          freeShippingThreshold: commerce.freeShippingThreshold,
          shippingFlatRate: commerce.shippingFlatRate,
          taxRate: commerce.taxRate,
        },
      });
      if (rpcError) {
        const parsed = parseRpcError(rpcError.message);
        if (parsed) return json(req, { error: parsed.code, message: parsed.message }, RPC_STATUS[parsed.code] || 400);
        throw rpcError;
      }

      const id = (created as { orderId: string }).orderId;
      const { data: savedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      const orderItems = await itemsOf(id);
      if (caller?.id)
        await createNotification(caller.id, {
          type: "order",
          title: `Order ${id} received`,
          message: "Thanks for your order. We are preparing it for dispatch.",
          orderId: id,
        });
      queueEmail({
        to: email,
        ...orderConfirmation(
          {
            id,
            total: Number(savedOrder.total),
            subtotal: Number(savedOrder.subtotal),
            shipping: Number(savedOrder.shipping),
            discount: Number(savedOrder.discount),
            currency: savedOrder.currency || "PKR",
            paymentMethod,
            customerName: savedOrder.customer_name,
          },
          orderItems,
        ),
      });
      return json(
        req,
        { order: orderRow(savedOrder, orderItems), manualPaymentDetails: isManual ? commerce.manualPaymentDetails : null },
        201,
      );
    }

    if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

    // ---- GET /:id/invoice (owner or staff) ----------------------------------
    if (req.method === "GET" && /^\/[^/]+\/invoice$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[1]);
      const { data: order } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (!(isStaff(caller) || order.user_id === caller.id))
        return json(req, { error: "FORBIDDEN", message: "You cannot view this invoice." }, 403);
      const s = await getSiteSettings();
      const store = {
        name: String(s.storeName || s.siteName || "FikarNot"),
        email: String(s.supportEmail || s.contactEmail || ""),
        address: String(s.storeAddress || s.contactAddress || ""),
        phone: String(s.contactPhone || ""),
      };
      return json(req, { invoice: { store, order: orderRow(order, await itemsOf(id)) } });
    }

    // ---- POST /:id/cancel ---------------------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/cancel$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[1]);
      const { data: order } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (!(isStaff(caller) || order.user_id === caller.id))
        return json(req, { error: "FORBIDDEN", message: "You cannot cancel this order." }, 403);
      const { error: cancelError } = await admin.rpc("cancel_order", {
        p_order_id: id,
        p_actor: caller.id,
        p_reason: `Order ${id} cancelled`,
      });
      if (cancelError) {
        const parsed = parseRpcError(cancelError.message);
        if (parsed) return json(req, { error: parsed.code, message: parsed.message }, RPC_STATUS[parsed.code] || 400);
        throw cancelError;
      }
      if (order.user_id)
        await createNotification(order.user_id, {
          type: "order",
          title: `Order ${id} cancelled`,
          message: "Your cancellation was completed and the items were returned to stock.",
          orderId: id,
        });
      if (isStaff(caller)) await audit(caller.id, "order.cancel", id, {});
      const { data: updated } = await admin.from("orders").select("*").eq("id", id).single();
      return json(req, { order: orderRow(updated, await itemsOf(id)) });
    }

    // ---- POST /:id/status (staff) -------------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/status$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.split("/")[1]);
      const val = await validateJson(req, orderStatusSchema);
      if (!val.success) return val.response;
      const status = val.data.status;
      const { data: previous } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!previous) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      const transitionCheck = validateStatusTransition(previous.status, status, isAdmin(caller));
      if (!transitionCheck.allowed) {
        return json(req, { error: transitionCheck.code!, message: transitionCheck.message! }, transitionCheck.status!);
      }
      if (previous.status === status) return json(req, { ok: true, orderId: id, status });

      if (status === "cancelled") {
        const { error: cancelError } = await admin.rpc("cancel_order", {
          p_order_id: id,
          p_actor: caller.id,
          p_reason: `Order ${id} cancelled by staff`,
        });
        if (cancelError) {
          const parsed = parseRpcError(cancelError.message);
          if (parsed) return json(req, { error: parsed.code, message: parsed.message }, RPC_STATUS[parsed.code] || 400);
          throw cancelError;
        }
      } else {
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { status, updated_at: now };
        if (status === "shipped" && !previous.shipped_at) patch.shipped_at = now;
        if (status === "delivered" && !previous.delivered_at) patch.delivered_at = now;
        await admin.from("orders").update(patch).eq("id", id);
      }
      await audit(caller.id, "order.status", id, { from: previous.status, to: status });
      if (previous.user_id) {
        await createNotification(previous.user_id, {
          type: "order",
          title: `Order ${id} is ${status === "paid" ? "confirmed" : status}`,
          message: `Your order status has been updated to ${status}.`,
          orderId: id,
        });
      }
      const { data: updatedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      return json(req, { ok: true, orderId: id, status, order: orderRow(updatedOrder, await itemsOf(id)) });
    }

    // ---- POST /:id/collect-cod (staff) ---------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/collect-cod$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.split("/")[1]);

      const { data, error: rpcErr } = await admin.rpc("collect_cod", {
        p_order_id: id,
        p_actor: caller.id,
      });

      if (rpcErr) {
        const parsed = parseRpcError(rpcErr.message);
        if (parsed) return json(req, { error: parsed.code, message: parsed.message }, RPC_STATUS[parsed.code] || 400);
        throw rpcErr;
      }

      const items = await itemsOf(id);
      const { data: updatedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      return json(req, {
        ok: true,
        alreadyCollected: Boolean(data?.alreadyCollected),
        order: orderRow(updatedOrder, items),
      });
    }

    // ---- POST /:id/fulfilment (staff) ----------------------------------------
    if (req.method === "POST" && /^\/[^/]+\/fulfilment$/.test(path)) {
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, 403);
      const id = decodeURIComponent(path.split("/")[1]);
      const val = await validateJson(req, fulfilmentSchema);
      if (!val.success) return val.response;
      const body = val.data;
      const { data: order } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        courier: text(body.courier ?? order.courier ?? "", 80),
        tracking_number: text(body.trackingNumber ?? order.tracking_number ?? "", 80),
        tracking_url: text(body.trackingUrl ?? order.tracking_url ?? "", 500),
        shipment_status: text(body.shipmentStatus ?? order.shipment_status ?? "not_created", 40),
        updated_at: now,
      };
      if (patch.shipment_status === "shipped" && !order.shipment_created_at) patch.shipment_created_at = now;
      await admin.from("orders").update(patch).eq("id", id);
      await audit(caller.id, "order.fulfilment_update", id, {
        courier: patch.courier,
        trackingNumber: patch.tracking_number,
        shipmentStatus: patch.shipment_status,
      });
      if (order.user_id && patch.tracking_number) {
        await createNotification(order.user_id, {
          type: "order",
          title: `Tracking added for ${id}`,
          message: `Courier: ${patch.courier || "N/A"}, Tracking #: ${patch.tracking_number}`,
          orderId: id,
        });
      }
      if (patch.tracking_number && patch.tracking_number !== order.tracking_number) {
        queueEmail({
          to: order.customer_email,
          ...trackingAdded(id, String(patch.courier), String(patch.tracking_number), String(patch.tracking_url)),
        });
      }
      const { data: updatedOrder } = await admin.from("orders").select("*").eq("id", id).single();
      return json(req, { order: orderRow(updatedOrder, await itemsOf(id)) });
    }

    // ---- DELETE /:id (admin only) --------------------------------------------
    if (req.method === "DELETE" && /^\/[^/]+$/.test(path)) {
      if (!isAdmin(caller)) return json(req, { error: "FORBIDDEN", message: "Admin permission required to delete orders." }, 403);
      const id = decodeURIComponent(path.slice(1));
      const { data: order } = await admin.from("orders").select("id, status, total, customer_email").eq("id", id).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      await audit(caller.id, "order.delete", id, { status: order.status, total: order.total, customerEmail: order.customer_email });
      await admin.from("orders").delete().eq("id", id);
      return json(req, { ok: true });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    return serverError(req, error);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleOrdersRequest(req));
}
