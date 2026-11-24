-- 0011_bucket_svg_fix_and_pkr_prices.sql
-- 1. Explicitly strip image/svg+xml and enforce upload constraints on the media bucket
--    so live environments that already applied earlier versions of 0009 are updated cleanly.
update storage.buckets
set
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
  file_size_limit = 52428800
where id = 'media';

-- 2. Upgrade any untouched USD-scale seeded product prices from 0003_seed_catalog_data.sql
--    to realistic PKR values (matching src/data/seedData.js).
--    Each WHERE clause guards on the original USD price so live admin edits are never overwritten.
update public.products set price = 18500 where id = 'p1' and price = 249.0;
update public.products set price = 14500 where id = 'p2' and price = 199.0;
update public.products set price = 6500  where id = 'p3' and price = 89.0;
update public.products set price = 8900  where id = 'p4' and price = 119.0;
update public.products set price = 9500  where id = 'p5' and price = 148.0;
update public.products set price = 12500 where id = 'p6' and price = 159.0;
update public.products set price = 21900 where id = 'p7' and price = 229.0;
update public.products set price = 2800  where id = 'p8' and price = 34.0;

-- 3. Align untouched USD-scale seeded coupon thresholds/amounts from 0003_seed_catalog_data.sql with PKR.
update public.coupons set min_subtotal = 5000 where id = 'cp1' and min_subtotal = 50.0;
update public.coupons set min_subtotal = 5000 where id = 'cp2' and min_subtotal = 50.0;
update public.coupons set value = 2000, min_subtotal = 12000 where id = 'cp3' and value = 20.0 and min_subtotal = 120.0;
