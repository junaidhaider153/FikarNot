# AGENTS.md — FikarNot guide & guardrails for AI coding assistants

Authoritative context for Cursor / Copilot / Claude Code / Gemini working in this repo.
**Status labels:** ✅ exists today · 🎯 planned (does not exist yet — never import or call it).

## 1. Snapshot

- **Product:** FikarNot — storefront + admin dashboard, currency `PKR`.
- **Frontend:** React 19 + Vite 8 + React Router 7 + Recharts, deployed on **Vercel**. Client state lives in `src/store/appStore.js` (1.6k lines). 🎯 TanStack Query is **not installed** — it is a post-launch refactor.
- **Backend:** **Supabase** — Postgres (21 app tables + `rate_limits`), Auth + TOTP MFA, Storage, 5 Deno Edge Functions (`account`, `admin`, `catalog`, `orders`, `storage`).
- **Email:** two separate paths.
  - _Auth mail_ (signup confirm, password reset): Supabase Auth → Custom SMTP → Gmail **App Password** (`smtp.gmail.com`, port 465). Not an Edge Function.
  - _Commerce mail_ (order confirmation, payment confirmed, tracking): `_shared/email.ts` via the **Gmail REST API over HTTPS**. ✅
  - **Never use SMTP from an Edge Function.** Supabase blocks outbound ports 25 and 587; raw SMTP on Deno is unproven. Do not add nodemailer. Do not add Resend/SendGrid/etc.
- **Legacy:** the legacy Node+SQLite stack has been retired and deleted; it remains accessible in git history. The modern stack is 100% Supabase + Deno Edge Functions. Never add features there.

## 2. Hard guardrails

1. **RLS on every table.** Any new `create table` must be followed by `enable row level security` and **no** grants to `anon`/`authenticated`. (Migration 0004 revoked them; keep it that way.) After any schema change run `npm run verify:rls` against the target project.
2. **No `supabase.from()` / `supabase.rpc()` in `src/`.** Data goes `src/api/*` → `src/api/apiClient.js` → Edge Functions. `src/lib/supabaseClient.js` is for Auth/MFA only.
3. **Never trust the client** for `userId`, `role`, `price`, `subtotal`, `total`, discount, or stock. Identity = `getCaller(req)` from `_shared/auth.ts` ✅. Money is computed in Postgres by `create_order()` ✅.
4. **Staff authorisation:** use `isStaff(caller)` / `isAdmin(caller)` ✅ — they already return false for staff who have not completed MFA. Refunds, order deletion, role changes are **admin-only**.
5. **Orders:** create via `rpc create_order`, cancel via `rpc cancel_order`. Do not re-implement stock logic in TypeScript.
6. **Guests may only use Cash on Delivery.** Bank transfer / JazzCash / Easypaisa require an account (payment slips are tied to the order owner).
7. **No secrets in git or the browser.** Never put the service-role key, Gmail secrets or any password behind a `VITE_` name. `.env*` and `*.sqlite*` are git-ignored.
8. **Unported features stay hidden** behind `FEATURES` in `src/config/appConfig.js` (`VITE_ENABLE_PAYFAST`, `VITE_ENABLE_AI_CHAT`, `VITE_ENABLE_VIDEO_UPLOAD`, default false). Enabling one requires the server side to exist first.
9. **Migrations are additive and idempotent.** Never edit an applied migration (exception: 0003 was repaired because it could not run at all). Next number: `0009_`.
10. **Keep `supabase/config.toml` in sync.** Every function needs `verify_jwt = false` (they authenticate internally; the new publishable keys are not JWTs).
11. **Public endpoints must be rate limited** with `limit()` from `_shared/rateLimit.ts` ✅ and cap their input sizes.
12. **Never return raw error messages** to clients; use `serverError()` ✅.

## 3. Navigation map

```
src/
  api/                 domain wrappers → apiClient.js → Edge Functions
  config/appConfig.js  FEATURES flags, role lists
  pages/               route components
  components/admin/    admin tabs (Products, Orders, Inventory, etc.)
  router/              routes.jsx, ProtectedRoute.jsx
  store/appStore.js    client state
supabase/
  config.toml                 ✅ verify_jwt=false for all functions
  migrations/                 0001–0008 ✅
  maintenance/                one-off admin SQL (not migrations)
  tests/                      assertions.sql (CI), checkout_smoke.sql, ci_stub.sql
  functions/
    _shared/                  ✅ supabase, cors, http, auth(+MFA), rateLimit, email, emailTemplates, validate
    account|admin|catalog|orders|storage/index.ts
scripts/                      sitemap + prerender (catalog-source.js), verify-rls.mjs, get-gmail-refresh-token.mjs
docs/                         PRD, SRS, TRD, TDD (see errata banners) + REVIEW_AND_STATUS.md, EMAIL_SETUP.md
```

✅ Present: `components/admin/*` tab split.

## 4. Verification (run before finishing any task)

```bash
npm run verify          # lint + prettier check + vitest + production build
npm run functions:check # deno check on all Edge Functions
npm run functions:test  # deno test on all Edge Function unit tests
psql -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/assertions.sql   # after migration changes
npm run verify:rls      # against the real project, after migrations
```

## 5. Email rules

1. Auth emails → Supabase Auth Custom SMTP. Do not build custom reset-token tables.
2. Commerce emails → `queueEmail(template(...))` from `_shared/email.ts`. It is fire-and-forget: a mail failure must never fail or roll back an order.
3. Every template ships both HTML and plain text; escape all dynamic values (`emailTemplates.ts` already does).
4. Gmail consumer accounts allow ~500 messages/day — avoid redundant sends.
5. The Google OAuth app must be **published (In production)**; in "Testing" the refresh token expires after ~7 days. See `docs/EMAIL_SETUP.md`.
