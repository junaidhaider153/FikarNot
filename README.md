# FikarNot

E-commerce storefront and admin dashboard (PKR). React 19 + Vite on Vercel; Supabase (Postgres, Auth + TOTP, Storage, Deno Edge Functions) as the backend.

## Quick start

```bash
nvm use                       # Node 22
npm ci
cp .env.example .env.local    # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Checks

```bash
npm run verify          # lint + prettier + vitest + build
npm run functions:check # type-check the Edge Functions (needs Deno)
npm run verify:rls      # prove the public key cannot read your tables (needs env, run against Supabase)
```

## Layout

- `src/` React app · `supabase/migrations` SQL · `supabase/functions` Edge Functions (`_shared/` holds auth, CORS, rate limiting, email)
- `supabase/tests` database assertions run in CI · `scripts/` SEO build + ops helpers
- `legacy/` retired Node + SQLite server (reference only)

## Documentation

`DEPLOYMENT.md` (go-live steps) · `AGENTS.md` (rules for AI assistants) · `ROADMAP.md` · `docs/REVIEW_AND_STATUS.md` (what the November 2026 review found and changed) · `docs/EMAIL_SETUP.md` · `docs/PRD|SRS|TRD|TDD.md` (see the errata at the top of each)

Roles: **admin** (everything), **editor** (catalogue, orders, coupons — no refunds/deletes), **customer**, guest (browse + Cash-on-Delivery checkout).
