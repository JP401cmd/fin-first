-- ADR 0127 — 'nu-stoppen' als vijfde toegestane waarde van profiles.fire_end_strategy.
--
-- WAAROM
-- "Nu stoppen" is een stop-anker op vandaag: wie ná zijn FIRE-leeftijd doorwerkt kan
-- zo zien tot welke leeftijd zijn vermogen reikt als hij vandaag stopt. De TypeScript-
-- union FireEndStrategy in lib/fire-strategy.ts krijgt daarmee een vijfde lid; deze
-- migratie verruimt het bijbehorende waardedomein in de database.
--
-- WAT DIT WEL EN NIET IS
-- Dit is uitsluitend een verruiming van het CHECK-waardedomein op een BESTAANDE kolom.
-- Geen nieuwe kolom, geen nieuwe tabel, geen backfill, geen RLS-wijziging.
--
-- TOEGANGSMODEL (ongewijzigd, gemeten tegen pg_policies op 02-09-2026)
-- public.profiles draagt één policy, "Users can manage own profile" (FOR ALL,
-- USING `(select auth.uid()) = id`, geen aparte WITH CHECK — Postgres hanteert dan de
-- USING-expressie ook als WITH CHECK bij UPDATE). Dat is eigen-rij lezen én schrijven.
-- Het bedoelde schrijfpad voor deze kolom blijft de bestaande route
-- app/api/fire-settings (own-row update, geen service-role). Een CHECK-verruiming raakt
-- geen enkele policy: hij verkleint alleen de verzameling geweigerde waarden binnen de
-- rij die de gebruiker toch al mocht schrijven. Er ontstaat hier dus geen schrijfgat.
--
-- BACKFILL: NIET NODIG — de nieuwe lijst is een strikte superset van de oude
-- ('perpetual','legacy','deplete','pensioen') plus 'nu-stoppen'. Elke rij die de oude
-- constraint haalde, haalt de nieuwe per definitie ook. Gemeten op 02-09-2026 komen in
-- profiles.fire_end_strategy alleen deplete/pensioen/perpetual/legacy voor; geen NULL.
--
-- VOLGORDE (belangrijk)
-- Deze migratie moet LIVE ZIJN VÓÓRDAT de allowlist in
-- app/api/fire-settings/route.ts#VALID_STRATEGIES 'nu-stoppen' accepteert. Andersom
-- levert een geldige gebruikersinvoer een constraint-violation op → 500.
--
-- UITROLLEN — LET OP, PROJECTVALKUIL
-- Rol deze migratie NIET uit met apply_migration: die verzint een eigen tijdstempel,
-- waardoor het migratieregister uit de pas loopt met de bestandsnaam in de repo. Rol uit
-- via execute_sql en registreer de versie daarna expliciet:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260902120000', 'allow_nu_stoppen_fire_end_strategy');
--
-- BEKENDE DRIFT (gemeten 02-09-2026, ter waarschuwing voor wie hierop stapelt)
-- Het precedent 20260321000001_allow_pensioen_fire_end_strategy staat NIET in
-- supabase_migrations.schema_migrations, terwijl de live constraint 'pensioen' wél
-- toestaat. De DO-blok-vorm hieronder (constraint zoeken op DEFINITIE, niet op naam)
-- is daarom bewust overgenomen: hij is ongevoelig voor een afwijkende constraintnaam
-- en idempotent bij herhaald draaien.

DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Zoek en drop elke bestaande CHECK-constraint op fire_end_strategy
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

-- Opnieuw toevoegen, nu met 'nu-stoppen' erbij
ALTER TABLE public.profiles ADD CONSTRAINT profiles_fire_end_strategy_check
  CHECK (
    fire_end_strategy IS NULL
    OR fire_end_strategy IN ('perpetual', 'legacy', 'deplete', 'pensioen', 'nu-stoppen')
  );
