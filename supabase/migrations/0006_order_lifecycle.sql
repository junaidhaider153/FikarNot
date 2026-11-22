-- 0006_order_lifecycle.sql
--
-- Order lifecycle correctness:
--   1. Widen orders_status_check constraint to include 'pending_payment'.
--   2. Update existing manual payment orders (payment_status = 'pending' and status = 'paid')
--      to have status = 'pending_payment'.
--   3. Update create_order() so manual payments start as pending_payment/pending,
--      and COD orders start as processing/unpaid.
--   4. Update cancel_order() so pending_payment orders can be cancelled and restocked.
--
-- Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Status CHECK constraint widening
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_status_check'
  ) then
    alter table public.orders drop constraint orders_status_check;
  end if;

  alter table public.orders add constraint orders_status_check
    check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'return_approved', 'returned'));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Consistency migration for existing live data
-- ---------------------------------------------------------------------------
update public.orders
set status = 'pending_payment', updated_at = now()
where payment_method in ('jazzcash', 'easypaisa', 'bank_transfer')
  and payment_status = 'pending'
  and status = 'paid';

-- ---------------------------------------------------------------------------
-- 3. create_order(): manual payments start as pending_payment
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_user_id uuid,
  p_customer jsonb,   -- {name, email, address, paymentMethod}
  p_items jsonb,      -- [{productId, qty}]
  p_coupon_code text,
  p_config jsonb      -- {currency, freeShippingThreshold, shippingFlatRate, taxRate}
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_method text := lower(coalesce(nullif(trim(p_customer->>'paymentMethod'), ''), 'cod'));
  v_is_manual boolean := v_method in ('jazzcash', 'easypaisa', 'bank_transfer');
  v_currency text := upper(coalesce(nullif(p_config->>'currency', ''), 'PKR'));
  v_free_threshold numeric := greatest(0, coalesce((p_config->>'freeShippingThreshold')::numeric, 0));
  v_flat numeric := greatest(0, coalesce((p_config->>'shippingFlatRate')::numeric, 0));
  v_tax_rate numeric := greatest(0, least(100, coalesce((p_config->>'taxRate')::numeric, 0)));
  rec record;
  prod public.products%rowtype;
  cp public.coupons%rowtype;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_shipping numeric;
  v_tax numeric;
  v_total numeric;
  v_ship_free boolean := false;
  v_id text;
  v_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_now timestamptz := now();
  v_coupon_json jsonb := null;
