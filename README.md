# FikarNot

FikarNot is a full-stack e-commerce storefront and operations studio built for direct-to-consumer retail in Pakistan (`PKR`). The frontend is a React 19 SPA deployed on Vercel, backed by Supabase (PostgreSQL with Row Level Security, Auth + TOTP 2FA, Storage, and Deno Edge Functions).

---

## Features

- **Storefront & Catalog**: Category filtering, dynamic PKR price-range filtering, keyword search with autocomplete suggestions, sort controls, low-stock urgency indicators, wishlist, product comparison, recently viewed history, and build-time `sitemap.xml` + prerendered product SEO metadata.
- **Transactional Checkout & Order Lifecycle**: Atomic PostgreSQL RPCs (`create_order`, `cancel_order`, `complete_return`, `collect_cod`) prevent overselling, race conditions, coupon abuse, and duplicate restocking across `pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `return_approved`, and `returned` states.
- **Pakistani Payment Flows**:
  - **Cash on Delivery (COD)** available to both guests and signed-in customers.
  - **Manual Bank Transfer, JazzCash, and EasyPaisa** for signed-in customers with configurable account details, payment slip upload into a private `payment-proofs` storage bucket, and one-click staff verification.
  - **PayFast gateway** cleanly feature-flagged (`VITE_ENABLE_PAYFAST`) until merchant activation.
- **Order Tracking & Logistics**:
  - Public **Track Order** hub (`/track`) requiring exact normalized Pakistani phone (`03xx-xxxxxxx` / `+923xxxxxxxxx`) or case-insensitive email match, rate-limited per IP and per order ID with sensitive PII stripped.
  - 1-click **WhatsApp** order confirmation and admin dispatch notifications.
  - Printable A4 and **4×6" thermal packing slips** (`/admin/orders/:orderId/packing-slip`) with Code 39 barcodes and customer **invoices** (`/invoice/:id`).
- **Accounts & Security**:
  - Email verification, password reset, persistent cart/wishlist/address sync, and self-service **TOTP Two-Factor Authentication (2FA)** (`TwoFactorSection`) enforced server-side (AAL2) for enrolled staff.
  - Strictly server-verified RBAC (`admin`, `editor`, `customer`), Zod input validation across Edge Functions, DB-backed rate limiting (`rate_limits`), and CSP headers (`index.html` + `vercel.json`).
- **AI Catalog Assistant & Media Uploads**:
  - Gemini-powered shopping assistant (`chat` Edge Function, gated by `VITE_ENABLE_AI_CHAT`) grounded in live catalog and store policy data.
  - Signed URL hero video upload (`VITE_ENABLE_VIDEO_UPLOAD`) and product image uploads with MIME/size/SVG-XSS restrictions (`media` bucket).
- **Admin Studio (`/admin`)**: Modular management tabs for Dashboard metrics, Orders & shipments, Products, Categories, Inventory logs, Coupons, Returns & refunds, Reviews moderation, Support tickets, Media library, Users & roles, Recharts Analytics, and Store/Payment Settings.

---

## Tech Stack

- **Frontend**: React 19, Vite 8, React Router 7, Modular CSS (`src/styles/*.css` with CSS custom properties — custom design system, not Tailwind CSS), Recharts, `@supabase/supabase-js`
- **Backend & Database**: Supabase PostgreSQL 16 (21 app tables + `rate_limits`, full RLS lockdown), Supabase Auth (GoTrue + TOTP MFA), Supabase Storage (`media`, `payment-proofs`), 6 Deno 2 Edge Functions with Zod validation
- **Email Delivery**: Supabase Auth Custom SMTP (`smtp.gmail.com:465`) for auth flows; Gmail REST API over HTTPS (`_shared/email.ts`) for commerce emails
- **Quality & Testing**: Vitest + React Testing Library (`jsdom`), Deno test runner (`@std/assert`), ESLint 9 (`jsx-a11y`, React hooks), Prettier, GitHub Actions CI, Vercel hosting

---

## Project Structure

```text
FikarNot/
├── .github/workflows/          # CI (lint, format, vitest, build, deno check/test, postgres assertions) & healthcheck
├── docs/
│   └── EMAIL_SETUP.md          # Custom SMTP + Gmail REST API OAuth configuration runbook
├── public/                     # Static assets (favicon.svg, robots.txt)
├── scripts/
│   ├── catalog-source.js       # Shared live/fallback catalog loader for SEO scripts
│   ├── generate-sitemap.js     # Post-build sitemap.xml generator
│   ├── get-gmail-refresh-token.mjs # One-time CLI helper for Gmail API OAuth refresh token
│   ├── prerender-seo.js        # Post-build product meta prerendering
│   └── verify-rls.mjs          # Live database security probe verifying anon key isolation
├── src/
│   ├── api/                    # Edge Function API wrappers + apiClient.js
│   ├── assets/                 # Theme swatches and fallback media references
│   ├── components/
│   │   ├── admin/              # Modular Admin Studio tabs (Orders, Products, Inventory, Analytics, Settings, etc.)
│   │   ├── common/             # Shared UI primitives
│   │   ├── layout/             # Header, Footer, Announcement Marquee, CompareTray
│   │   └── seo/                # Schema.org JSON-LD components
│   ├── config/                 # Feature flags, role lists, storage keys, payment account adapters
│   ├── data/                   # Offline fallback seed metadata for build scripts
│   ├── hooks/                  # useAsync, useDebounced, useDocumentMeta, usePagination, useTheme
│   ├── lib/                    # supabaseClient.js (Auth & MFA only)
│   ├── pages/                  # Storefront, Account, Checkout, Tracking, Invoice, PackingSlip, Studio pages
│   ├── router/                 # AppRouter, ProtectedRoute, route definitions
│   ├── store/                  # Reactive store (appStore.js) synced with Edge Functions
│   ├── styles/                 # Modular CSS stylesheets
│   └── utils/                  # Cart math, coupons, returns normalization, URL/image helpers
├── supabase/
│   ├── config.toml             # Edge Function settings (verify_jwt = false for internal auth)
│   ├── functions/
│   │   ├── _shared/            # auth, cors, email, emailTemplates, gemini, http, orderLifecycle, rateLimit, rpc, supabase, validate, video
│   │   ├── account/            # Profile, cart/wishlist/addresses, staff user management
│   │   ├── admin/              # Site settings, support tickets, coupons, return requests, refunds, reviews
│   │   ├── catalog/            # Products, categories, inventory logs & stock adjustments
│   │   ├── chat/               # Gemini shopping assistant (index.ts + handler.ts)
│   │   ├── orders/             # Checkout, /lookup tracking, invoices, status/fulfillment (index.ts + handler.ts)
│   │   ├── storage/            # Media uploads, signed video URLs, private payment-proof slip verification
│   │   └── tests/              # 9 Deno Edge Function unit/handler test suites
│   ├── maintenance/            # One-off operational SQL (promote_admin.sql, remove_seeded_demo_users.sql)
│   ├── migrations/             # Additive SQL migrations (0001 through 0011)
│   └── tests/                  # PostgreSQL CI stub and RLS/checkout SQL assertion suite
├── .env.example                # Frontend / Vercel environment variable template
├── eslint.config.js            # ESLint flat config
├── index.html                  # App entry & CSP template
├── package.json                # Workspace scripts and dependencies
├── vercel.json                 # SPA rewrite and HTTP security headers
├── vite.config.js              # Vite config + build-time __SUPABASE_ORIGIN__ CSP injection
└── vitest.config.js            # Vitest jsdom test config
```

---

## Local Setup

### Prerequisites

- **Node.js `>= 22.5.0`** (`.nvmrc` pins `22`) & **npm**
- **Deno v2.x** (to run Edge Function type-checks and tests)
- **Supabase CLI** (to manage migrations, secrets, and Edge Functions)

### Installation

```bash
git clone https://github.com/junaidhaider153/FikarNot.git
cd FikarNot
npm ci
cp .env.example .env.local
```

Edit `.env.local` with your Supabase project URL and publishable/anon key, then start the development server:

```bash
npm run dev
```

---

## Environment Variables

### Frontend & Build (`.env.local` locally / Vercel Project Settings)

Never place service-role keys, Gmail credentials, or passwords behind `VITE_` variables.

| Variable                   | Required | Default                          | Purpose                                                   |
| -------------------------- | -------- | -------------------------------- | --------------------------------------------------------- |
| `VITE_SUPABASE_URL`        | Yes      | —                                | Supabase project URL; also injected into CSP on build     |
| `VITE_SUPABASE_ANON_KEY`   | Yes      | —                                | Supabase publishable / anon key (Auth + Edge Functions)   |
| `SITE_URL`                 | Build    | `https://www.fikarnot.shop`      | Canonical origin for `sitemap.xml` and prerendered SEO    |
| `SITEMAP_API_URL`          | Optional | Derived from `VITE_SUPABASE_URL` | Override endpoint for post-build catalog SEO fetch        |
| `VITE_WHATSAPP_NUMBER`     | Optional | —                                | Fallback store WhatsApp number (`923xxxxxxxxx`)           |
| `VITE_ENABLE_AI_CHAT`      | Optional | `false`                          | Enables the Gemini AI assistant widget (`true` / `false`) |
| `VITE_ENABLE_VIDEO_UPLOAD` | Optional | `false`                          | Enables hero background video uploads in Admin Settings   |
| `VITE_ENABLE_PAYFAST`      | Optional | `false`                          | Enables online PayFast checkout option (`true` / `false`) |

### Edge Function Secrets (`supabase/functions/.env` → `supabase secrets set`)

See [`supabase/functions/.env.example`](supabase/functions/.env.example) for the complete template (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase):

- **CORS & Links**: `ALLOWED_ORIGINS` (comma-separated allowed origins), `APP_PUBLIC_URL`
- **Staff Security**: `STAFF_MFA_REQUIRED` (`0` until staff enroll TOTP, then set to `1`)
- **Commerce Email (Gmail REST API)**: `GMAIL_SENDER_EMAIL`, `GMAIL_SENDER_NAME`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN` (setup guide in [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md))
- **AI Assistant**: `GEMINI_API_KEY`, `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)

---

## Database Migrations & Deployment

### 1. Database Migrations (`0001`–`0011`)

Back up your database before applying migrations to a live Supabase project, then link and push:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase migration list
supabase db push
```

Migration sequence in `supabase/migrations/`:

1. `0001_init.sql` — Core schema (21 tables) & indexes
2. `0002_seed_users.sql` — Initial Auth profiles
3. `0003_seed_catalog_data.sql` — Initial store settings, categories & catalog seed
4. `0004_enable_rls_all.sql` — Full RLS lockdown & `anon`/`authenticated` privilege revocation
5. `0005_checkout_hardening.sql` — Atomic `create_order` & `cancel_order` RPCs, sequences, DB rate limits
6. `0006_order_lifecycle.sql` — Explicit `pending_payment` status & lifecycle hardening
7. `0007_atomic_return_restock.sql` — Atomic `complete_return` stock restoration RPC
8. `0008_atomic_collect_cod.sql` — Atomic `collect_cod` RPC & COD refund support
9. `0009_media_bucket_security.sql` — Storage bucket upload limits for `media` and `payment-proofs`
10. `0010_customer_phone.sql` — Customer phone persistence and checkout validation support
11. `0011_bucket_svg_fix_and_pkr_prices.sql` — Strips `image/svg+xml` from `media` allowed MIME types and normalizes seeded catalog prices to PKR

Verify RLS isolation against your live project after migrating:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<key> npm run verify:rls
```

To promote an initial admin account and clean up seeded demo accounts, follow the instructions in `supabase/maintenance/promote_admin.sql` and `supabase/maintenance/remove_seeded_demo_users.sql`.

### 2. Deploy Edge Functions & Configure Email

```bash
cp supabase/functions/.env.example supabase/functions/.env   # populate secrets; git-ignored
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy                                  # honors supabase/config.toml (verify_jwt = false)
```

Ensure both **Auth SMTP** (`smtp.gmail.com:465` in Supabase Auth settings) and the **Gmail REST API OAuth app** (published **In production** in Google Cloud Console) are configured per [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md).

### 3. Vercel Frontend Deploy

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SITE_URL`, and desired `VITE_ENABLE_*` flags in Vercel Environment Variables. Production builds inject the Supabase origin into Content Security Policy headers and generate `sitemap.xml` + prerendered product SEO pages from the live `catalog` function.

---

## Testing & Verification

Run the complete frontend and Edge Function verification suites locally before deploying:

```bash
# Lint (ESLint) + Formatting (Prettier) + Vitest (21 files) + Production Vite Build
npm run verify

# Type-check all 6 Deno Edge Functions
npm run functions:check

# Run all 9 Deno Edge Function test suites
npm run functions:test

# Verify RLS lockdown against a live Supabase project
npm run verify:rls
```

Database migration idempotency and PostgreSQL RPC concurrency/security assertions can also be validated against a local Postgres 16 database using `supabase/tests/ci_stub.sql` and `supabase/tests/assertions.sql` (as run in `.github/workflows/ci.yml`).
