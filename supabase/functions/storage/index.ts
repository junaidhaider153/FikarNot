// FikarNot storage Edge Function.
// Ported from server/index.js:
//   POST /api/uploads/image                        -> POST /image                 (staff, product/site images)
//   GET  /api/media (admin)                           -> GET  /media
//   DELETE /api/media/:id (admin)                        -> DELETE /media/:id
//   POST /api/orders/:id/payment-proof                     -> POST /payment-proof/:orderId
//   GET  /api/admin/orders/:id/payment-proof (staff)          -> GET  /payment-proof/:orderId  (returns a signed URL)
//   POST /api/admin/orders/:id/confirm-payment (staff)          -> POST /confirm-payment/:orderId
//
// Files are stored in two Supabase Storage buckets: "media" (public,
// product/site images) and "payment-proofs" (private, manual payment slips).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const ALLOWED_ORIGINS = (Deno.env.get("FIKARNOT_FRONTEND_ORIGIN") || "http://localhost:5173")
  .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" };
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

const ALLOWED_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=]+)$/;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PAYMENT_PROOF_BYTES = 3 * 1024 * 1024;

function imageMatchesMagicBytes(mimeType: string, buf: Uint8Array): boolean {
  if (mimeType === "image/jpeg") return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mimeType === "image/png") return buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b);
  if (mimeType === "image/gif") {
    const sig = new TextDecoder().decode(buf.subarray(0, 6));
    return sig === "GIF87a" || sig === "GIF89a";
  }
  if (mimeType === "image/webp") return buf.length >= 12 && new TextDecoder().decode(buf.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(buf.subarray(8, 12)) === "WEBP";
  return false;
}

function decodeDataUrl(dataUrl: string) {
  const match = DATA_URL_RE.exec(String(dataUrl || "").trim());
  if (!match) return null;
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mimeType, bytes };
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
const mediaRow = (row: any, usageCount = 0) => ({
  id: row.id, filename: row.filename, originalName: row.original_name, mimeType: row.mime_type,
  byteSize: Number(row.byte_size), sha256: row.sha256, url: row.url, uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at, usageCount: Number(usageCount),
});