begin
  if v_method not in ('cod', 'jazzcash', 'easypaisa', 'bank_transfer') then
    raise exception '%', 'INVALID_PAYMENT_METHOD|Unsupported payment method.';
  end if;
  -- Guests may only pay on delivery (manual transfers need an account so the
  -- payment slip can be tied to its owner).
  if v_is_manual and p_user_id is null then
    raise exception '%', 'LOGIN_REQUIRED|Please sign in to pay by bank transfer or mobile wallet. Guests can choose Cash on Delivery.';
  end if;

  -- Merge duplicate lines, lock products in a stable order (no deadlocks).
  create temporary table if not exists _co_items (product_id text primary key, qty integer not null) on commit drop;
  truncate _co_items;
  for rec in
    select e->>'productId' as pid, sum(greatest(0, floor(coalesce((e->>'qty')::numeric, 0)))::integer) as qty
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    group by 1
  loop
    if rec.pid is not null and rec.qty > 0 then
      insert into _co_items values (rec.pid, rec.qty);
    end if;
  end loop;
  if not exists (select 1 from _co_items) then
    raise exception '%', 'EMPTY_ORDER|Your cart is empty or unavailable.';
  end if;

  for rec in select * from _co_items order by product_id loop
    select * into prod from public.products where id = rec.product_id for update;
    if not found then
      raise exception '%', 'PRODUCT_NOT_FOUND|Product ' || rec.product_id || ' was not found.';
    end if;
    if prod.stock < rec.qty then
      raise exception '%', 'INSUFFICIENT_STOCK|' || prod.name || ' only has ' || prod.stock || ' item(s) left.';
    end if;
    v_subtotal := v_subtotal + prod.price * rec.qty;
  end loop;
  v_subtotal := round(v_subtotal, 2);

  -- Coupon (row-locked so max_uses cannot be exceeded by concurrent orders).
  if v_code <> '' then
    select * into cp from public.coupons where code = v_code for update;
    if not found then
      raise exception '%', 'INVALID_COUPON|That coupon code is not valid';
    end if;
    if not cp.active or (cp.expires_at is not null and cp.expires_at <= v_now)
       or (cp.max_uses > 0 and cp.used_count >= cp.max_uses) then
      raise exception '%', 'INVALID_COUPON|That coupon is expired, inactive, or has reached its usage limit';
    end if;
    if v_subtotal < cp.min_subtotal then
      raise exception '%', 'COUPON_MIN_SUBTOTAL|Spend at least ' || to_char(cp.min_subtotal, 'FM999999990.00') || ' to use ' || v_code;
    end if;
    v_ship_free := cp.type = 'free_shipping';
    if cp.type = 'percent' then v_discount := least(v_subtotal, v_subtotal * cp.value / 100);
    elsif cp.type = 'fixed' then v_discount := least(v_subtotal, cp.value);
    end if;
    v_discount := round(v_discount, 2);
    v_coupon_json := jsonb_build_object('code', cp.code, 'type', cp.type, 'value', cp.value,
                                        'discount', v_discount, 'shippingFree', v_ship_free);
  end if;

  v_shipping := case when v_subtotal = 0 or v_subtotal >= v_free_threshold or v_ship_free then 0 else v_flat end;
  v_tax := round(greatest(0, v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_total := round(greatest(0, v_subtotal - v_discount) + v_shipping + v_tax, 2);
  v_id := 'FN-' || lpad(nextval('public.order_number_seq')::text, 4, '0');

  insert into public.orders (
    id, user_id, customer_name, customer_email, customer_address, payment_method,
    subtotal, discount, shipping, tax, total, currency, coupon_json,
    status, payment_status, invoice_number, created_at, updated_at
  ) values (
    v_id, p_user_id,
    left(coalesce(nullif(trim(p_customer->>'name'), ''), 'Guest'), 120),
    lower(trim(p_customer->>'email')),
    left(coalesce(p_customer->>'address', ''), 500),
    v_method, v_subtotal, v_discount, v_shipping, v_tax, v_total, v_currency,
    coalesce(v_coupon_json, 'null'::jsonb),
    case
      when v_is_manual then 'pending_payment'
      when v_method = 'cod' then 'processing'
      else 'paid'
    end,
    case
      when v_is_manual then 'pending'
      else 'unpaid'
    end,
    'INV-' || substring(v_id from 4), v_now, v_now
  );

  for rec in select * from _co_items order by product_id loop
    select * into prod from public.products where id = rec.product_id;
    insert into public.order_items (id, order_id, product_id, product_name, price, qty)
    values (v_id || '-' || prod.id, v_id, prod.id, prod.name, prod.price, rec.qty);
    update public.products set stock = stock - rec.qty, updated_at = v_now where id = prod.id;
    insert into public.inventory_logs (id, product_id, product_name, previous_stock, next_stock, change, reason, user_id, created_at)
    values ('inv-' || gen_random_uuid(), prod.id, prod.name, prod.stock, prod.stock - rec.qty, -rec.qty, 'Order ' || v_id, p_user_id, v_now);
  end loop;

  if v_code <> '' then
    update public.coupons set used_count = used_count + 1 where id = cp.id;
  end if;

  return jsonb_build_object('orderId', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- 4. cancel_order(): allows cancelling pending_payment orders
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id text, p_actor uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  it record;
  prod public.products%rowtype;
  v_now timestamptz := now();
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception '%', 'ORDER_NOT_FOUND|Order not found.'; end if;
  if o.status not in ('pending_payment', 'paid', 'processing') then
    raise exception '%', 'ORDER_NOT_CANCELLABLE|This order can no longer be cancelled.';
  end if;
  for it in select * from public.order_items where order_id = p_order_id order by product_id loop
    select * into prod from public.products where id = it.product_id for update;
    if found then
      update public.products set stock = stock + it.qty, updated_at = v_now where id = prod.id;
      insert into public.inventory_logs (id, product_id, product_name, previous_stock, next_stock, change, reason, user_id, created_at)
      values ('inv-' || gen_random_uuid(), prod.id, it.product_name, prod.stock, prod.stock + it.qty, it.qty,
              coalesce(p_reason, 'Order ' || p_order_id || ' cancelled'), p_actor, v_now);
    end if;
  end loop;
  update public.orders set status = 'cancelled', cancelled_at = v_now, updated_at = v_now where id = p_order_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Revoke from anon/authenticated, grant to service_role
-- ---------------------------------------------------------------------------
revoke execute on function public.create_order(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cancel_order(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, jsonb, jsonb, text, jsonb) to service_role;
grant execute on function public.cancel_order(text, uuid, text) to service_role;
