-- FikarNot: initial Supabase Postgres schema
-- Converted from server/db/schema.js (SQLite).
--
-- What's DIFFERENT from the old schema, and why:
--   * users, sessions, two_factor_challenges, email_verification_tokens,
--     password_reset_tokens  -> all removed. Supabase Auth (auth.users) now
--     owns accounts, sessions/JWTs, email verification, password reset, and
--     TOTP 2FA (Supabase's built-in MFA). We keep a `profiles` table for the
--     app-specific bits Supabase Auth doesn't store: display name and role.
--   * Every "user_id" / "uploaded_by" / "actor_user_id" / "updated_by" column
--     now references auth.users(id) (uuid) instead of the old TEXT users.id.
--   * *_json TEXT columns (cart_json, coupon_json, tags_json, details_json...)
--     are now native `jsonb`. Send/receive real JSON, not JSON strings.
--   * REAL money columns are NUMERIC(12,2). 0/1 flag columns are BOOLEAN.
--   * COLLATE NOCASE (case-insensitive email/sku/code) is done with citext.
--   * All other TEXT ids (orders, products, etc.) are unchanged — still
--     app-generated prefixed strings like "u-xxxxxxxx", to keep order/invoice
--     numbers and existing frontend code stable.
--
-- Run this against a fresh Supabase project (SQL editor, or `supabase db push`).

create extension if not exists citext;
create extension if not exists pgcrypto; -- gen_random_uuid(), etc.

-- =========================================================================
-- Profiles (extends auth.users)
-- =========================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'customer' check (role in ('customer','editor','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 'customer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- Customer account state
-- =========================================================================
create table customer_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cart_json jsonb not null default '[]',
  wishlist_json jsonb not null default '[]',
  recently_viewed_json jsonb not null default '[]',
  comparison_json jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table customer_addresses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  name text not null,
  line1 text not null,
  city text not null,
  region text not null default '',
  postal_code text not null default '',
  country text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customer_addresses_user_id on customer_addresses(user_id);

-- =========================================================================
-- Catalog
-- =========================================================================
create table categories (
  id text primary key,
  name text not null,
  description text not null default '',
  color text not null default '#3E8E5A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id text primary key,
  name text not null,
  sku citext not null unique,
  category_id text not null references categories(id),
  price numeric(12,2) not null,
  stock integer not null default 0,
  stock_threshold integer not null default 10,
  rating numeric(3,2) not null default 0,
  image text not null default '',
  images_json jsonb not null default '[]',
  tags_json jsonb not null default '[]',
  featured boolean not null default false,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category_id on products(category_id);

create table inventory_logs (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  product_name text not null,
  previous_stock integer not null,
  next_stock integer not null,
  change integer not null,
  reason text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table catalog_meta (
  key text primary key,
  value jsonb not null
);

-- =========================================================================
-- Coupons
-- =========================================================================
create table coupons (
  id text primary key,
  code citext not null unique,
  type text not null check (type in ('percent','fixed','free_shipping')),
  value numeric(12,2) not null default 0,
  min_subtotal numeric(12,2) not null default 0,
  max_uses integer not null default 0,
  used_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  description text not null default ''
);

-- =========================================================================
-- Orders, payments, refunds
-- =========================================================================
create table orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_address text not null default '',
  payment_method text not null default 'card',
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  currency text not null default 'PKR',
  coupon_json jsonb not null default 'null',
  status text not null default 'paid'
    check (status in ('paid','processing','shipped','delivered','cancelled','return_approved','returned')),
  payment_status text not null default 'paid',
  courier text not null default '',
  tracking_number text not null default '',
  tracking_url text not null default '',
  shipment_status text not null default 'not_created',
  invoice_number text not null default '',
  payment_proof_token_hash text,
  payment_proof_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  shipment_created_at timestamptz
);
create index idx_orders_user_id on orders(user_id);
create index idx_orders_created_at on orders(created_at);

create table order_items (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  price numeric(12,2) not null,
  qty integer not null check (qty > 0)
);
create index idx_order_items_order_id on order_items(order_id);

-- return_requests is created here (ahead of refunds, which references it)
create table return_requests (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  note text not null default '',
  status text not null default 'requested'
    check (status in ('requested','approved','rejected','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, user_id)
);
create index idx_returns_user_id on return_requests(user_id);
create index idx_returns_order_id on return_requests(order_id);

create table payments (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  amount numeric(12,2) not null,
  currency text not null,
  status text not null check (status in ('pending','paid','failed','refunded','partially_refunded')),
  raw_status text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index idx_payments_order_id on payments(order_id);
create index idx_payments_status on payments(status);

create table payment_proofs (
  id text primary key,
  order_id text not null unique references orders(id) on delete cascade,
  original_name text not null default '',
  filename text not null unique,
  mime_type text not null,
  byte_size integer not null,
  sha256 text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_payment_proofs_order_id on payment_proofs(order_id);

create table refunds (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  return_id text references return_requests(id) on delete set null,
  payment_id text references payments(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  method text not null default 'manual',
  status text not null check (status in ('pending','processing','refunded','failed')),
  provider_ref text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_refunds_order_id on refunds(order_id);
create index idx_refunds_status on refunds(status);

-- =========================================================================
-- Reviews, support, returns, notifications
-- =========================================================================
create table reviews (
  id text primary key,
  product_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  title text not null,
  body text not null,
  status text not null default 'published' check (status in ('published','hidden')),
  verified_purchase boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index idx_reviews_product_id on reviews(product_id);
create index idx_reviews_user_id on reviews(user_id);

create table support_tickets (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  category text not null default 'general',
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_support_user_id on support_tickets(user_id);

create table notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text not null default '/account',
  order_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_created_at on notifications(created_at);

create table engagement_meta (
  key text primary key,
  value jsonb not null
);

-- =========================================================================
-- Admin / ops
-- =========================================================================
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table media_assets (
  id text primary key,
  filename text not null unique,
  original_name text not null default '',
  mime_type text not null,
  byte_size integer not null,
  sha256 text not null unique,
  url text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_media_created_at on media_assets(created_at desc);

create table audit_logs (
  id text primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_logs_created_at on audit_logs(created_at desc);
create index idx_audit_logs_actor on audit_logs(actor_user_id);

-- Note: the old `rate_limits` table and `sessions`/2FA/token tables are
-- intentionally dropped here — rate limiting moves to Edge Function logic
-- (or Supabase's own request limits), and auth state lives in auth.users.

-- =========================================================================
-- Row Level Security — enabled now, policies added once Edge Functions
-- land (Stage 3). Edge Functions using the service_role key bypass RLS
-- entirely, so this mainly matters if the frontend ever talks to Postgres
-- directly via supabase-js instead of through your Edge Functions.
-- =========================================================================
alter table profiles enable row level security;
alter table customer_state enable row level security;
alter table customer_addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table reviews enable row level security;
alter table support_tickets enable row level security;
alter table return_requests enable row level security;
alter table notifications enable row level security;
