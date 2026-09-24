// FikarNot account Edge Function.
// Ported from server/index.js:
//   GET  /api/auth/me + GET /api/account/state    -> GET  /            (merged into one call)
//   PUT  /api/account/state                        -> PUT  /state
//   PUT  /api/account/addresses                     -> PUT  /addresses
//   DELETE /api/account/addresses/:id                -> DELETE /addresses/:id
//   POST /api/auth/delete-account                    -> POST /delete-account
//   GET  /api/users (admin)                          -> GET  /users
//   POST /api/users (admin)                          -> POST /users
//   POST /api/users/:id/role (admin)                  -> POST /users/:id/role
//   DELETE /api/users/:id (admin)                      -> DELETE /users/:id
//
// Everything under /api/auth/* in the old server (register, login, logout,
// verify-email, forgot/reset-password, 2FA) is now handled directly by the
// frontend calling supabase-js against Supabase Auth — no backend code
// needed for those anymore.
//
// Deployed with verify_jwt=false: every route here still requires auth, but
// we check it manually (via getCaller()) so we control the error shape,
// same as the old requireUser() helper.

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
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

type Caller = { id: string; email: string; createdAt: string; name: string; role: string };

// Resolves + requires the caller. Every route in this function needs auth
// (unlike catalog's GET /, there's no anonymous path here).
async function getCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: profile } = await admin.from("profiles").select("name, role").eq("id", userData.user.id).maybeSingle();
  if (!profile) return null;
  return {
    id: userData.user.id,
    email: userData.user.email || "",
    createdAt: userData.user.created_at,
    name: profile.name,
    role: profile.role,
  };
}

const isAdmin = (caller: Caller) => caller.role === "admin";

