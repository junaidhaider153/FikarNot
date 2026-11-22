# FikarNot — Technical Design Document (TDD)

> **Errata (November 2026 review).** This document predates the review in `docs/REVIEW_AND_STATUS.md`. Where it conflicts, the review, `AGENTS.md` and `ROADMAP.md` win. Known corrections: (1) commerce email uses the **Gmail REST API over HTTPS**, not SMTP — Edge Functions cannot use ports 25/587; Supabase Auth keeps Gmail SMTP on port 465; (2) **12** tables lacked RLS, now fixed by migration 0004; (3) guests may check out with **Cash on Delivery only**; (4) refunds and order deletion are **admin-only**; (5) the CORS env var is `ALLOWED_ORIGINS` (legacy `FIKARNOT_FRONTEND_ORIGIN` still accepted); (6) zod validation and TanStack Query are **planned, not present**.

**Document Version:** 2.0  
**Scope:** System Architecture, Database Security Matrix, Shared Edge Function Design, Gmail 2FA Email Module, and Frontend Refactor Blueprint

---

## 1. System Architecture Overview

```
+-------------------------------------------------------------------+
|                   VERCEL (React 19 + Vite 8 SPA)                  |
|  Pages -> TanStack Query -> src/api/* -> apiClient.js             |
|     |                                        |                    |
|     | Auth / MFA (TOTP)                      | HTTPS + Bearer JWT |
|     v                                        v                    |
+-----------------------------+  +----------------------------------+
|   SUPABASE AUTH (GoTrue)    |  |   SUPABASE EDGE FUNCTIONS (Deno) |
|  - Email/Password + TOTP    |  |  - catalog   - account           |
|  - Custom SMTP: Gmail 2FA   |  |  - orders    - storage           |
|    (smtp.gmail.com:465)     |  |  - admin     - [chat (Phase 2)]  |
+-----------------------------+  |       |            |             |
                                 |  _shared/auth.ts   | _shared/    |
                                 |  _shared/cors.ts   |  email.ts   |
                                 +-------|------------|-------------+
                                         |            |
                        service_role     v            v  SMTP/TLS (465)
                    +-------------------------+  +------------------+
                    |   SUPABASE POSTGRES     |  |  GMAIL SMTP      |
                    |  21 Tables (100% RLS)   |  |  2FA App Password|
                    |  + SUPABASE STORAGE     |  +------------------+
                    |  (public + private)     |
                    +-------------------------+
```

### Key Architectural Invariant (Verified from Codebase)

The React frontend (`src/`) performs **zero direct database queries** via `supabase.from(...)`. All application data flows through `src/api/apiClient.js` -> Supabase Edge Functions, while `src/lib/supabaseClient.js` is used strictly for Supabase Auth (sessions, signup, login, password reset, email verification, and TOTP MFA).

---

## 2. Database Design & Complete 21-Table RLS Security Matrix

Migration `0001_init.sql` defines 21 tables in `public` but enabled RLS on only 9 of them. Because PostgREST exposes all `public` tables to the browser's `anon` key by default, **Migration `0004_enable_rls_all.sql`** MUST lock down all remaining 12 tables and revoke direct `anon`/`authenticated` privileges.

### 2.1 Complete 21-Table Inventory & RLS Status

