-- Minimal stand-ins for the roles/schemas Supabase provides, so the migrations can run on plain Postgres (CI and local tests). Not for production.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth; create schema if not exists storage;
create table if not exists auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_sso_user boolean);
create table if not exists auth.identities (id uuid, user_id uuid, identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', true), ('media', 'media', true) on conflict (id) do nothing;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
