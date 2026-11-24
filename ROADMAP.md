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

## Phase 2 — Features hidden behind flags & manual payments

- ✅ PayFast, AI chat, hero-video upload hidden by `FEATURES`
- ✅ Port AI chat (Gemini) to a new `chat` function (reference: `legacy/server/lib/gemini.js`), connected ChatWidget, enabled `VITE_ENABLE_AI_CHAT=true`
- ✅ Hero video upload via Supabase Storage signed upload URLs
- ✅ Manual Pakistani payment methods (Meezan/Bank Transfer, JazzCash, EasyPaisa) with central admin settings configuration and payment instruction card
- ✅ Payment slip image upload and verification with admin preview, security checks, and single-click payment confirmation
- ⬜ PayFast (only if you actually need card payments in Pakistan)
- ✅ Customer-side 2FA enrollment screen (shared TwoFactorSection in Account & Admin)

## Phase 3 — Localization, tracking, warehouse operations & hardening

- ✅ Customer mobile phone verification (`03xx-xxxxxxx`, `+923xxxxxxxxx`) at checkout and migration `0010_customer_phone.sql`
- ✅ 1-Click WhatsApp Order Hub: WhatsApp order confirmation button on storefront and normalized courier WhatsApp dispatch from Admin Order details
- ✅ Storefront polish: real-time low-stock urgency alerts, account tracking banner, invoice phone display, and Schema.org SEO PKR currency fix
- ✅ Public & Guest Order Tracking Hub (`/track`): dual-factor verification (Order ID + exact normalized phone/email), rate limited per IP and per order ID, with sensitive customer PII stripped
- ✅ Printable Courier Packing Slips & Thermal Shipping Labels (`/admin/orders/:orderId/packing-slip`): 4×6" flyer label & standard A4 formats, vector Code 39 barcodes, and high-contrast COD vs Prepaid callouts
- ✅ Hardened Edge Function architecture: isolated `handler.ts` modules and clean unconditional `Deno.serve(handler)` entrypoints across `orders` and `chat`
- ✅ Media storage bucket XSS security: removed `image/svg+xml` from allowed MIME types in migration 0009 and ci_stub
- ✅ Full automated test coverage: 15 Vitest test files (74+ tests) + 48 Deno Edge Function tests

## Phase 4 — Quality (post-launch)

- ✅ Modularize `AdminPage.jsx` (~2.8k lines) into dedicated tab components in `src/components/admin/` with test suite
- ⬜ Slim `appStore.js`; adopt TanStack Query
- ✅ Lazy-load Account/Checkout/ProductDetail and non-critical routes; Recharts vendor isolation; initial bundle reduced from 709 kB to 294 kB (88 kB gz)
- ✅ Accessibility pass & form semantics audit (ARIA attributes, mobile drawer controls, skip-links, and keyboard focus trap)
- ⬜ Delete `legacy/` once comfortable (it stays in git history)
- ✅ Real product catalogue: replace demo prices with realistic PKR values and updated Pakistani shipping/return policies
