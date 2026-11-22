-- 0008_atomic_collect_cod.sql
-- Atomically collect Cash on Delivery payment:
--   1. Validates that the order exists, has payment_method = 'cod',
--      and is in status 'shipped' or 'delivered'.
--   2. Inserts a record into public.payments (status = 'paid').
--   3. Updates public.orders to payment_status = 'paid'.
--   4. Creates an audit log entry.
--   5. Safely and idempotently handles repeated calls if already paid.

create or replace function public.collect_cod(
  p_order_id text,
  p_actor text,
  p_raw_status text default 'Collected by staff / courier'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id text;
  v_now timestamptz := now();
begin
  -- 1. Lock the order row to prevent concurrent collections or status races
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '%', 'ORDER_NOT_FOUND|Order ' || p_order_id || ' does not exist.';
  end if;

  if v_order.payment_method <> 'cod' then
    raise exception '%', 'INVALID_COD_ORDER|Only Cash on Delivery orders can be marked collected here.';
  end if;

  if v_order.status not in ('shipped', 'delivered') then
    raise exception '%', 'INVALID_ORDER_STATUS|COD payments can only be collected for shipped or delivered orders (current status: ' || v_order.status || ').';
  end if;

  -- 2. Idempotency check: if already paid, return without duplicating payment
  if v_order.payment_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'orderId', p_order_id,
      'alreadyCollected', true
    );
  end if;

  -- 3. Atomically insert payment row
  v_payment_id := 'pay-' || gen_random_uuid();
  insert into public.payments (
    id,
    order_id,
    provider,
    provider_payment_id,
    amount,
    currency,
    status,
    raw_status,
    created_at,
    updated_at
  )
  values (
    v_payment_id,
    p_order_id,
    'cod',
    'cod-' || p_order_id,
    v_order.total,
    coalesce(v_order.currency, 'PKR'),
    'paid',
    coalesce(p_raw_status, 'Collected by staff / courier'),
    v_now,
    v_now
  );

  -- 4. Atomically update order payment_status
  update public.orders
  set
    payment_status = 'paid',
    updated_at = v_now
  where id = p_order_id;

  -- 5. Audit log
  insert into public.audit_logs (
    id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details_json,
    created_at
  )
  values (
    'audit-' || gen_random_uuid(),
    case when p_actor ~ '^[0-9a-fA-F-]{36}$' then p_actor::uuid else null end,
    'payment.cod_collected',
    'order',
    p_order_id,
    jsonb_build_object(
      'paymentId', v_payment_id,
      'amount', v_order.total,
      'currency', coalesce(v_order.currency, 'PKR'),
      'status', v_order.status
    ),
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'orderId', p_order_id,
    'paymentId', v_payment_id,
    'amount', v_order.total,
    'alreadyCollected', false
  );
end;
$$;

revoke all on function public.collect_cod(text, text, text) from public, anon, authenticated;
grant execute on function public.collect_cod(text, text, text) to service_role;
