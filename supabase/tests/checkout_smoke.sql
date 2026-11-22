-- Smoke tests for migrations 0004/0005. Run against a THROW-AWAY database only
-- (they create orders and coupons):  supabase db reset && psql "$DB_URL" -f supabase/tests/checkout_smoke.sql
-- Each section states its expected result in a comment.
-- EXPECT: 5x 'permission denied'
\echo '--- A. anon access to every table must fail'
set role anon;
select 'products' t, count(*) from products;
select count(*) from payments;
select count(*) from site_settings;
insert into coupons(id,code,type) values('x','HACK','percent');
select public.create_order(null,'{}','[]',null,'{}');
reset role;
-- EXPECT: products_ok = 8
\echo '--- B. service_role still works'
set role service_role; select count(*) as products_ok from products; reset role;

-- EXPECT: FN-0001, status processing/unpaid, p1 qty 3 (duplicate lines merged), discount 74.70, coupon used_count 1
\echo '--- C. guest COD order'
insert into coupons(id,code,type,value,min_subtotal,max_uses,used_count,active) values ('c1x','SAVE10','percent',10,0,1,0,true);
select public.create_order(null,'{"name":"G","email":"g@x.com","address":"Faisalabad","paymentMethod":"cod"}',
 '[{"productId":"p1","qty":2},{"productId":"p1","qty":1}]','save10','{"currency":"PKR","freeShippingThreshold":5000,"shippingFlatRate":500,"taxRate":0}');
select id,status,payment_status,subtotal,discount,shipping,total,user_id from orders;
select id,qty from order_items;
select id,stock from products where id='p1';
select used_count from coupons where code='SAVE10';

-- EXPECT: INVALID_COUPON (max_uses reached)
\echo '--- D. coupon max_uses (1) now exhausted'
select public.create_order(null,'{"name":"G","email":"g@x.com","paymentMethod":"cod"}','[{"productId":"p3","qty":1}]','SAVE10','{}');
-- EXPECT: LOGIN_REQUIRED
\echo '--- E. guest + bank_transfer blocked'
select public.create_order(null,'{"name":"G","email":"g@x.com","paymentMethod":"bank_transfer"}','[{"productId":"p3","qty":1}]',null,'{}');
-- EXPECT: INSUFFICIENT_STOCK and orders_n unchanged (full rollback)
\echo '--- F. oversell blocked AND nothing persisted (rollback)'
select public.create_order(null,'{"name":"G","email":"g@x.com","paymentMethod":"cod"}','[{"productId":"p3","qty":1},{"productId":"p1","qty":999}]',null,'{}');
select (select count(*) from orders) orders_n, (select stock from products where id='p3') p3_stock_unchanged_40;
-- EXPECT: INVALID_COUPON (wildcards no longer match)
\echo '--- G. wildcard coupon code no longer matches'
select public.create_order(null,'{"name":"G","email":"g@x.com","paymentMethod":"cod"}','[{"productId":"p3","qty":1}]','SAV%','{}');
-- EXPECT: FN-0002, stock restored, second cancel -> ORDER_NOT_CANCELLABLE
\echo '--- H. sequential ids + cancel restock + double cancel'
select public.create_order(null,'{"name":"G","email":"g@x.com","paymentMethod":"cod"}','[{"productId":"p3","qty":2}]',null,'{}');
select public.cancel_order('FN-0002',null,null);
select stock as p3_back_to_40 from products where id='p3';
select public.cancel_order('FN-0002',null,null);
-- EXPECT: t | t | f, then TKT-0001
\echo '--- I. rate limit'
select public.rate_limit_hit('t',60,2), public.rate_limit_hit('t',60,2), public.rate_limit_hit('t',60,2);
select public.next_ticket_id();
