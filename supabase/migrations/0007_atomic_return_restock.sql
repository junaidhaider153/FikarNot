-- 0007_atomic_return_restock.sql
--
-- Atomic return restocking:
--   Creates complete_return(p_return_id text, p_actor uuid) RPC:
--     - Row locks return_requests, orders, and products (ordered by product_id).
--     - Validates return status is 'approved'.
--     - Restocks product inventory and writes to inventory_logs.
--     - Sets order status to 'returned' and return_requests status to 'completed'.
--     - Creates a pending refund record if a paid payment exists and no refund exists yet.
--     - Security definer with search_path = public, granted only to service_role.
--
-- Additive and idempotent.

create or replace function public.complete_return(
  p_return_id text,
  p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  ret public.return_requests%rowtype;
  o public.orders%rowtype;
  it record;
  prod public.products%rowtype;
  paid_payment public.payments%rowtype;
  v_now timestamptz := now();
begin
  -- 1. Lock and validate return request
  select * into ret from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception '%', 'RETURN_NOT_FOUND|Return request not found.';
  end if;

  if ret.status = 'completed' then
    raise exception '%', 'RETURN_ALREADY_COMPLETED|This return has already been completed.';
  end if;

  if ret.status <> 'approved' then
    raise exception '%', 'INVALID_RETURN_STATUS|Only approved returns can be completed.';
  end if;

  -- 2. Lock and validate order
  select * into o from public.orders where id = ret.order_id for update;
  if not found then
    raise exception '%', 'ORDER_NOT_FOUND|Order not found for return request.';
  end if;

  -- 3. Lock products in deterministic order and restock
  for it in select * from public.order_items where order_id = ret.order_id order by product_id loop
    select * into prod from public.products where id = it.product_id for update;
    if found then
      update public.products
      set stock = stock + it.qty, updated_at = v_now
      where id = prod.id;

      insert into public.inventory_logs (
        id, product_id, product_name, previous_stock, next_stock, change, reason, user_id, created_at
      ) values (
        'inv-' || gen_random_uuid(),
        prod.id,
        it.product_name,
        prod.stock,
        prod.stock + it.qty,
        it.qty,
        'Return ' || p_return_id || ' completed',
        p_actor,
        v_now
      );
    end if;
  end loop;

  -- 4. Transition order and return request statuses
  update public.orders
  set status = 'returned', updated_at = v_now
  where id = ret.order_id;

  update public.return_requests
  set status = 'completed', updated_at = v_now
  where id = p_return_id;

  -- 5. Create pending refund record if order has paid payment and no refund row exists
  select * into paid_payment from public.payments
  where order_id = ret.order_id and status in ('paid', 'partially_refunded')
  order by updated_at desc limit 1;

  if found and not exists (select 1 from public.refunds where return_id = p_return_id) then
    insert into public.refunds (
      id, order_id, return_id, payment_id, amount, currency, method, status, note, created_at, updated_at
    ) values (
      'ref-' || gen_random_uuid(),
      ret.order_id,
      p_return_id,
      paid_payment.id,
      paid_payment.amount,
      coalesce(paid_payment.currency, o.currency, 'PKR'),
      'manual',
      'pending',
      'Refund is due after return completion; staff must confirm provider payout.',
      v_now,
      v_now
    );
  end if;
end $$;

revoke execute on function public.complete_return(text, uuid) from public, anon, authenticated;
grant execute on function public.complete_return(text, uuid) to service_role;
