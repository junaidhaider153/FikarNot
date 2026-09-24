-- Migrate the 3 existing FikarNot users into Supabase Auth.
-- Their old scrypt password hashes can't be imported (Supabase Auth needs
-- bcrypt), so each gets an unusable random placeholder password here.
-- They'll need "Forgot password" once the login page is live, or you can
-- set a password for them directly in Supabase Studio -> Authentication.
DO $$
DECLARE
  v_id uuid;
BEGIN
  -- u1: Junaid Haider (admin)
  v_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'junaid@fikarnot.shop', crypt(gen_random_uuid()::text, gen_salt('bf')),
    to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', 'Junaid Haider'), false
  );
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', 'junaid@fikarnot.shop'), 'email', v_id::text, now(), now(), now());
  UPDATE profiles SET role = 'admin' WHERE id = v_id;

  -- u2: FikarNot Editor (editor)
  v_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'editor@fikarnot.shop', crypt(gen_random_uuid()::text, gen_salt('bf')),
    to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', 'FikarNot Editor'), false
  );
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', 'editor@fikarnot.shop'), 'email', v_id::text, now(), now(), now());
  UPDATE profiles SET role = 'editor' WHERE id = v_id;

  -- u3: Urwa (customer) — trigger default role 'customer' is already correct
  v_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'urwa@fikarnot.shop', crypt(gen_random_uuid()::text, gen_salt('bf')),
    to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0), to_timestamp(1788718402295/1000.0),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', 'Urwa'), false
  );
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', 'urwa@fikarnot.shop'), 'email', v_id::text, now(), now(), now());
END $$;
