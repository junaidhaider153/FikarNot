-- Run AFTER promote_admin.sql has produced your real admin row.
--
-- Why: migration 0002 created admin/editor/customer accounts on
-- @fikarnot.shop addresses. Nobody on this team has been confirmed to own those
-- mailboxes, and "Forgot password" for an admin goes to the mailbox owner —
-- whoever controls that domain's mail could take over an admin account.
--
-- Orders, tickets and audit rows that reference these users are kept
-- (their user_id FKs are ON DELETE SET NULL); profiles/state cascade.
do $$
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where lower(u.email) = 'fikarnotofficial.shop@gmail.com' and p.role = 'admin'
  ) then
    raise exception 'Real admin not found. Run promote_admin.sql first.';
  end if;
  delete from auth.users
   where lower(email) in ('junaid@fikarnot.shop', 'editor@fikarnot.shop', 'urwa@fikarnot.shop');
end $$;
