# FikarNot — Technical Requirements Document (TRD)

> **Errata (November 2026 review).** This document predates the review in `docs/REVIEW_AND_STATUS.md`. Where it conflicts, the review, `AGENTS.md` and `ROADMAP.md` win. Known corrections: (1) commerce email uses the **Gmail REST API over HTTPS**, not SMTP — Edge Functions cannot use ports 25/587; Supabase Auth keeps Gmail SMTP on port 465; (2) **12** tables lacked RLS, now fixed by migration 0004; (3) guests may check out with **Cash on Delivery only**; (4) refunds and order deletion are **admin-only**; (5) the CORS env var is `ALLOWED_ORIGINS` (legacy `FIKARNOT_FRONTEND_ORIGIN` still accepted); (6) zod validation and TanStack Query are **planned, not present**.

**Document Version:** 2.0  
**Target Architecture:** Serverless JAMstack (Vercel SPA + Supabase Postgres/Auth/Storage/Edge Functions)  
**Email Infrastructure:** Gmail 2FA (Google App Password over SMTP — `smtp.gmail.com`)

---

## 1. Technology Stack Specification

### 1.1 Frontend Runtime & Libraries

| Layer             | Technology                                                              | Target Version                 | Notes                                                      |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| UI Framework      | React + React DOM                                                       | `^19.2.8`                      | Already installed in `package.json`                        |
| Build Tool        | Vite + `@vitejs/plugin-react`                                           | `^8.2.2` / `^6.1.0`            | Already installed; fast ESM bundling + SEO postbuild       |
| Routing           | React Router DOM                                                        | `^7.18.2`                      | Declarative protected routes (`ProtectedRoute`)            |
| Server State      | TanStack Query (`@tanstack/react-query`)                                | `^5.x`                         | Replaces manual API caching inside `src/store/appStore.js` |
| Client State      | Lightweight modular store (or Zustand `^5.x`)                           | —                              | Scoped strictly to UI/cart/theme state                     |
| Styling           | Consolidated Modular CSS (`src/styles/`) or progressive Tailwind CSS v4 | CSS Custom Properties / `^4.x` | Remove unused 95.8 KB `src/styles.css` immediately         |
| Charts            | Recharts                                                                | `^3.10.1`                      | Admin analytics (`AnalyticsTab.jsx`)                       |
| Auth & Client SDK | `@supabase/supabase-js`                                                 | `^2.45+` (latest 2.x)          | Auth, MFA (TOTP), session JWT management                   |
| Testing           | Vitest + Testing Library + jsdom                                        | `^4.1.11` / `^16.3.x`          | Unit & component testing                                   |
| Code Quality      | ESLint 9 (Flat Config) + Prettier 3                                     | `^9.39.5` / `^3.9.6`           | Enforced in GitHub Actions CI                              |

### 1.2 Backend & Infrastructure

| Layer                           | Technology                               | Specification                                                                                                                  |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hosting (Frontend)              | Vercel                                   | Static SPA hosting with clean SPA fallback rewrite (zero Railway proxies)                                                      |
| Database                        | Supabase PostgreSQL 15+                  | 21 tables, `citext`, `pgcrypto`, native `jsonb`, **RLS enabled on all 21 tables**                                              |
| Authentication                  | Supabase Auth (GoTrue)                   | JWT sessions, Email Verification, Password Reset, TOTP MFA (`auth.mfa`), Custom SMTP via **Gmail 2FA**                         |
| API Compute                     | Supabase Edge Functions (Deno 2)         | 5 domain functions (`catalog`, `account`, `orders`, `storage`, `admin`) + shared `_shared/` modules + optional `chat` function |
| Schema Validation               | Zod (`npm:zod`)                          | Strict runtime payload validation inside every Edge Function                                                                   |
| File Storage                    | Supabase Storage                         | Public bucket for product/site media; private `payment-proofs` bucket with 300s signed URLs                                    |
| Transactional Email             | **Gmail 2FA App Password SMTP**          | `smtp.gmail.com` (`465` SSL/TLS or `587` STARTTLS) via Supabase Auth Custom SMTP + `npm:nodemailer` inside `_shared/email.ts`  |
| AI Assistant (Optional/Phase 2) | Google Gemini API (`@google/genai`)      | Invoked exclusively server-side from a rate-limited `chat` Edge Function                                                       |
| Local / CI Tooling              | Node.js `>=22.5.0`, Supabase CLI, Deno 2 | Local DB migrations (`supabase db reset`), Edge Function testing, GitHub Actions CI                                            |