| #   | Table Name           | Domain         | Current RLS (`0001`) | Target RLS (`0004`) | Direct Client Policy   | Access Path                         |
| --- | -------------------- | -------------- | -------------------- | ------------------- | ---------------------- | ----------------------------------- |
| 1   | `profiles`           | Auth           | Enabled              | Enabled             | None (Deny all direct) | `account` / `admin` Edge Functions  |
| 2   | `customer_state`     | Account        | Enabled              | Enabled             | None (Deny all direct) | `account` Edge Function             |
| 3   | `customer_addresses` | Account        | Enabled              | Enabled             | None (Deny all direct) | `account` Edge Function             |
| 4   | `orders`             | Commerce       | Enabled              | Enabled             | None (Deny all direct) | `orders` Edge Function              |
| 5   | `order_items`        | Commerce       | Enabled              | Enabled             | None (Deny all direct) | `orders` Edge Function              |
| 6   | `reviews`            | Engagement     | Enabled              | Enabled             | None (Deny all direct) | `admin` / `catalog` Edge Functions  |
| 7   | `support_tickets`    | Engagement     | Enabled              | Enabled             | None (Deny all direct) | `admin` Edge Function               |
| 8   | `return_requests`    | Commerce       | Enabled              | Enabled             | None (Deny all direct) | `admin` / `orders` Edge Functions   |
| 9   | `notifications`      | Engagement     | Enabled              | Enabled             | None (Deny all direct) | `admin` Edge Function               |
| 10  | `payments`           | **Financial**  | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `orders` / `storage` Edge Functions |
| 11  | `payment_proofs`     | **Financial**  | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `storage` Edge Function             |
| 12  | `refunds`            | **Financial**  | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `admin` Edge Function               |
| 13  | `coupons`            | **Commerce**   | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `orders` Edge Function              |
| 14  | `products`           | **Catalog**    | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `catalog` Edge Function             |
| 15  | `categories`         | **Catalog**    | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `catalog` Edge Function             |
| 16  | `inventory_logs`     | **Ops**        | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `catalog` Edge Function             |
| 17  | `catalog_meta`       | **Catalog**    | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `catalog` Edge Function             |
| 18  | `engagement_meta`    | **Engagement** | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `admin` Edge Function               |
| 19  | `site_settings`      | **Config**     | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `admin` / `catalog` Edge Functions  |
| 20  | `media_assets`       | **Media**      | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `storage` Edge Function             |
| 21  | `audit_logs`         | **Security**   | **DISABLED**         | **ENABLED**         | None (Deny all direct) | `admin` Edge Function               |

### 2.2 Target Migration SQL (`supabase/migrations/0004_enable_rls_all.sql`)

```sql
-- Lock down all remaining 12 public tables (Edge Functions use service_role and bypass RLS)
alter table public.payments enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.refunds enable row level security;
alter table public.coupons enable row level security;
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.catalog_meta enable row level security;
alter table public.engagement_meta enable row level security;
alter table public.site_settings enable row level security;
alter table public.media_assets enable row level security;
alter table public.audit_logs enable row level security;

-- Defense in depth: revoke direct PostgREST access from anon & authenticated roles
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

---

## 3. Shared Supabase Edge Function Architecture (`supabase/functions/_shared/`)

Currently, the 5 Edge Functions duplicate CORS headers, auth token parsing, role checks, and JSON response wrappers across ~111 KB of code. Consolidate all cross-cutting logic into `supabase/functions/_shared/`:

```
supabase/
  config.toml                  # Explicit verify_jwt = false + local SMTP config
  migrations/
    0001_init.sql
    0002_seed_users.sql
    0003_seed_catalog_data.sql
    0004_enable_rls_all.sql    # P0 security migration
  functions/
    _shared/
      cors.ts                  # Strict ALLOWED_ORIGINS allowlist + preflight helper
      supabase.ts              # Singleton service_role admin client + user-scoped auth verifier
      auth.ts                  # getCaller(req), requireUser(req), requireStaff(req), requireAdmin(req)
      http.ts                  # jsonResponse(), errorResponse(), parseJsonWithZod()
      email.ts                 # Gmail 2FA App Password SMTP mailer (npm:nodemailer)
      emailTemplates.ts        # Clean HTML + plaintext templates (order, proof, shipping, return, ticket)
      rateLimit.ts             # Sliding-window / DB-backed or in-isolate guard for sensitive routes
    account/index.ts
    admin/index.ts
    catalog/index.ts
    orders/index.ts            # Adds GET /:id/invoice JSON/HTML endpoint + Gmail email triggers
    storage/index.ts           # Adds payment proof confirmation email trigger
    chat/index.ts              # Optional Phase 2 Gemini assistant
```

### 3.1 Gmail 2FA SMTP Mailer Design (`supabase/functions/_shared/email.ts`)

```ts
import nodemailer from "npm:nodemailer@6";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const user = Deno.env.get("GMAIL_SMTP_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return null;

  if (!cachedTransporter) {
    const host = Deno.env.get("GMAIL_SMTP_HOST") || "smtp.gmail.com";
    const port = Number(Deno.env.get("GMAIL_SMTP_PORT") || "465");
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL/TLS), false for 587 (STARTTLS)
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<{ sent: boolean; messageId?: string; reason?: string }> {
  const transporter = getTransporter();
  const senderEmail = Deno.env.get("GMAIL_SMTP_USER");
  const senderName = Deno.env.get("GMAIL_SENDER_NAME") || "FikarNot";

  if (!transporter || !senderEmail) {
    console.warn(`[email] Gmail 2FA SMTP secrets not configured; skipped "${input.subject}" -> ${input.to}`);
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: input.to,
      replyTo: input.replyTo || senderEmail,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] Gmail SMTP send failed:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "smtp_error" };
  }
}
```

### 3.2 `supabase/config.toml` Configuration

Commit `supabase/config.toml` to version control so Edge Function JWT settings and local Gmail 2FA SMTP testing are reproducible:

```toml
[auth.email.smtp]
enabled = true
host = "smtp.gmail.com"
port = 465
user = "env(GMAIL_SMTP_USER)"
pass = "env(GMAIL_APP_PASSWORD)"
admin_email = "env(GMAIL_SMTP_USER)"
sender_name = "FikarNot"