// deno-lint-ignore no-explicit-any
const addressRow = (row: any) => ({
  id: row.id,
  label: row.label,
  name: row.name,
  line1: row.line1,
  city: row.city,
  region: row.region,
  postalCode: row.postal_code,
  country: row.country,
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// deno-lint-ignore no-explicit-any
const safeUser = (profile: any, authUser: any) => ({
  id: profile.id,
  name: profile.name,
  email: authUser?.email || "",
  role: profile.role,
  createdAt: profile.created_at,
  emailVerifiedAt: authUser?.email_confirmed_at || null,
});

async function getAddresses(userId: string) {
  const { data } = await admin
    .from("customer_addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  return (data || []).map(addressRow);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?account/, "") || "/";

  try {
    const caller = await getCaller(req);
    if (!caller) return json(req, { error: "AUTH_REQUIRED", message: "Authentication required." }, 401);

    // ---- GET /  (merged old /api/auth/me + /api/account/state) -----------
    if (req.method === "GET" && path === "/") {
      const [{ data: stateRow }, addresses] = await Promise.all([
        admin.from("customer_state").select("*").eq("user_id", caller.id).maybeSingle(),
        getAddresses(caller.id),
      ]);
      return json(req, {
        user: { id: caller.id, name: caller.name, email: caller.email, role: caller.role, createdAt: caller.createdAt },
        cart: stateRow?.cart_json ?? [],
        wishlist: stateRow?.wishlist_json ?? [],
        recentlyViewed: stateRow?.recently_viewed_json ?? [],
        comparison: (stateRow?.comparison_json ?? []).slice(0, 3),
        updatedAt: stateRow?.updated_at ?? null,
        addresses,
      });
    }

    // ---- PATCH /profile (update own name / email) --------------------------
    if (req.method === "PATCH" && path === "/profile") {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || "").trim();
      if (name.length < 2) return json(req, { error: "INVALID_NAME", message: "Name must be at least 2 characters." }, 400);
      await admin.from("profiles").update({ name, updated_at: new Date().toISOString() }).eq("id", caller.id);
      const { data: authUser } = await admin.auth.admin.getUserById(caller.id);
      return json(req, { user: { id: caller.id, name, email: authUser?.user?.email || caller.email, role: caller.role, createdAt: caller.createdAt } });
    }

    // ---- PUT /state --------------------------------------------------------
    if (req.method === "PUT" && path === "/state") {
      const body = await req.json().catch(() => ({}));
      const cart = Array.isArray(body.cart) ? body.cart : [];
      const wishlist = Array.isArray(body.wishlist) ? body.wishlist : [];
      const recentlyViewed = Array.isArray(body.recentlyViewed) ? body.recentlyViewed.slice(0, 8) : [];
      const comparison = Array.isArray(body.comparison) ? body.comparison.slice(0, 3) : [];
      const now = new Date().toISOString();
      const { data: saved, error } = await admin
        .from("customer_state")
        .upsert(
          { user_id: caller.id, cart_json: cart, wishlist_json: wishlist, recently_viewed_json: recentlyViewed, comparison_json: comparison, updated_at: now },
          { onConflict: "user_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return json(req, {
        ok: true,
        cart: saved.cart_json,
        wishlist: saved.wishlist_json,
        recentlyViewed: saved.recently_viewed_json,
        comparison: saved.comparison_json,
        updatedAt: saved.updated_at,
      });
    }

    // ---- PUT /addresses (create or update one address) ---------------------
    if (req.method === "PUT" && path === "/addresses") {
      const body = await req.json().catch(() => ({}));
      const address = body.address || {};
      if (!String(address.name || "").trim() || !String(address.line1 || "").trim() || !String(address.city || "").trim() || !String(address.country || "").trim()) {
        return json(req, { error: "INVALID_ADDRESS", message: "Name, address, city and country are required." }, 400);
      }
      const id = String(address.id || `addr-${crypto.randomUUID()}`);
      const now = new Date().toISOString();

      if (address.isDefault) {
        await admin.from("customer_addresses").update({ is_default: false }).eq("user_id", caller.id);
      }
      const { error: upsertError } = await admin.from("customer_addresses").upsert(
        {
          id,
          user_id: caller.id,
          label: String(address.label || "Home").trim(),
          name: String(address.name).trim(),
          line1: String(address.line1).trim(),
          city: String(address.city).trim(),
          region: String(address.region || "").trim(),
          postal_code: String(address.postalCode || "").trim(),
          country: String(address.country).trim(),
          is_default: Boolean(address.isDefault),
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (upsertError) throw upsertError;

      const { count } = await admin.from("customer_addresses").select("id", { count: "exact", head: true }).eq("user_id", caller.id);
      if (count === 1) await admin.from("customer_addresses").update({ is_default: true }).eq("user_id", caller.id).eq("id", id);

      const addresses = await getAddresses(caller.id);
      return json(req, { address: addresses.find((a) => a.id === id), addresses });
    }

    // ---- DELETE /addresses/:id ---------------------------------------------
    if (req.method === "DELETE" && path.startsWith("/addresses/")) {
      const id = decodeURIComponent(path.split("/").pop() || "");
      const { data: existing } = await admin.from("customer_addresses").select("id").eq("id", id).eq("user_id", caller.id).maybeSingle();
      if (!existing) return json(req, { error: "ADDRESS_NOT_FOUND", message: "Address not found." }, 404);
      await admin.from("customer_addresses").delete().eq("id", id).eq("user_id", caller.id);

      const { count } = await admin.from("customer_addresses").select("id", { count: "exact", head: true }).eq("user_id", caller.id);
      const { data: hasDefault } = await admin.from("customer_addresses").select("id").eq("user_id", caller.id).eq("is_default", true).maybeSingle();
      if ((count || 0) > 0 && !hasDefault) {
        const { data: next } = await admin.from("customer_addresses").select("id").eq("user_id", caller.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (next) await admin.from("customer_addresses").update({ is_default: true }).eq("id", next.id).eq("user_id", caller.id);
      }
      return json(req, { addresses: await getAddresses(caller.id) });
    }

    // ---- POST /delete-account (self-delete, customers only) ----------------
    if (req.method === "POST" && path === "/delete-account") {
      if (["admin", "editor"].includes(caller.role)) {
        return json(req, { error: "STAFF_DELETE_BLOCKED", message: "Staff accounts cannot be deleted here." }, 403);
      }
      const body = await req.json().catch(() => ({}));
      // No password check here (Supabase Auth owns passwords, not us) — the
      // caller's valid JWT already proves they're signed in as this account.
      if (String(body.confirmationText || "") !== "DELETE") {
        return json(req, { error: "CONFIRMATION_REQUIRED", message: "Type DELETE to confirm." }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(caller.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    // Everything below is admin-only user management.
    if (path === "/users" || path.startsWith("/users/")) {
      if (!isAdmin(caller)) return json(req, { error: "FORBIDDEN", message: "Admin permission required." }, 403);

      // ---- GET /users -------------------------------------------------------
      if (req.method === "GET" && path === "/users") {
        const rawLimit = Number(url.searchParams.get("limit"));
        const rawOffset = Number(url.searchParams.get("offset"));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.floor(rawLimit)) : 200;
        const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

        const { data: profiles, count, error } = await admin
          .from("profiles")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;

        const users = await Promise.all(
          (profiles || []).map(async (p) => {
            const { data } = await admin.auth.admin.getUserById(p.id);
            return safeUser(p, data?.user);
          }),
        );
        return json(req, { users, total: count ?? 0, limit, offset });
      }

      // ---- POST /users (create or update) ------------------------------------
      if (req.method === "POST" && path === "/users") {
        const body = await req.json().catch(() => ({}));
        const payload = body.user || {};
        const name = String(payload.name || "").trim();
        const email = String(payload.email || "").trim().toLowerCase();
        const role = ["customer", "editor", "admin"].includes(payload.role) ? payload.role : "customer";
        const password = payload.password == null ? "" : String(payload.password);
        const existingId = payload.id ? String(payload.id) : null;

        if (name.length < 2) return json(req, { error: "INVALID_NAME", message: "Name must be at least 2 characters." }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "INVALID_EMAIL", message: "Enter a valid email address." }, 400);

        if (existingId) {
          const { data: existingProfile } = await admin.from("profiles").select("*").eq("id", existingId).maybeSingle();
          if (!existingProfile) return json(req, { error: "USER_NOT_FOUND", message: "User not found." }, 404);
          if (password && password.length < 8) return json(req, { error: "WEAK_PASSWORD", message: "Password must be at least 8 characters." }, 400);
          if (caller.id === existingId && role !== existingProfile.role) {
            return json(req, { error: "SELF_ROLE_CHANGE", message: "You cannot change your own role." }, 400);
          }

          const authUpdate: Record<string, unknown> = { email, user_metadata: { name } };
          if (password) authUpdate.password = password;
          const { error: updateAuthError } = await admin.auth.admin.updateUserById(existingId, authUpdate);
          if (updateAuthError) {
            return json(req, { error: "EMAIL_IN_USE", message: updateAuthError.message }, 409);
          }
          await admin.from("profiles").update({ name, role, updated_at: new Date().toISOString() }).eq("id", existingId);

          await admin.from("audit_logs").insert({
            id: `audit-${crypto.randomUUID()}`,
            actor_user_id: caller.id,
            action: "user.update",
            entity_type: "user",
            entity_id: existingId,
            details_json: { role, changed: { role: role !== existingProfile.role, email: true, password: Boolean(password) } },
          });

          const { data: authUser } = await admin.auth.admin.getUserById(existingId);
          return json(req, { user: safeUser({ ...existingProfile, name, role }, authUser?.user) });
        }

        if (!password || password.length < 8) {
          return json(req, { error: "WEAK_PASSWORD", message: "A password of at least 8 characters is required." }, 400);
        }
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (createError) return json(req, { error: "EMAIL_IN_USE", message: createError.message }, 409);
        if (role !== "customer") await admin.from("profiles").update({ role }).eq("id", created.user!.id);

        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "user.create",
          entity_type: "user",
          entity_id: created.user!.id,
          details_json: { role },
        });

        const { data: savedProfile } = await admin.from("profiles").select("*").eq("id", created.user!.id).single();
        return json(req, { user: safeUser(savedProfile, created.user) }, 201);
      }

      // ---- POST /users/:id/role ------------------------------------------------
      if (req.method === "POST" && /^\/users\/[^/]+\/role$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[2]);
        const body = await req.json().catch(() => ({}));
        if (!["customer", "editor", "admin"].includes(body.role)) {
          return json(req, { error: "INVALID_ROLE", message: "Invalid user role." }, 400);
        }
        if (id === caller.id) return json(req, { error: "SELF_ROLE_CHANGE", message: "You cannot change your own role." }, 400);
        const { data: updated, error } = await admin.from("profiles").update({ role: body.role, updated_at: new Date().toISOString() }).eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!updated) return json(req, { error: "USER_NOT_FOUND", message: "User not found." }, 404);

        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "user.role_change",
          entity_type: "user",
          entity_id: id,
          details_json: { role: body.role },
        });

        const { data: authUser } = await admin.auth.admin.getUserById(id);
        return json(req, { user: safeUser(updated, authUser?.user) });
      }

      // ---- DELETE /users/:id ----------------------------------------------------
      if (req.method === "DELETE" && /^\/users\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/").pop() || "");
        if (id === caller.id) return json(req, { error: "SELF_DELETE_BLOCKED", message: "You cannot delete yourself." }, 400);
        const { data: target } = await admin.from("profiles").select("id, role").eq("id", id).maybeSingle();
        if (!target) return json(req, { error: "USER_NOT_FOUND", message: "User not found." }, 404);
        if (target.role === "admin") return json(req, { error: "ADMIN_DELETE_BLOCKED", message: "Admin accounts cannot be deleted from this screen." }, 403);

        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;

        await admin.from("audit_logs").insert({
          id: `audit-${crypto.randomUUID()}`,
          actor_user_id: caller.id,
          action: "user.delete",
          entity_type: "user",
          entity_id: id,
        });
        return json(req, { ok: true });
      }
    }

    return json(req, { error: "NOT_FOUND", message: "Route not found." }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "SERVER_ERROR", message: (error as Error).message || "Internal server error." }, 500);
  }
});