---

## 2. Email Architecture Requirements (Gmail 2FA SMTP)

FikarNot **does not use Resend** or any third-party paid email SaaS. All authentication and transactional emails use **Google Gmail with 2-Step Verification (2FA) enabled and a dedicated 16-character Google App Password**.

### 2.1 Dual-Path Gmail SMTP Configuration

1. **Path A — Supabase Auth Custom SMTP (Auth Emails):**
   Configured in **Supabase Dashboard -> Authentication -> SMTP Settings** (and mirrored in `supabase/config.toml` for local dev):
   - **Enable Custom SMTP:** `true`
   - **Host:** `smtp.gmail.com`
   - **Port:** `465` (SSL/TLS) — fallback `587` (STARTTLS)
   - **Username:** `<your-sending-account>@gmail.com`
   - **Password:** `<16-character Google App Password>` (generated at Google Account -> Security -> 2-Step Verification -> App passwords)
   - **Sender Email:** `<your-sending-account>@gmail.com`
   - **Sender Name:** `FikarNot`
   - **Handles:** Signup verification emails, password reset links, email change confirmations, and security notices.

2. **Path B — Supabase Edge Functions Transactional Mailer (`_shared/email.ts`):**
   Used by `orders` and `admin` Edge Functions for commerce notifications (order placed, payment proof approved/rejected, shipment tracking, return/refund updates, support ticket replies):
   - **Transport Library:** `npm:nodemailer` on Deno 2 Edge Functions with `secure: true` on port `465` (or `secure: false`, `requireTLS: true` on port `587`).
   - **Credentials:** Injected exclusively via Supabase Secrets (`GMAIL_SMTP_HOST`, `GMAIL_SMTP_PORT`, `GMAIL_SMTP_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_SENDER_NAME`). Never exposed to the browser (`VITE_*`).
   - **Non-Blocking Failure Handling:** Email dispatch failures must be logged cleanly and must **never** roll back or fail a valid order creation or payment confirmation transaction.

### 2.2 Operational Constraints & Mitigations for Gmail 2FA SMTP

- **Daily Quota:** Standard `@gmail.com` accounts allow up to **500 recipients/day** (Google Workspace allows up to **2,000/day**). Implement idempotency/deduplication guards so retries do not spam duplicate emails.
- **Security Hygiene:** Use a dedicated store Gmail account (e.g., `fikarnot.orders@gmail.com`) rather than a personal inbox; rotate the App Password immediately if ever exposed; never commit `.env` files containing `GMAIL_APP_PASSWORD`.
- **Deliverability:** Keep `From` and `Reply-To` aligned with the authenticated `GMAIL_SMTP_USER` address to pass Gmail SPF/DKIM checks cleanly.
- **Port Resilience Note:** If an edge runtime environment ever restricts outbound SMTP or quota scales beyond 500/day, keep the `_shared/email.ts` interface provider-agnostic (`sendEmail({ to, subject, html, text })`) so swapping transport to Gmail REST API over HTTPS (port 443) or Google Workspace SMTP requires editing only one file.

---

## 3. Environment Variables & Secrets Matrix

### 3.1 Frontend Environment Variables (Vercel / `.env`, Public-Safe Only)

| Variable                   | Required | Default | Description                                                          |
| -------------------------- | -------- | ------- | -------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`        | Yes      | —       | Supabase project URL (`https://<ref>.supabase.co`)                   |
| `VITE_SUPABASE_ANON_KEY`   | Yes      | —       | Supabase public anon/publishable key                                 |
| `VITE_APP_URL`             | Yes      | —       | Canonical public storefront URL (`https://fikarnot-live.vercel.app`) |
| `VITE_ENABLE_PAYFAST`      | No       | `false` | Feature flag for PayFast checkout option                             |
| `VITE_ENABLE_AI_CHAT`      | No       | `false` | Feature flag for `ChatWidget`                                        |
| `VITE_ENABLE_VIDEO_UPLOAD` | No       | `false` | Feature flag for hero video upload UI                                |
| `VITE_SHOW_DEMO_LOGIN`     | No       | `0`     | Must be `0` in production                                            |