async function mediaUsageCount(url: string) {
  const { data: products } = await admin.from("products").select("image, images_json");
  let count = 0;
  for (const row of products || []) {
    if (row.image === url) count += 1;
    count += (Array.isArray(row.images_json) ? row.images_json : []).filter((item: string) => item === url).length;
  }
  const { count: settingsCount } = await admin.from("site_settings").select("key", { count: "exact", head: true }).eq("value", JSON.stringify(url));
  return count + (settingsCount || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?storage/, "") || "/";

  try {
    // ---- POST /image  (staff — product/site images) -------------------------
    if (req.method === "POST" && path === "/image") {
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);
      const body = await req.json().catch(() => ({}));
      const decoded = decodeDataUrl(body.dataUrl);
      if (!decoded) return json(req, { error: "INVALID_IMAGE", message: "Only JPEG, PNG, WebP, or GIF images are accepted." }, 400);
      if (decoded.bytes.length > MAX_UPLOAD_BYTES) return json(req, { error: "IMAGE_TOO_LARGE", message: "Image is too large. Please use a file under 8MB." }, 413);
      if (!imageMatchesMagicBytes(decoded.mimeType, decoded.bytes)) return json(req, { error: "INVALID_IMAGE_CONTENT", message: "The uploaded file does not match its declared image type." }, 400);

      const sha256 = await sha256Hex(decoded.bytes);
      const { data: existing } = await admin.from("media_assets").select("*").eq("sha256", sha256).maybeSingle();
      if (existing) return json(req, { url: existing.url, asset: mediaRow(existing, await mediaUsageCount(existing.url)) }, 201);

      const ext = ALLOWED_IMAGE_TYPES[decoded.mimeType];
      const filename = `img-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage.from("media").upload(filename, decoded.bytes, { contentType: decoded.mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: pub } = admin.storage.from("media").getPublicUrl(filename);
      const id = `media-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await admin.from("media_assets").insert({ id, filename, original_name: String(body.originalName || "").slice(0, 255), mime_type: decoded.mimeType, byte_size: decoded.bytes.length, sha256, url: pub.publicUrl, uploaded_by: caller!.id, created_at: now });
      await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller!.id, action: "media.upload", entity_type: "media", entity_id: id, details_json: { byteSize: decoded.bytes.length, mimeType: decoded.mimeType } });
      const { data: saved } = await admin.from("media_assets").select("*").eq("id", id).single();
      return json(req, { url: saved.url, asset: mediaRow(saved, 0) }, 201);
    }

    // ---- Media library (admin only) -------------------------------------------
    if (path === "/media" || path.startsWith("/media/")) {
      const caller = await getCaller(req);
      if (!caller || caller.role !== "admin") return json(req, { error: "FORBIDDEN", message: "Admin permission required." }, caller ? 403 : 401);

      if (req.method === "GET" && path === "/media") {
        const rawLimit = Number(url.searchParams.get("limit"));
        const rawOffset = Number(url.searchParams.get("offset"));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 24;
        const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
        const { data, count, error } = await admin.from("media_assets").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (error) throw error;
        const assets = await Promise.all((data || []).map(async (row) => mediaRow(row, await mediaUsageCount(row.url))));
        return json(req, { assets, total: count ?? 0, limit, offset });
      }
      if (req.method === "DELETE" && path.startsWith("/media/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { data: rowData } = await admin.from("media_assets").select("*").eq("id", id).maybeSingle();
        if (!rowData) return json(req, { error: "MEDIA_NOT_FOUND", message: "Media asset not found." }, 404);
        const usage = await mediaUsageCount(rowData.url);
        if (usage > 0) return json(req, { error: "MEDIA_IN_USE", message: `This image is currently used in ${usage} place${usage === 1 ? "" : "s"}. Remove those references first.` }, 409);
        await admin.storage.from("media").remove([rowData.filename]);
        await admin.from("media_assets").delete().eq("id", id);
        await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller.id, action: "media.delete", entity_type: "media", entity_id: id });
        return json(req, { ok: true });
      }
    }

    // ---- Payment proof upload (order owner) ------------------------------------
    if (req.method === "POST" && path.startsWith("/payment-proof/")) {
      const orderId = decodeURIComponent(path.split("/")[2]);
      const caller = await getCaller(req);
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (!["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method) || order.payment_status !== "pending") {
        return json(req, { error: "PAYMENT_PROOF_NOT_ALLOWED", message: "A payment slip is only accepted for a pending manual payment." }, 409);
      }
      if (!caller || caller.id !== order.user_id) return json(req, { error: "FORBIDDEN", message: "This order cannot accept a payment slip from this account." }, 403);

      const body = await req.json().catch(() => ({}));
      const decoded = decodeDataUrl(body.dataUrl);
      if (!decoded) return json(req, { error: "INVALID_PAYMENT_PROOF", message: "Only JPEG, PNG, WebP, or GIF payment slips are accepted." }, 400);
      if (!decoded.bytes.length || decoded.bytes.length > MAX_PAYMENT_PROOF_BYTES) return json(req, { error: "PAYMENT_PROOF_TOO_LARGE", message: "Payment slip must be a valid image under 3MB." }, 413);
      if (!imageMatchesMagicBytes(decoded.mimeType, decoded.bytes)) return json(req, { error: "INVALID_PAYMENT_PROOF_CONTENT", message: "The payment slip does not match its declared image type." }, 400);

      const { data: existingForOrder } = await admin.from("payment_proofs").select("id").eq("order_id", orderId).maybeSingle();
      if (existingForOrder) return json(req, { error: "PAYMENT_PROOF_EXISTS", message: "A payment slip has already been submitted for this order." }, 409);
      const sha256 = await sha256Hex(decoded.bytes);
      const { data: dupe } = await admin.from("payment_proofs").select("id").eq("sha256", sha256).maybeSingle();
      if (dupe) return json(req, { error: "PAYMENT_PROOF_DUPLICATE", message: "This payment image has already been submitted." }, 409);

      const ext = ALLOWED_IMAGE_TYPES[decoded.mimeType];
      const filename = `${orderId}/proof-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage.from("payment-proofs").upload(filename, decoded.bytes, { contentType: decoded.mimeType, upsert: false });
      if (uploadError) throw uploadError;

      const id = `proof-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await admin.from("payment_proofs").insert({ id, order_id: orderId, original_name: String(body.originalName || "").slice(0, 255), filename, mime_type: decoded.mimeType, byte_size: decoded.bytes.length, sha256, uploaded_by: caller.id, created_at: now });
      await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller.id, action: "payment.proof_upload", entity_type: "order", entity_id: orderId, details_json: { proofId: id, byteSize: decoded.bytes.length } });
      return json(req, { proof: { id, originalName: String(body.originalName || ""), mimeType: decoded.mimeType, byteSize: decoded.bytes.length, status: "submitted" } }, 201);
    }

    // Everything below is staff-only.
    const caller = await getCaller(req);
    if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);

    // ---- GET /payment-proof/:orderId  (staff — signed URL) --------------------
    if (req.method === "GET" && path.startsWith("/payment-proof/")) {
      const orderId = decodeURIComponent(path.split("/")[2]);
      const { data: proof } = await admin.from("payment_proofs").select("*").eq("order_id", orderId).maybeSingle();
      if (!proof) return json(req, { error: "PAYMENT_PROOF_NOT_FOUND", message: "No payment slip has been submitted." }, 404);
      const { data: signed, error } = await admin.storage.from("payment-proofs").createSignedUrl(proof.filename, 300);
      if (error) throw error;
      return json(req, { url: signed.signedUrl, mimeType: proof.mime_type, originalName: proof.original_name, expiresIn: 300 });
    }

    // ---- POST /confirm-payment/:orderId  (staff) -------------------------------
    if (req.method === "POST" && path.startsWith("/confirm-payment/")) {
      const orderId = decodeURIComponent(path.split("/")[2]);
      const body = await req.json().catch(() => ({}));
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      if (!["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method)) return json(req, { error: "INVALID_MANUAL_PAYMENT", message: "Only manual payment orders can be confirmed here." }, 400);
      if (order.payment_status === "paid") return json(req, { ok: true, alreadyConfirmed: true });
      const { data: proof } = await admin.from("payment_proofs").select("id").eq("order_id", orderId).maybeSingle();
      if (!proof && body.requireProof !== false) return json(req, { error: "PAYMENT_PROOF_REQUIRED", message: "Review the payment slip before confirming this payment." }, 409);

      const now = new Date().toISOString();
      const { data: payment } = await admin.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (payment) {
        await admin.from("payments").update({ status: "paid", provider_payment_id: String(body.providerReference || "").trim() || `manual-${orderId}`, raw_status: String(body.note || "Verified by staff"), updated_at: now }).eq("id", payment.id);
      } else {
        await admin.from("payments").insert({ id: `pay-${crypto.randomUUID()}`, order_id: orderId, provider: "manual", provider_payment_id: String(body.providerReference || "").trim() || `manual-${orderId}`, amount: order.total, currency: order.currency || "PKR", status: "paid", raw_status: String(body.note || "Verified by staff"), created_at: now, updated_at: now });
      }
      await admin.from("orders").update({ status: "processing", payment_status: "paid", payment_proof_token_hash: null, payment_proof_token_expires_at: null, updated_at: now }).eq("id", orderId);
      await admin.from("audit_logs").insert({ id: `audit-${crypto.randomUUID()}`, actor_user_id: caller!.id, action: "payment.confirm", entity_type: "order", entity_id: orderId, details_json: { method: order.payment_method, providerReference: String(body.providerReference || "").trim() || null } });
      if (order.user_id) await admin.from("notifications").insert({ id: `n-${crypto.randomUUID()}`, user_id: order.user_id, type: "order", title: `Payment confirmed for ${orderId}`, message: "Your payment was verified and your order is now being prepared.", link: "/account", order_id: orderId, read: false });
      return json(req, { ok: true });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "SERVER_ERROR", message: (error as Error).message || "Internal server error." }, 500);
  }
});
