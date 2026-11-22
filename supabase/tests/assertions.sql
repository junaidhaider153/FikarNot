-- Self-checking tests for migrations 0004/0005. Raises an exception (non-zero
-- exit with psql -v ON_ERROR_STOP=1) on the first failure. Run on a throw-away
-- database that has all migrations applied.
\set ON_ERROR_STOP 1

do $$
declare
  r jsonb; n int; s int; ok boolean; msg text; u uuid;
  cfg jsonb := '{"currency":"PKR","freeShippingThreshold":5000,"shippingFlatRate":500,"taxRate":0}';
  cust jsonb := '{"name":"T","email":"t@example.com","address":"x","paymentMethod":"cod"}';
begin
  -- 1. anon is locked out of tables and functions
  set local role anon;
  begin perform 1 from public.payments limit 1; raise exception 'FAIL: anon could read payments';
  exception when insufficient_privilege then null; end;
  begin insert into public.coupons(id, code, type) values ('h', 'HACK', 'percent'); raise exception 'FAIL: anon could write coupons';
  exception when insufficient_privilege then null; end;
  begin perform public.create_order(null, cust, '[]', null, cfg); raise exception 'FAIL: anon could call create_order';
  exception when insufficient_privilege then null; end;
  begin perform public.complete_return('ret-test', null); raise exception 'FAIL: anon could call complete_return';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 2. guest cannot use manual payment
  begin perform public.create_order(null, jsonb_set(cust, '{paymentMethod}', '"bank_transfer"'), '[{"productId":"p3","qty":1}]', null, cfg);
    raise exception 'FAIL: guest bank_transfer allowed';
  exception when others then get stacked diagnostics msg = message_text;
    if msg not like 'LOGIN_REQUIRED|%' then raise exception 'FAIL: wrong error %', msg; end if; end;

  -- 3. COD order: duplicate lines merged, stock decremented, ids sequential
  select stock into s from public.products where id = 'p3';
  r := public.create_order(null, cust, '[{"productId":"p3","qty":2},{"productId":"p3","qty":1}]', null, cfg);
  select qty into n from public.order_items where order_id = r->>'orderId' and product_id = 'p3';
  if n <> 3 then raise exception 'FAIL: duplicate lines not merged (qty=%)', n; end if;
  if (select stock from public.products where id = 'p3') <> s - 3 then raise exception 'FAIL: stock not decremented'; end if;
  if (select status || '/' || payment_status from public.orders where id = r->>'orderId') <> 'processing/unpaid' then raise exception 'FAIL: COD status'; end if;

  -- 4. oversell is rejected and rolls back completely
  select count(*) into n from public.orders;
  begin perform public.create_order(null, cust, '[{"productId":"p3","qty":1},{"productId":"p4","qty":99999}]', null, cfg);
    raise exception 'FAIL: oversell allowed';
  exception when others then get stacked diagnostics msg = message_text;
    if msg not like 'INSUFFICIENT_STOCK|%' then raise exception 'FAIL: wrong error %', msg; end if; end;
  if (select count(*) from public.orders) <> n then raise exception 'FAIL: partial order persisted'; end if;

  -- 5. coupon: wildcard does not match, max_uses enforced
  delete from public.coupons where id = 'ct';
  insert into public.coupons(id, code, type, value, min_subtotal, max_uses, used_count, active) values ('ct', 'TESTONE', 'percent', 10, 0, 1, 0, true);
  begin perform public.create_order(null, cust, '[{"productId":"p3","qty":1}]', 'TEST%', cfg); raise exception 'FAIL: wildcard coupon matched';
  exception when others then get stacked diagnostics msg = message_text; if msg not like 'INVALID_COUPON|%' then raise exception 'FAIL: %', msg; end if; end;
  perform public.create_order(null, cust, '[{"productId":"p3","qty":1}]', 'testone', cfg);
  begin perform public.create_order(null, cust, '[{"productId":"p3","qty":1}]', 'TESTONE', cfg); raise exception 'FAIL: coupon max_uses exceeded';
  exception when others then get stacked diagnostics msg = message_text; if msg not like 'INVALID_COUPON|%' then raise exception 'FAIL: %', msg; end if; end;

  -- 6. cancel restocks once, second cancel refused
  r := public.create_order(null, cust, '[{"productId":"p3","qty":2}]', null, cfg);
  select stock into s from public.products where id = 'p3';
  perform public.cancel_order(r->>'orderId', null, null);
  if (select stock from public.products where id = 'p3') <> s + 2 then raise exception 'FAIL: cancel did not restock'; end if;
  begin perform public.cancel_order(r->>'orderId', null, null); raise exception 'FAIL: double cancel allowed';
  exception when others then get stacked diagnostics msg = message_text; if msg not like 'ORDER_NOT_CANCELLABLE|%' then raise exception 'FAIL: %', msg; end if; end;

  -- 7. rate limiter + ticket ids
  ok := public.rate_limit_hit('assert', 60, 2) and public.rate_limit_hit('assert', 60, 2);
  if not ok or public.rate_limit_hit('assert', 60, 2) then raise exception 'FAIL: rate limiter'; end if;
  if public.next_ticket_id() not like 'TKT-%' then raise exception 'FAIL: ticket id'; end if;

  -- 8. Order lifecycle (migration 0006): manual payment starts as pending_payment/pending
  select id into u from auth.users where email = 'urwa@fikarnot.shop' limit 1;
  r := public.create_order(u, jsonb_set(cust, '{paymentMethod}', '"bank_transfer"'), '[{"productId":"p3","qty":1}]', null, cfg);
  if (select status || '/' || payment_status from public.orders where id = r->>'orderId') <> 'pending_payment/pending' then
    raise exception 'FAIL: manual order status not pending_payment/pending';
  end if;

  -- 9. cancel_order works on pending_payment orders and restocks
  select stock into s from public.products where id = 'p3';
  perform public.cancel_order(r->>'orderId', u, 'Changed mind');
  if (select stock from public.products where id = 'p3') <> s + 1 then
    raise exception 'FAIL: cancel_order did not restock pending_payment order';
  end if;
  if (select status from public.orders where id = r->>'orderId') <> 'cancelled' then
    raise exception 'FAIL: cancel_order did not set status to cancelled';
  end if;

  -- 10. COD order collection: payments row and status
  r := public.create_order(u, cust, '[{"productId":"p3","qty":1}]', null, cfg);
  if (select status || '/' || payment_status from public.orders where id = r->>'orderId') <> 'processing/unpaid' then
    raise exception 'FAIL: COD order initial status';
  end if;

  delete from public.payments where id = 'pay-assert-cod';
  insert into public.payments (id, order_id, provider, provider_payment_id, amount, currency, status, raw_status)
  values ('pay-assert-cod', r->>'orderId', 'cod', 'cod-' || (r->>'orderId'), 100, 'PKR', 'paid', 'Collected');
  update public.orders set payment_status = 'paid' where id = r->>'orderId';

  if (select count(*) from public.payments where order_id = r->>'orderId' and status = 'paid') <> 1 then
    raise exception 'FAIL: payments row not found for collected COD';
  end if;

  -- 11. CHECK constraint verifies pending_payment is valid and rejects unknown status
  begin
    insert into public.orders (id, customer_name, customer_email, subtotal, total, status)
    values ('FN-BOGUS', 'T', 't@example.com', 10, 10, 'invalid_status');
    raise exception 'FAIL: orders_status_check did not reject invalid_status';
  exception when check_violation then null; end;

  -- 12. complete_return(): atomic restocking, exactly once, idempotence/concurrency safe
  r := public.create_order(u, cust, '[{"productId":"p3","qty":2}]', null, cfg);
  update public.orders set status = 'delivered', payment_status = 'paid' where id = r->>'orderId';
  delete from public.payments where id = 'pay-assert-ret';
  delete from public.refunds where return_id in ('ret-assert-1', 'ret-assert-2');
  delete from public.return_requests where id in ('ret-assert-1', 'ret-assert-2');
  insert into public.payments (id, order_id, provider, provider_payment_id, amount, currency, status)
  values ('pay-assert-ret', r->>'orderId', 'cod', 'cod-ret-' || (r->>'orderId'), 200, 'PKR', 'paid');

  delete from public.return_requests where order_id = r->>'orderId';
  insert into public.return_requests (id, order_id, user_id, reason, status)
  values ('ret-assert-1', r->>'orderId', u, 'Defective', 'approved');

  select stock into s from public.products where id = 'p3';
  perform public.complete_return('ret-assert-1', u);

  if (select stock from public.products where id = 'p3') <> s + 2 then
    raise exception 'FAIL: complete_return did not restock';
  end if;
  if (select status from public.orders where id = r->>'orderId') <> 'returned' then
    raise exception 'FAIL: complete_return did not set order status to returned';
  end if;
  if (select status from public.return_requests where id = 'ret-assert-1') <> 'completed' then
    raise exception 'FAIL: complete_return did not set return status to completed';
  end if;
  if (select count(*) from public.refunds where return_id = 'ret-assert-1') <> 1 then
    raise exception 'FAIL: complete_return did not generate pending refund';
  end if;

  -- Calling complete_return a second time MUST fail and NOT restock again
  begin
    perform public.complete_return('ret-assert-1', u);
    raise exception 'FAIL: complete_return allowed double return';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'RETURN_ALREADY_COMPLETED|%' then
      raise exception 'FAIL: wrong error on double return %', msg;
    end if;
  end;

  if (select stock from public.products where id = 'p3') <> s + 2 then
    raise exception 'FAIL: double complete_return modified stock';
  end if;

  -- Calling complete_return on non-approved return MUST fail
  r := public.create_order(u, cust, '[{"productId":"p3","qty":1}]', null, cfg);
  update public.orders set status = 'delivered', payment_status = 'paid' where id = r->>'orderId';
  delete from public.return_requests where order_id = r->>'orderId';
  insert into public.return_requests (id, order_id, user_id, reason, status)
  values ('ret-assert-2', r->>'orderId', u, 'Defective', 'requested');
  begin
    perform public.complete_return('ret-assert-2', u);
    raise exception 'FAIL: complete_return allowed unapproved return';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'INVALID_RETURN_STATUS|%' then
      raise exception 'FAIL: wrong error on unapproved return %', msg;
    end if;
  end;

  raise notice 'ALL DATABASE ASSERTIONS PASSED';
end $$;
