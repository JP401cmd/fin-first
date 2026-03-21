-- Allow 'pensioen' as a valid value for fire_end_strategy on profiles
-- Feature #453 added the TypeScript type but the DB CHECK constraint was not updated

DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Find and drop any existing CHECK constraint on fire_end_strategy
  FOR constraint_rec IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'profiles'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%fire_end_strategy%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_rec.conname);
    RAISE NOTICE 'Dropped constraint: %', constraint_rec.conname;
  END LOOP;
END $$;

-- Re-add constraint with 'pensioen' included
ALTER TABLE public.profiles ADD CONSTRAINT profiles_fire_end_strategy_check
  CHECK (fire_end_strategy IS NULL OR fire_end_strategy IN ('perpetual', 'legacy', 'deplete', 'pensioen'));