### 3.2 Backend Secrets (Supabase Vault / `supabase secrets set`, Strictly Server-Side)

| Secret                                        | Required      | Description                                                             |
| --------------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`                                | Auto-injected | Project URL inside Edge Functions                                       |
| `SUPABASE_SERVICE_ROLE_KEY`                   | Auto-injected | Privileged DB/Storage key used only inside verified Edge Functions      |
| `GMAIL_SMTP_HOST`                             | Yes           | `smtp.gmail.com`                                                        |
| `GMAIL_SMTP_PORT`                             | Yes           | `465` (SSL) or `587` (STARTTLS)                                         |
| `GMAIL_SMTP_USER`                             | Yes           | Authenticated Gmail address with 2FA enabled                            |
| `GMAIL_APP_PASSWORD`                          | Yes           | 16-character Google App Password (no spaces)                            |
| `GMAIL_SENDER_NAME`                           | No            | Defaults to `FikarNot`                                                  |
| `APP_PUBLIC_URL`                              | Yes           | Used to build verified order/invoice links inside emails                |
| `ALLOWED_ORIGINS`                             | Yes           | Comma-separated strict CORS allowlist (Vercel prod + preview/localhost) |
| `GEMINI_API_KEY`                              | Optional      | Required only when `VITE_ENABLE_AI_CHAT=true`                           |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_SECURED_KEY` | Optional      | Required only when `VITE_ENABLE_PAYFAST=true`                           |

---

## 4. Non-Functional Requirements

### 4.1 Security Requirements

- **100% RLS Coverage:** Every table in the `public` schema (all 21 tables) MUST have `ROW LEVEL SECURITY` enabled and `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` applied, because 100% of frontend data access routes through authenticated Edge Functions (`src/` contains zero direct `supabase.from()` calls).
- **Centralized Auth & RBAC:** Every protected Edge Function route must call shared `_shared/auth.ts` helpers (`requireUser`, `requireStaff`, `requireAdmin`) verifying the Bearer token via `supabase.auth.getUser(token)` and fetching `profiles.role`.
- **Upload Hardening:** Validate file size limits, MIME type allowlists, and binary magic bytes (`imageMatchesMagicBytes`) before uploading to Storage; serve private payment proofs solely via 300-second signed URLs after verifying `caller.id === order.user_id || isStaff`.
- **Secrets & Repo Hygiene:** Zero `.sqlite`, `.sqlite-shm`, `.sqlite-wal`, or `.env` files in Git history or working tree.
- **Security Headers (Vercel):** Enforce `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a scoped Content Security Policy (CSP).

### 4.2 Performance & Scalability Requirements

- Edge Function cold-start p95 latency < 600ms; warm response p95 < 200ms.
- Frontend initial JS gzipped bundle < 250 KB via route-level `React.lazy()` code splitting (especially splitting `AdminPage` and `Recharts` out of the customer storefront bundle).
- Remove dead CSS (`src/styles.css` — 95.8 KB unused) and dead layout (`src/components/layout.jsx` — 14.3 KB unused).

### 4.3 Reliability, CI/CD & Observability

- **Infrastructure as Code:** Commit `supabase/config.toml` specifying `[functions.<name>] verify_jwt = false` so deploys are deterministic and never rely on manual CLI flags.
- **CI Pipeline (`.github/workflows/ci.yml`):** Must run on every PR and push to `main`:
  1. `npm run lint` and `npm run format:check`
  2. `npm run build` (including sitemap & SEO prerender check)
  3. Frontend unit tests (`vitest run`)
  4. Supabase Edge Function integration & RLS security tests (Deno test runner against local Supabase or isolated test project)
- **Automated Backups:** Rely on Supabase Postgres automated backups + scheduled `pg_dump` export artifact (replacing legacy SQLite `backup-db.mjs`).
