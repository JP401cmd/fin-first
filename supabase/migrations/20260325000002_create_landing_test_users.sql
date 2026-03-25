-- Create 4 test users matching the landing page personas.
-- Each user has a test_persona_key in raw_user_meta_data linking to a persona seed.
-- Password: Test2026! (bcrypt hashed)
-- Users can log in, complete onboarding, and on activation their persona seed is loaded.

-- Note: Uses pgcrypto for crypt() + gen_salt(). This extension is enabled by default in Supabase.

DO $$
DECLARE
  test_users JSONB[] := ARRAY[
    '{"email":"ronald@test.trifinity.nl","persona":"ronald","name":"Ronald Hoekstra"}'::jsonb,
    '{"email":"bas@test.trifinity.nl","persona":"bas","name":"Bas Mulder"}'::jsonb,
    '{"email":"leo@test.trifinity.nl","persona":"leo","name":"Leo Pietersen"}'::jsonb,
    '{"email":"jochen@test.trifinity.nl","persona":"jochen","name":"Jochen Brouwer"}'::jsonb
  ];
  u JSONB;
  new_id UUID;
BEGIN
  FOREACH u IN ARRAY test_users LOOP
    -- Skip if user already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = u->>'email') THEN
      CONTINUE;
    END IF;

    new_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_id,
      'authenticated',
      'authenticated',
      u->>'email',
      crypt('Test2026!', gen_salt('bf')),
      now(),
      jsonb_build_object(
        'test_persona_key', u->>'persona',
        'full_name', u->>'name'
      ),
      '{"provider":"email","providers":["email"]}'::jsonb,
      now(),
      now(),
      '',
      ''
    );

    -- Create identity record (required by Supabase auth)
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      new_id,
      u->>'email',
      jsonb_build_object('sub', new_id::text, 'email', u->>'email'),
      'email',
      now(),
      now(),
      now()
    );

    -- Create profile with onboarding_completed = false
    INSERT INTO profiles (id, full_name, onboarding_completed, role)
    VALUES (new_id, u->>'name', false, 'user')
    ON CONFLICT (id) DO NOTHING;

  END LOOP;
END $$;
