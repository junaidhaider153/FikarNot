# Deployment — Vercel + Supabase

> Your Supabase project is **live**. Follow the order below and take a backup first.

## 0. Before you start

- Supabase Dashboard → Database → **Backups** (or `pg_dump`) — take a manual backup.
- Install the Supabase CLI and run `supabase login` and `supabase link --project-ref <ref>`.

## 1. Database (one time, in this order)

1. Confirm which migrations the live project already has: `supabase migration list`. `0001`–`0003` should be applied (the project was seeded). If the CLI shows them as not applied, mark them applied with `supabase migration repair --status applied 0001 0002 0003` instead of re-running them.
2. `supabase db push` → applies **0004** (RLS lockdown) and **0005** (checkout hardening). Both are idempotent and add constraints as `NOT VALID`, so existing rows can never block them.
3. Prove the lockdown:
   ```bash
   VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<publishable key> npm run verify:rls
   ```
   Every line must say `PASS`. Dashboard → Advisors → Security should show no "RLS disabled" warnings.
4. Admin account: follow the steps at the top of `supabase/maintenance/promote_admin.sql`, then run `remove_seeded_demo_users.sql`.

## 2. Edge Functions

```bash
cp supabase/functions/.env.example supabase/functions/.env   # fill in, never commit
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy          # uses supabase/config.toml (verify_jwt = false)
```

Set `ALLOWED_ORIGINS` to every origin that serves the site. Email: see `docs/EMAIL_SETUP.md`.

## 3. Storage buckets

Dashboard → Storage: `payment-proofs` must be **private** (migration 0004 enforces this if it exists). Product/site images use the public bucket(s) already configured.

## 4. Vercel

Environment variables (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SITE_URL`. Leave the `VITE_ENABLE_*` flags unset.
`vercel.json` no longer proxies to Railway; it sends security headers and an SPA fallback.
The production build generates `sitemap.xml` and prerendered product pages from the live `catalog` function and **fails** (instead of publishing demo SEO data) if `VITE_SUPABASE_URL` is missing.

## 5. Smoke test (do it on the live site)

1. Guest: add a product → checkout → only **Cash on Delivery** is offered → order placed, confirmation email arrives.
2. Signed-in customer: bank transfer → upload payment slip → admin sees it (5-minute signed link) → confirm → "payment confirmed" email.
3. Admin: change order status, add tracking (email), cancel an order (stock returns), open `/invoice/<id>`.
4. Enrol TOTP on the admin account, sign out/in, confirm the admin area works. Only then set `STAFF_MFA_REQUIRED=1`.
5. `supabase functions logs orders` — no unexpected errors.

## Rollback

Edge Functions: redeploy the previous commit. Migrations 0004/0005 are additive; to undo 0004 grant privileges back **only** if you intend to expose the tables (you should not).
