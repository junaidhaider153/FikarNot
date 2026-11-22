# Review & status — November 2026

Basis: static review of the repository, plus executed checks (`npm ci`, eslint, vite build, prettier, vitest, `npm audit`, Deno type-check, and the migrations/functions logic run on PostgreSQL 16). **Not verified:** the live Supabase project's dashboard state, Git history, and a real end-to-end run against Supabase/Gmail.

## 1. Corrections to earlier documents

| Claim                                                                                   | Reality                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "11 of 21 tables lack RLS" (verification report)                                        | **12** lacked it (9 had it). Fixed by migration 0004.                                                                                           |
| "Guests are logged-in only"                                                             | Guest checkout existed in the UI and the server. Guest bank-transfer orders could never upload a payment slip. **Decision: guests = COD only.** |
| 2FA "login-side only"                                                                   | Enrollment exists (admin page). Real gap: the server never required the 2FA-verified token. Fixed.                                              |
| Roadmap "Gmail SMTP from Edge Functions, port 587 fallback"                             | Supabase blocks ports 25/587 in Edge Functions. Replaced by Gmail API over HTTPS.                                                               |
| Docs describe `_shared/`, zod, TanStack Query, feature flags, `config.toml` as existing | None existed. `_shared/`, flags and `config.toml` now do; zod and TanStack Query remain planned.                                                |
| `ALLOWED_ORIGINS`                                                                       | Code read `FIKARNOT_FRONTEND_ORIGIN`. Both are now accepted.                                                                                    |
| Roadmap 4.4 "lazy-load AdminPage"                                                       | Already a separate chunk.                                                                                                                       |
| `npx vitest run` / `format:check` as checks                                             | Failed before this package (no vitest tests; 68 unformatted files). Fixed.                                                                      |

## 2. Findings and status

| ID  | Severity | Finding                                                                                                                    | Status                                                                                     |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| N-1 | High     | 12 tables readable/writable with the public key                                                                            | ✅ 0004 (+ `verify:rls`; **apply to live**)                                                |
| B-1 | High     | Checkout not transactional: oversell, orphan orders, coupon overuse, duplicate-line stock bug                              | ✅ `create_order()` (race-tested: 6 buyers, 1 unit → 1 order)                              |
| B-2 | High     | Order/ticket numbers from reading all rows (breaks > 1,000 rows, collides)                                                 | ✅ sequences initialised from existing max                                                 |
| B-3 | High     | Guest manual-payment orders could not attach proof                                                                         | ✅ guests COD-only                                                                         |
| B-4 | High     | 2FA not enforced by the API                                                                                                | ✅ AAL2 required for staff with a verified factor; `STAFF_MFA_REQUIRED=1` forces enrolment |
| B-5 | High     | Public order/ticket/coupon endpoints unrate-limited                                                                        | ✅ DB-backed limiter                                                                       |
| —   | Medium   | Coupon `ilike` wildcards; coupon toggle route missing; coupon expiry compared string to number client-side                 | ✅                                                                                         |
| —   | Medium   | Editors could refund/delete orders; status could move backwards; returns could double-restock                              | ✅ admin-only; forward-only; state machine; audit log                                      |
| —   | Medium   | Public settings endpoint returned every row                                                                                | ✅ allow-listed (same 43 keys)                                                             |
| —   | Medium   | Build depended on legacy `/api/catalog`; sitemap namespace invalid                                                         | ✅                                                                                         |
| —   | Medium   | CSP injection plugin could never match; `frame-ancestors` ignored in `<meta>`                                              | ✅ placeholder + Vercel header                                                             |
| —   | Medium   | Raw DB errors returned to clients                                                                                          | ✅                                                                                         |
| —   | Medium   | Migration 0003 failed on a clean database                                                                                  | ✅ cast fixed                                                                              |
| —   | Medium   | Cart shipping used USD defaults (75 / 6.95) vs server 5000 / 500 PKR                                                       | ✅                                                                                         |
| —   | Medium   | Seeded admin on `@fikarnot.shop` (mailbox ownership unconfirmed)                                                           | 🔧 run `maintenance/*.sql`                                                                 |
| —   | Low      | PayFast / AI chat / video visible but returned 501                                                                         | ✅ hidden by flags                                                                         |
| —   | Low      | 8 audit findings (all via `googleapis`/`qs`)                                                                               | ✅ `googleapis` removed (re-run `npm audit`)                                               |
| —   | Open     | Manual-payment orders start as `paid` with `payment_status=pending`; COD has no payment record, so COD refunds cannot work | ⬜ Phase 1 backlog                                                                         |
| —   | Open     | Return restock not atomic; no zod validation; no Edge Function unit tests; seed catalogue unrealistic                      | ⬜                                                                                         |
| —   | Open     | `getCaller` makes 2–3 DB calls per request (fine now, optimise later)                                                      | ⬜                                                                                         |

## 3. What changed (files)

- **New:** migrations `0004`, `0005`; `supabase/config.toml`; `supabase/functions/_shared/*`; `supabase/maintenance/*`; `supabase/tests/*`; `scripts/verify-rls.mjs`, `catalog-source.js`; `src/pages/InvoicePage.jsx`; tests under `src/**/*.test.js`; `vitest.config.js`; docs.
- **Rewritten:** `orders` function; `scripts/get-gmail-refresh-token.mjs` (no dependency); `vercel.json`; `vite.config.js`; CI; `.env.example`; README/DEPLOYMENT/AGENTS/ROADMAP.
- **Edited:** `storage`, `admin`, `account`, `catalog` functions (shared modules, limits, rules above); checkout/cart/coupon/layout/admin/hero-video frontend files; sitemap/prerender scripts; `index.html` CSP; `package.json`; migration `0003` (cast only).
- **Removed:** SQLite files, `src/styles.css`, `src/components/layout.jsx` (verified unused), `googleapis`. Legacy server, Dockerfiles, nginx and old scripts moved to `legacy/`.
- **Formatting:** `prettier --write` was applied to the whole project, so the diff is large. Commit it separately from the logic changes if you want a readable history.
