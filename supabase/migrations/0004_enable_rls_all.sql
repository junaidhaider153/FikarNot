-- 0004 — Lock down the public schema (P0 security).
--
-- Why: 0001_init.sql enabled RLS on only 9 of 21 tables. Supabase exposes
-- every table in `public` through the REST API to anyone holding the public
-- anon key, so payments, refunds, coupons, products, site_settings, audit
-- logs etc. were readable/writable without logging in.
--
-- Safe for the live project: the React app has ZERO supabase.from() calls and
-- every Edge Function uses the service_role key, which bypasses RLS and keeps
-- its own grants. Only direct anon/authenticated REST access is removed.
--
-- Idempotent: safe to run more than once.

-- 1. Enable RLS on the 12 tables that were missing it (no policies = deny all
--    for anon/authenticated).
alter table if exists public.payments        enable row level security;
alter table if exists public.payment_proofs  enable row level security;
alter table if exists public.refunds         enable row level security;
alter table if exists public.coupons         enable row level security;
alter table if exists public.products        enable row level security;
alter table if exists public.categories      enable row level security;
alter table if exists public.inventory_logs  enable row level security;
alter table if exists public.catalog_meta    enable row level security;
alter table if exists public.engagement_meta enable row level security;
alter table if exists public.site_settings   enable row level security;
alter table if exists public.media_assets    enable row level security;
alter table if exists public.audit_logs      enable row level security;

-- Re-assert on the 9 that already had it (harmless, documents intent).
alter table if exists public.profiles           enable row level security;
alter table if exists public.customer_state     enable row level security;
alter table if exists public.customer_addresses enable row level security;
alter table if exists public.orders             enable row level security;
alter table if exists public.order_items        enable row level security;
alter table if exists public.reviews            enable row level security;
alter table if exists public.support_tickets    enable row level security;
alter table if exists public.return_requests    enable row level security;
alter table if exists public.notifications      enable row level security;

-- 2. Defence in depth: remove direct table/sequence/function privileges from
--    the browser-facing roles.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Supabase also sets default privileges for supabase_admin; best effort only.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
exception when others then
  raise notice 'Skipped supabase_admin default privileges: %', sqlerrm;
end $$;

-- 3. Pin the search_path of the SECURITY DEFINER signup trigger function.
alter function public.handle_new_user() set search_path = public;

-- 4. Payment slips must never be public. (Bucket is created in the dashboard;
--    this only tightens it if it already exists.)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where id = 'payment-proofs';
  end if;
end $$;
