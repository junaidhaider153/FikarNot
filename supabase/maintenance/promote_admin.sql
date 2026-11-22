-- Run ONCE in Supabase Dashboard -> SQL Editor (NOT a migration: it depends on a
-- user you create by hand).
--
-- Step 1 (Dashboard): Authentication -> Users -> Add user -> "Create new user"
--   Email:    fikarnotofficial.shop@gmail.com
--   Password: a long unique password (store it in a password manager)
--   Tick "Auto Confirm User".
-- Step 2: run this script.
-- Step 3: sign in to the site, open Admin -> enroll TOTP two-factor.
--         Only after that, set the function secret STAFF_MFA_REQUIRED=1.

update public.profiles
   set role = 'admin', name = coalesce(nullif(name, ''), 'FikarNot Admin')
 where id = (select id from auth.users where lower(email) = 'fikarnotofficial.shop@gmail.com');

-- Must return exactly one row with role = admin:
select p.id, u.email, p.role
  from public.profiles p join auth.users u on u.id = p.id
 where lower(u.email) = 'fikarnotofficial.shop@gmail.com';
