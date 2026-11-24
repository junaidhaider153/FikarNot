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

import { admin } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json, serverError } from "../_shared/http.ts";
import { getCaller, isStaff } from "../_shared/auth.ts";
import { queueEmail } from "../_shared/email.ts";
import { paymentConfirmed } from "../_shared/emailTemplates.ts";
import { validateJson, z } from "../_shared/validate.ts";
import { validateConfirmPayment, validatePaymentProofUpload } from "../_shared/orderLifecycle.ts";
import { limit } from "../_shared/rateLimit.ts";
import { hexToBytes, MAX_VIDEO_BYTES, validateVideoMetadata } from "../_shared/video.ts";

const uploadImageSchema = z.object({
  dataUrl: z.string().min(1, "Image data URL is required."),
  originalName: z.string().trim().max(255).optional(),
});

const paymentProofSchema = z.object({
  dataUrl: z.string().min(1, "Payment slip image is required."),
  originalName: z.string().trim().max(255).optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

const confirmPaymentSchema = z.object({
  requireProof: z.boolean().optional(),
  providerReference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

const videoSignedUrlSchema = z.object({
  originalName: z.string().trim().max(255).optional().default(""),
  mimeType: z.string().trim().min(1),
  byteSize: z.number().int().positive(),
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "SHA-256 must be a 64-character hex string.")
    .optional(),
  headerHex: z.string().trim().optional(),
});

const videoCompleteSchema = z.object({
  filename: z
    .string()
    .trim()
    .regex(/^vid-[0-9a-fA-F-]{36}\.(mp4|webm)$/, "Invalid video filename."),
  originalName: z.string().trim().max(255).optional().default(""),
  mimeType: z.enum(["video/mp4", "video/webm"]),
  byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "SHA-256 must be a 64-character hex string."),
});

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
  if (mimeType === "image/webp")
    return (
      buf.length >= 12 &&
      new TextDecoder().decode(buf.subarray(0, 4)) === "RIFF" &&
      new TextDecoder().decode(buf.subarray(8, 12)) === "WEBP"
    );
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
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// deno-lint-ignore no-explicit-any
const mediaRow = (row: any, usageCount = 0) => ({
  id: row.id,
  filename: row.filename,
  originalName: row.original_name,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  sha256: row.sha256,
  url: row.url,
  uploadedBy: row.uploaded_by || null,
  createdAt: row.created_at,
  usageCount: Number(usageCount),
});

async function mediaUsageCount(url: string) {
  const { data: products } = await admin.from("products").select("image, images_json");
  let count = 0;
  for (const row of products || []) {
    if (row.image === url) count += 1;
    count += (Array.isArray(row.images_json) ? row.images_json : []).filter((item: string) => item === url).length;
  }
  const { count: settingsCount } = await admin
    .from("site_settings")
    .select("key", { count: "exact", head: true })
    .eq("value", JSON.stringify(url));
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
      const val = await validateJson(req, uploadImageSchema, 12 * 1024 * 1024);
      if (!val.success) return val.response;
      const body = val.data;
      const decoded = decodeDataUrl(body.dataUrl);
      if (!decoded) return json(req, { error: "INVALID_IMAGE", message: "Only JPEG, PNG, WebP, or GIF images are accepted." }, 400);
      if (decoded.bytes.length > MAX_UPLOAD_BYTES)
        return json(req, { error: "IMAGE_TOO_LARGE", message: "Image is too large. Please use a file under 8MB." }, 413);
      if (!imageMatchesMagicBytes(decoded.mimeType, decoded.bytes))
        return json(req, { error: "INVALID_IMAGE_CONTENT", message: "The uploaded file does not match its declared image type." }, 400);

      const sha256 = await sha256Hex(decoded.bytes);
      const { data: existing } = await admin.from("media_assets").select("*").eq("sha256", sha256).maybeSingle();
      if (existing) return json(req, { url: existing.url, asset: mediaRow(existing, await mediaUsageCount(existing.url)) }, 201);

      const ext = ALLOWED_IMAGE_TYPES[decoded.mimeType];
      const filename = `img-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("media")
        .upload(filename, decoded.bytes, { contentType: decoded.mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: pub } = admin.storage.from("media").getPublicUrl(filename);
      const id = `media-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await admin.from("media_assets").insert({
        id,
        filename,
        original_name: String(body.originalName || "").slice(0, 255),
        mime_type: decoded.mimeType,
        byte_size: decoded.bytes.length,
        sha256,
        url: pub.publicUrl,
        uploaded_by: caller!.id,
        created_at: now,
      });
      await admin.from("audit_logs").insert({
        id: `audit-${crypto.randomUUID()}`,
        actor_user_id: caller!.id,
        action: "media.upload",
        entity_type: "media",
        entity_id: id,
        details_json: { byteSize: decoded.bytes.length, mimeType: decoded.mimeType },
      });
      const { data: saved } = await admin.from("media_assets").select("*").eq("id", id).single();
      return json(req, { url: saved.url, asset: mediaRow(saved, 0) }, 201);
    }

    // ---- POST /video/signed-url (staff — hero/site videos) ---------------------
    if (req.method === "POST" && path === "/video/signed-url") {
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);
      const limited = await limit(req, "video_upload", 20, 3600);
      if (limited) return limited;

      const val = await validateJson(req, videoSignedUrlSchema, 10 * 1024);
      if (!val.success) return val.response;
      const body = val.data;

      const headerBytes = body.headerHex ? hexToBytes(body.headerHex) : undefined;
      const check = validateVideoMetadata(body.mimeType, body.byteSize, headerBytes);
      if (!check.valid) {
        return json(req, { error: check.code!, message: check.message! }, check.status!);
      }

      if (body.sha256) {
        const { data: existing } = await admin.from("media_assets").select("*").eq("sha256", body.sha256.toLowerCase()).maybeSingle();
        if (existing) {
          return json(
            req,
            {
              alreadyExists: true,
              url: existing.url,
              asset: mediaRow(existing, await mediaUsageCount(existing.url)),
            },
            200,
          );
        }
      }

      const filename = `vid-${crypto.randomUUID()}.${check.ext}`;
      const { data: signedData, error: signError } = await admin.storage.from("media").createSignedUploadUrl(filename);
      if (signError) throw signError;

      const { data: pub } = admin.storage.from("media").getPublicUrl(filename);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const signedUrl = signedData.signedUrl.startsWith("http")
        ? signedData.signedUrl
        : `${supabaseUrl.replace(/\/$/, "")}/storage/v1${signedData.signedUrl.startsWith("/") ? "" : "/"}${signedData.signedUrl}`;

      return json(
        req,
        {
          alreadyExists: false,
          signedUrl,
          path: signedData.path,
          token: signedData.token,
          publicUrl: pub.publicUrl,
          filename,
          mimeType: body.mimeType,
          maxBytes: MAX_VIDEO_BYTES,
        },
        200,
      );
    }

    // ---- POST /video/complete (staff — register uploaded video) ----------------
    if (req.method === "POST" && path === "/video/complete") {
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);

      const val = await validateJson(req, videoCompleteSchema, 10 * 1024);
      if (!val.success) return val.response;
      const body = val.data;

      const sha256 = body.sha256.toLowerCase();
      const { data: existing } = await admin.from("media_assets").select("*").eq("sha256", sha256).maybeSingle();
      if (existing) {
        return json(req, { url: existing.url, asset: mediaRow(existing, await mediaUsageCount(existing.url)) }, 200);
      }

      const { data: pub } = admin.storage.from("media").getPublicUrl(body.filename);
      const id = `media-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await admin.from("media_assets").insert({
        id,
        filename: body.filename,
        original_name: body.originalName.slice(0, 255),
        mime_type: body.mimeType,
        byte_size: body.byteSize,
        sha256,
        url: pub.publicUrl,
        uploaded_by: caller!.id,
        created_at: now,
      });
      await admin.from("audit_logs").insert({
        id: `audit-${crypto.randomUUID()}`,
        actor_user_id: caller!.id,
        action: "media.upload",
        entity_type: "media",
        entity_id: id,
        details_json: { byteSize: body.byteSize, mimeType: body.mimeType, filename: body.filename },
      });
      const { data: saved } = await admin.from("media_assets").select("*").eq("id", id).single();
      return json(req, { url: saved.url, asset: mediaRow(saved, 0) }, 201);
    }

    // ---- POST /video (staff — direct binary upload fallback) ------------------
    if (req.method === "POST" && path === "/video") {
      const caller = await getCaller(req);
      if (!isStaff(caller)) return json(req, { error: "FORBIDDEN", message: "Staff permission required." }, caller ? 403 : 401);
      const limited = await limit(req, "video_upload", 20, 3600);
      if (limited) return limited;

      const rawMime = String(req.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const buffer = new Uint8Array(await req.arrayBuffer());
      const headerBytes = buffer.subarray(0, 16);
      const check = validateVideoMetadata(rawMime, buffer.length, headerBytes);
      if (!check.valid) {
        return json(req, { error: check.code!, message: check.message! }, check.status!);
      }

      const sha256 = await sha256Hex(buffer);
      const { data: existing } = await admin.from("media_assets").select("*").eq("sha256", sha256).maybeSingle();
      if (existing) {
        return json(req, { url: existing.url, asset: mediaRow(existing, await mediaUsageCount(existing.url)) }, 200);
      }

      const filename = `vid-${crypto.randomUUID()}.${check.ext}`;
      const { error: uploadError } = await admin.storage.from("media").upload(filename, buffer, { contentType: rawMime, upsert: false });
      if (uploadError) throw uploadError;

      const { data: pub } = admin.storage.from("media").getPublicUrl(filename);
      const id = `media-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const originalName = decodeURIComponent(String(req.headers.get("x-original-name") || "")).slice(0, 255);
      await admin.from("media_assets").insert({
        id,
        filename,
        original_name: originalName,
        mime_type: rawMime,
        byte_size: buffer.length,
        sha256,
        url: pub.publicUrl,
        uploaded_by: caller!.id,
        created_at: now,
      });
      await admin.from("audit_logs").insert({
        id: `audit-${crypto.randomUUID()}`,
        actor_user_id: caller!.id,
        action: "media.upload",
        entity_type: "media",
        entity_id: id,
        details_json: { byteSize: buffer.length, mimeType: rawMime, filename },
      });
      const { data: saved } = await admin.from("media_assets").select("*").eq("id", id).single();
      return json(req, { url: saved.url, asset: mediaRow(saved, 0) }, 201);
    }

    // ---- Media library (admin only) -------------------------------------------
    if (path === "/media" || path.startsWith("/media/")) {
      const caller = await getCaller(req);
      if (!caller || caller.role !== "admin")
        return json(req, { error: "FORBIDDEN", message: "Admin permission required." }, caller ? 403 : 401);

      if (req.method === "GET" && path === "/media") {
        const rawLimit = Number(url.searchParams.get("limit"));
        const rawOffset = Number(url.searchParams.get("offset"));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 24;
        const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
        const { data, count, error } = await admin
          .from("media_assets")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        const assets = await Promise.all((data || []).map(async (row) => mediaRow(row, await mediaUsageCount(row.url))));
        return json(req, { assets, total: count ?? 0, limit, offset });
      }
      if (req.method === "DELETE" && path.startsWith("/media/")) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        const { data: rowData } = await admin.from("media_assets").select("*").eq("id", id).maybeSingle();
        if (!rowData) return json(req, { error: "MEDIA_NOT_FOUND", message: "Media asset not found." }, 404);
        const usage = await mediaUsageCount(rowData.url);
        if (usage > 0)
          return json(
            req,
            {
              error: "MEDIA_IN_USE",
              message: `This image is currently used in ${usage} place${usage === 1 ? "" : "s"}. Remove those references first.`,
            },
            409,
          );
        await admin.storage.from("media").remove([rowData.filename]);
        await admin.from("media_assets").delete().eq("id", id);
        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "media.delete",
          entity_type: "media",
          entity_id: id,
        });
        return json(req, { ok: true });
      }
    }

    // ---- Payment proof upload (order owner) ------------------------------------
    if (req.method === "POST" && path.startsWith("/payment-proof/")) {
      const orderId = decodeURIComponent(path.split("/")[2]);
      const caller = await getCaller(req);
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      const proofCheck = validatePaymentProofUpload(order);
      if (!proofCheck.allowed) {
        return json(req, { error: proofCheck.code!, message: proofCheck.message! }, proofCheck.status!);
      }
      if (!caller || caller.id !== order.user_id)
        return json(req, { error: "FORBIDDEN", message: "This order cannot accept a payment slip from this account." }, 403);

      const val = await validateJson(req, paymentProofSchema, 5 * 1024 * 1024);
      if (!val.success) return val.response;
      const body = val.data;
      const decoded = decodeDataUrl(body.dataUrl);
      if (!decoded)
        return json(req, { error: "INVALID_PAYMENT_PROOF", message: "Only JPEG, PNG, WebP, or GIF payment slips are accepted." }, 400);
      if (!decoded.bytes.length || decoded.bytes.length > MAX_PAYMENT_PROOF_BYTES)
        return json(req, { error: "PAYMENT_PROOF_TOO_LARGE", message: "Payment slip must be a valid image under 3MB." }, 413);
      if (!imageMatchesMagicBytes(decoded.mimeType, decoded.bytes))
        return json(
          req,
          { error: "INVALID_PAYMENT_PROOF_CONTENT", message: "The payment slip does not match its declared image type." },
          400,
        );

      const { data: existingForOrder } = await admin.from("payment_proofs").select("id").eq("order_id", orderId).maybeSingle();
      if (existingForOrder)
        return json(req, { error: "PAYMENT_PROOF_EXISTS", message: "A payment slip has already been submitted for this order." }, 409);
      const sha256 = await sha256Hex(decoded.bytes);
      const { data: dupe } = await admin.from("payment_proofs").select("id").eq("sha256", sha256).maybeSingle();
      if (dupe) return json(req, { error: "PAYMENT_PROOF_DUPLICATE", message: "This payment image has already been submitted." }, 409);

      const ext = ALLOWED_IMAGE_TYPES[decoded.mimeType];
      const filename = `${orderId}/proof-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("payment-proofs")
        .upload(filename, decoded.bytes, { contentType: decoded.mimeType, upsert: false });
      if (uploadError) throw uploadError;

      const id = `proof-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await admin.from("payment_proofs").insert({
        id,
        order_id: orderId,
        original_name: String(body.originalName || "").slice(0, 255),
        filename,
        mime_type: decoded.mimeType,
        byte_size: decoded.bytes.length,
        sha256,
        uploaded_by: caller.id,
        created_at: now,
      });

      // Update or record the transaction reference and customer note
      if (body.reference || body.note) {
        const { data: existingPayment } = await admin.from("payments").select("id").eq("order_id", orderId).maybeSingle();

        if (existingPayment) {
          await admin
            .from("payments")
            .update({
              provider_payment_id: body.reference ? body.reference.trim() : undefined,
              raw_status: body.note ? body.note.trim() : undefined,
              updated_at: now,
            })
            .eq("id", existingPayment.id);
        } else {
          await admin.from("payments").insert({
            id: `pay-${crypto.randomUUID()}`,
            order_id: orderId,
            provider: order.payment_method || "manual",
            provider_payment_id: body.reference?.trim() || null,
            amount: Number(order.total),
            currency: order.currency || "PKR",
            status: "pending",
            raw_status: body.note?.trim() || "Customer submitted reference",
            created_at: now,
            updated_at: now,
          });
        }
      }

      await admin.from("audit_logs").insert({
        id: `audit-${crypto.randomUUID()}`,
        actor_user_id: caller.id,
        action: "payment.proof_upload",
        entity_type: "order",
        entity_id: orderId,
        details_json: {
          proofId: id,
          byteSize: decoded.bytes.length,
          reference: body.reference || null,
          note: body.note || null,
        },
      });
      return json(
        req,
        {
          proof: {
            id,
            originalName: String(body.originalName || ""),
            mimeType: decoded.mimeType,
            byteSize: decoded.bytes.length,
            status: "submitted",
            reference: body.reference || null,
            note: body.note || null,
          },
        },
        201,
      );
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
      const val = await validateJson(req, confirmPaymentSchema);
      if (!val.success) return val.response;
      const body = val.data;
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json(req, { error: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      const confirmCheck = validateConfirmPayment(order);
      if (!confirmCheck.allowed) {
        return json(req, { error: confirmCheck.code!, message: confirmCheck.message! }, confirmCheck.status!);
      }
      const { data: proof } = await admin.from("payment_proofs").select("id").eq("order_id", orderId).maybeSingle();
      if (!proof && body.requireProof !== false)
        return json(req, { error: "PAYMENT_PROOF_REQUIRED", message: "Review the payment slip before confirming this payment." }, 409);

      const now = new Date().toISOString();
      const { data: payment } = await admin
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payment) {
        await admin
          .from("payments")
          .update({
            status: "paid",
            provider_payment_id: String(body.providerReference || "").trim() || `manual-${orderId}`,
            raw_status: String(body.note || "Verified by staff"),
            updated_at: now,
          })
          .eq("id", payment.id);
      } else {
        await admin.from("payments").insert({
          id: `pay-${crypto.randomUUID()}`,
          order_id: orderId,
          provider: "manual",
          provider_payment_id: String(body.providerReference || "").trim() || `manual-${orderId}`,
          amount: order.total,
          currency: order.currency || "PKR",
          status: "paid",
          raw_status: String(body.note || "Verified by staff"),
          created_at: now,
          updated_at: now,
        });
      }
      await admin
        .from("orders")
        .update({
          status: "processing",
          payment_status: "paid",
          payment_proof_token_hash: null,
          payment_proof_token_expires_at: null,
          updated_at: now,
        })
        .eq("id", orderId);
      await admin.from("audit_logs").insert({
        id: `audit-${crypto.randomUUID()}`,
        actor_user_id: caller!.id,
        action: "payment.confirm",
        entity_type: "order",
        entity_id: orderId,
        details_json: { method: order.payment_method, providerReference: String(body.providerReference || "").trim() || null },
      });
      if (order.user_id)
        await admin.from("notifications").insert({
          id: `n-${crypto.randomUUID()}`,
          user_id: order.user_id,
          type: "order",
          title: `Payment confirmed for ${orderId}`,
          message: "Your payment was verified and your order is now being prepared.",
          link: "/account",
          order_id: orderId,
          read: false,
        });
      queueEmail({ to: order.customer_email, ...paymentConfirmed(orderId) });
      return json(req, {
        ok: true,
        orderPatch: {
          id: orderId,
          status: "processing",
          paymentStatus: "paid",
          paymentReference: String(body.providerReference || "").trim() || `manual-${orderId}`,
          paymentNote: String(body.note || "Verified by staff"),
        },
      });
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return serverError(req, error);
  }
});
