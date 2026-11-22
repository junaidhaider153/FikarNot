# ROADMAP — FikarNot (re-baselined after the November 2026 review)

Legend: ✅ done in this package · 🔧 you must do it (needs your accounts/dashboards) · ⬜ not started

## Decisions taken

- Guests may check out with **Cash on Delivery only**.
- The Supabase project is **already live** → every database change is additive and idempotent; back up before applying.
- Admin / sender mailbox: **fikarnotofficial.shop@gmail.com**.
- Commerce email goes through the **Gmail API over HTTPS** (Supabase blocks SMTP ports 25/587 in Edge Functions).

## Phase 0 — Lock down & stabilise

- ✅ RLS on all tables + privilege revoke (migration 0004); `verify:rls` script
- ✅ SQLite files deleted, `.gitignore` hardened, legacy stack moved to `legacy/`
- ✅ `config.toml`, shared Edge Function modules, no raw error leakage
- ✅ Staff MFA enforced server-side (AAL2 when a factor is enrolled)
- 🔧 **Back up the database, apply 0004 + 0005, run `npm run verify:rls`** (see DEPLOYMENT.md)
- 🔧 Check git history for the old SQLite file / `.env`; if present and passwords were reused anywhere, rotate them (a purge with `git filter-repo` is optional because the data was seed-only)
- 🔧 Run `supabase/maintenance/promote_admin.sql` then `remove_seeded_demo_users.sql`

## Phase 1 — Correct checkout & payments

- ✅ Transactional `create_order()` (no oversell, no orphan orders, coupon limits, sequence numbers)
- ✅ Atomic `cancel_order()`; rate limiting; coupon wildcard fix; coupon-toggle route
- ✅ Guest = COD only (server + UI)
- ✅ Admin-only refunds & deletes; forward-only order status for editors; return-status state machine; audit log on status/delete
- ✅ Invoice endpoint + printable `/invoice/:id` page
- ✅ Order confirmation / payment confirmed / tracking emails (Gmail API)
- 🔧 Email setup: Google Cloud OAuth → refresh token → `supabase secrets set` (docs/EMAIL_SETUP.md)
- 🔧 Supabase Auth → SMTP: Gmail App Password, port 465; confirm "Confirm email" is ON
- ✅ Order lifecycle clean-up: explicit `pending_payment` order status (migration 0006); COD orders start as `processing`/`unpaid`; atomic `collect_cod` RPC (migration 0008) writes a `payments` row and enables COD refunds
- ✅ Make return restocking atomic (RPC `complete_return` in migration 0007)
- ✅ Zod request validation in every function (via `_shared/validate.ts`)

## Phase 2 — Features hidden behind flags

- ✅ PayFast, AI chat, hero-video upload hidden by `FEATURES`
- ✅ Port AI chat (Gemini) to a new `chat` function (reference: `legacy/server/lib/gemini.js`), connected ChatWidget, enabled `VITE_ENABLE_AI_CHAT=true`
- ✅ Hero video upload via Supabase Storage signed upload URLs
- ⬜ PayFast (only if you actually need card payments in Pakistan)
- ⬜ Customer-side 2FA enrollment screen (admin has one)

## Phase 3 — Tests & cleanup

- ✅ CI: lint, prettier, vitest (26 tests), build, `npm audit`, Deno type-check, DB assertions on Postgres 16
- ✅ Edge Function unit tests (`deno test` with a mocked client)
- ⬜ Delete `legacy/` once the above is comfortable (it stays in git history)
- ⬜ Real product catalogue: seed prices (249, 89…) are USD-scale for a PKR store and images hotlink `image.qwenlm.ai`; replace both, then drop that host from the CSP in `index.html`

## Phase 4 — Quality (post-launch)

- ⬜ Split `AdminPage.jsx` (2.2k lines) and slim `appStore.js`; adopt TanStack Query
- ⬜ Lazy-load Account/Checkout/ProductDetail (AdminPage is already a separate chunk; main bundle is 183 KB gz)
- ⬜ Accessibility pass, Lighthouse CI