[functions.account]
verify_jwt = false

[functions.admin]
verify_jwt = false

[functions.catalog]
verify_jwt = false

[functions.orders]
verify_jwt = false

[functions.storage]
verify_jwt = false
```

---

## 4. Invoice Architecture (Replacing Legacy Railway Link)

Currently `src/pages/CheckoutPage.jsx` links to `${VITE_API_URL || ""}/api/orders/${order.id}/invoice`, which proxies to Railway via `vercel.json`.

### Target Design

1. **Backend (`orders/index.ts`):** Add `GET /:id/invoice`:
   - Calls `requireUser(req)` and asserts `caller.id === order.user_id || isStaff`.
   - Returns structured invoice payload (`invoiceNumber`, `order`, `items`, `storeMeta`, `issuedAt`) — never exposes unauthenticated order URLs.
2. **Frontend (`src/pages/InvoicePage.jsx` or printable modal):**
   - Fetches verified invoice JSON via `ordersApi.getInvoice(orderId)` (routed through `apiClient.js` -> `orders` Edge Function).
   - Renders a print-optimized A4 invoice view (`@media print` CSS) with one-click `window.print()` ("Download / Print PDF").
3. **`vercel.json` Cleanup:** Remove both Railway proxy rules so `vercel.json` contains only security headers and the SPA fallback:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 5. Storage Bucket Architecture

| Bucket                          | Visibility  | Allowed MIME Types                                   | Max File Size | Access Control                                                                                                                   |
| ------------------------------- | ----------- | ---------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `product-media` (public assets) | Public read | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | 5 MB          | Staff upload/delete via `storage` Edge Function with magic-byte check & SHA-256 dedupe                                           |
| `payment-proofs`                | **Private** | `image/jpeg`, `image/png`, `image/webp`              | 5 MB          | Order owner uploads via `POST /payment-proof/:orderId`; owner or staff reads via 300s signed URL (`GET /payment-proof/:orderId`) |

---

## 6. Frontend Modularization Blueprint

### Immediate Dead-Code Removal

- Delete `src/styles.css` (95.8 KB — verified unused; both `main.jsx` and `App.jsx` import `./styles/index.css`).
- Delete `src/components/layout.jsx` (14.3 KB — verified unused; `AppRouter.jsx` imports `components/layout/Layout.jsx`).
- Remove production fallbacks to `src/data/seedData.js`.

### Refactoring Monoliths

1. **`src/pages/AdminPage.jsx` (97.5 KB -> ~10 modular components):**
   Split into `src/components/admin/`:
   - `OrdersTab.jsx` (includes payment proof modal & fulfillment)
   - `ProductsTab.jsx` + `InventoryModal.jsx`
   - `CategoriesTab.jsx`
   - `CouponsTab.jsx`
   - `ReturnsTab.jsx`
   - `ReviewsTab.jsx`
   - `SupportTab.jsx`
   - `UsersTab.jsx`
   - `MediaLibraryTab.jsx`
   - `SettingsAuditTab.jsx`
   - `TwoFactorSection.jsx` (reusable in both `AdminPage` and `AccountPage`)
   - `AnalyticsTab.jsx` (already extracted)
2. **`src/store/appStore.js` (71.1 KB):**
   - Move all server-fetched resources (`products`, `categories`, `orders`, `reviews`, `tickets`, `returns`, `users`, `auditLogs`, `siteSettings`) into **TanStack Query v5** hooks (`src/hooks/queries/`).
   - Slim local client store down to auth session summary, active cart/wishlist optimistic state, theme, and toast notifications.
3. **Route-Level Code Splitting (`src/router/routes.jsx`):**
   Wrap `AdminPage`, `AccountPage`, `CheckoutPage`, and `ProductDetailPage` in `React.lazy()` + `<Suspense>` to keep customer storefront initial loads lightweight.
