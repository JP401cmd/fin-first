-- RLS-leaktest voor public.achieved_milestones
-- Hoort bij migratie 20260831160000_add_achieved_milestones.sql en ADR 0123.
--
-- ── STATUS: UIT TE VOEREN BIJ APPLY ─────────────────────────────────────────
-- Dit script is GESCHREVEN, NIET GEDRAAID. In de taak waarin de migratie is
-- geschreven was geen live database beschikbaar (en uitrollen was expliciet
-- verboden), dus élke uitspraak hieronder over "wat de database doet" is een
-- VERWACHTING, geen meting. Draai dit script direct ná het toepassen van de
-- migratie en neem de uitkomst op in de release-aantekening, met datum.
--
-- ── VORM (patroon uit deze repo) ────────────────────────────────────────────
-- Rol-gesimuleerde verificatie: `set local role` + `request.jwt.claims`, in één
-- transactie die TERUGROLT — hetzelfde patroon als de zes genummerde gevallen
-- in 20260730210321_guard_bank_accounts_linked_asset_owner.sql. Er blijven geen
-- testrijen achter.
--
-- Het script is LUID BIJ FALEN en stil bij succes: elk geval eindigt op
-- RAISE NOTICE (geslaagd) of RAISE EXCEPTION (gefaald, met de reden). Eén
-- afwijking breekt de hele transactie af. Sluit af met één regel uitkomst.
--
-- ── VOORWAARDEN ─────────────────────────────────────────────────────────────
--   * Draaien als de migratie-/eigenaarsrol (postgres), niet als anon.
--   * Er moeten minimaal TWEE bestaande rijen in auth.users staan.
--
-- ── DE TWAALF GEVALLEN EN HUN VERWACHTE UITKOMST ─────────────────────────────
--   1 SELECT eigen rij als authenticated            → 1 rij   (positieve controle)
--   2 SELECT rij van een ANDERE gebruiker           → 0 rijen (cross-user dicht)
--   3 SELECT als anon                               → 0 rijen ÉN geen fout
--  3b INSERT als anon                               → geweigerd, 42501
--  3c UPDATE als anon                               → geweigerd 42501 of 0 rijen
--   4 UPDATE achieved_at als authenticated          → geweigerd, 42501
--   5 UPDATE milestone_key als authenticated        → geweigerd, 42501
--   6 UPDATE acknowledged_at op eigen rij           → toegestaan, 1 rij
--   7 UPDATE acknowledged_at op rij van een ander   → 0 rijen, geen fout
--   8 INSERT met andermans user_id                  → geweigerd, 42501
--   9 DELETE op eigen rij (geen delete-policy)      → 0 rijen, geen fout
--  10 Structuur- en rechtencontrole (ACL, policies, indexen, FK, kolom)
--
-- Geval 1 is geen franje: zonder positieve controle bewijst "0 rijen" niets —
-- een lege tabel of een kapotte rolsimulatie geeft dezelfde nul. Concreet: als
-- `auth.uid()` in deze database de oudere GUC `request.jwt.claim.sub` leest in
-- plaats van `request.jwt.claims`, ziet gebruiker A ook zijn EIGEN rij niet en
-- faalt geval 1. Dat is dan een defect in de SIMULATIE, niet in de policy —
-- zet in dat geval beide GUC's en draai opnieuw.
-- Geval 3 is verplicht, niet optioneel: de conventie
-- ".claude/skills/_shared/pijplijn-conventies.md — Leak-checks: altijd óók de
-- anon-rol" stelt dat een leak-check die alleen eigenaar-isolatie test
-- onvolledig is. Het toetst óók de FOUTVORM: anon hoort een lege set te
-- krijgen, geen policy-/permissiefout. Een fout i.p.v. een lege set duidt op
-- een rolset-/execute-rechten-regressie (weggevallen SELECT-grant), niet op
-- strengere beveiliging — zo gevangen bij ADR 0048.

BEGIN;

-- ── Opzet: twee bestaande gebruikers kiezen en per gebruiker één testrij ────
-- De ids gaan in transactie-lokale GUC's: die overleven een rolwissel, anders
-- dan een temp-tabel (waarvoor `authenticated` USAGE op het temp-schema zou
-- moeten krijgen — nodeloze rechten-ruis in een rechten-test).

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
  SELECT id INTO v_a FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM auth.users WHERE id <> v_a ORDER BY created_at, id LIMIT 1;

  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'OPZET FAALT: leaktest vereist twee bestaande auth.users-rijen';
  END IF;

  PERFORM set_config('leaktest.user_a', v_a::text, true);
  PERFORM set_config('leaktest.user_b', v_b::text, true);

  INSERT INTO public.achieved_milestones
    (user_id, milestone_key, kind, threshold_value, observed_value, achieved_at, source)
  VALUES
    (v_a, 'LEAKTEST:vermogen:100000', 'vermogen', 100000, 103412, now() - interval '3 days', 'detect'),
    (v_b, 'LEAKTEST:vermogen:100000', 'vermogen', 100000,  99999, now() - interval '9 days', 'detect');

  RAISE NOTICE 'OPZET OK: testrijen voor A=% en B=% geplaatst (rollen terug aan het eind)', v_a, v_b;
END $$;

-- ── Rol A: ingelogde gebruiker A ────────────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('leaktest.user_a'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Geval 1 + 2 — lezen
DO $$
DECLARE
  n_eigen int;
  n_ander int;
BEGIN
  SELECT count(*) INTO n_eigen
    FROM public.achieved_milestones
   WHERE user_id = current_setting('leaktest.user_a')::uuid
     AND milestone_key = 'LEAKTEST:vermogen:100000';

  SELECT count(*) INTO n_ander
    FROM public.achieved_milestones
   WHERE user_id = current_setting('leaktest.user_b')::uuid;

  IF n_eigen <> 1 THEN
    RAISE EXCEPTION 'GEVAL 1 FAALT: eigen rij niet zichtbaar (n=%). Positieve controle mislukt — geval 2 bewijst dan niets.', n_eigen;
  END IF;
  IF n_ander <> 0 THEN
    RAISE EXCEPTION 'GEVAL 2 FAALT: CROSS-USER LEK — % rij(en) van gebruiker B zichtbaar voor A', n_ander;
  END IF;
  RAISE NOTICE 'GEVAL 1 OK: eigen rij zichtbaar (1). GEVAL 2 OK: rijen van B zichtbaar (0).';
END $$;

-- ── Rol anon ────────────────────────────────────────────────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;

-- Geval 3 — anon: lege set, geen fout
DO $$
DECLARE
  n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.achieved_milestones;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'GEVAL 3 FAALT: anon kreeg SQLSTATE % i.p.v. een lege set. Dat duidt op een rolset-regressie (SELECT-grant voor anon weggevallen), niet op betere beveiliging.', SQLSTATE;
  END;

  IF n <> 0 THEN
    RAISE EXCEPTION 'GEVAL 3 FAALT: anon ziet % rij(en)', n;
  END IF;
  RAISE NOTICE 'GEVAL 3 OK: anon ziet 0 rijen en krijgt geen fout.';
END $$;

-- Geval 3b/3c — anon SCHRIJVEN: geweigerd. Nieuwe tabellen erven tabel-brede
-- INSERT/UPDATE-grants voor anon uit de default privileges (live gemeten op
-- spend_limits, ship-gate 31-08-2026); het énige dat schrijven tegenhoudt is de
-- afwezigheid van een TO anon-policy. Deze gevallen vangen de regressie waarin
-- iemand later een anon-policy toevoegt.
DO $$
DECLARE
  n int;
BEGIN
  -- 3b: INSERT als anon — verwacht geweigerd (42501) of 0 rijen.
  BEGIN
    INSERT INTO public.achieved_milestones (user_id, milestone_key, kind)
    VALUES (current_setting('leaktest.user_a')::uuid, 'vermogen-10k-anonpoging', 'vermogen');
    RAISE EXCEPTION 'GEVAL 3b FAALT: anon kon een rij INSERTEN';
  EXCEPTION
    -- Zowel een grant-weigering als een RLS-WITH CHECK-weigering geeft 42501;
    -- élke andere uitkomst (incl. een CHECK-constraint-fout, die zou betekenen
    -- dat de rij vóórbij RLS kwam) laat het geval hard falen.
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'GEVAL 3b OK: anon INSERT geweigerd (42501).';
  END;

  -- 3c: UPDATE als anon — verwacht geweigerd (42501) of stil 0 rijen.
  BEGIN
    UPDATE public.achieved_milestones SET acknowledged_at = now();
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'GEVAL 3c FAALT: anon muteerde % rij(en)', n;
    END IF;
    RAISE NOTICE 'GEVAL 3c OK: anon UPDATE raakt 0 rijen.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 3c OK: anon UPDATE geweigerd (42501).';
  END;
END $$;

-- ── Terug naar rol A: schrijfrechten ────────────────────────────────────────

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('leaktest.user_a'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Geval 4 t/m 9 — schrijven
DO $$
DECLARE
  n int;
BEGIN
  -- 4: achieved_at herschrijven mag niet (kolom-gescoopte GRANT)
  BEGIN
    UPDATE public.achieved_milestones
       SET achieved_at = now()
     WHERE user_id = current_setting('leaktest.user_a')::uuid
       AND milestone_key = 'LEAKTEST:vermogen:100000';
    RAISE EXCEPTION 'GEVAL 4 FAALT: UPDATE op achieved_at werd TOEGESTAAN — de log is geen historie meer';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 4 OK: UPDATE op achieved_at geweigerd (42501).';
  END;

  -- 5: milestone_key herschrijven mag niet (zou de once-guard omzeilen)
  BEGIN
    UPDATE public.achieved_milestones
       SET milestone_key = 'LEAKTEST:gemanipuleerd'
     WHERE user_id = current_setting('leaktest.user_a')::uuid
       AND milestone_key = 'LEAKTEST:vermogen:100000';
    RAISE EXCEPTION 'GEVAL 5 FAALT: UPDATE op milestone_key werd TOEGESTAAN — de once-guard is omzeilbaar';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 5 OK: UPDATE op milestone_key geweigerd (42501).';
  END;

  -- 6: acknowledged_at op de eigen rij MOET slagen (anders is de app stuk)
  UPDATE public.achieved_milestones
     SET acknowledged_at = now()
   WHERE user_id = current_setting('leaktest.user_a')::uuid
     AND milestone_key = 'LEAKTEST:vermogen:100000';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'GEVAL 6 FAALT: UPDATE op acknowledged_at raakte % rij(en), verwacht 1 — /api/milestones/acknowledge zou breken', n;
  END IF;
  RAISE NOTICE 'GEVAL 6 OK: UPDATE op acknowledged_at slaagt op de eigen rij (1 rij).';

  -- 7: dezelfde toegestane kolom, maar op de rij van een ander → RLS filtert
  UPDATE public.achieved_milestones
     SET acknowledged_at = now()
   WHERE user_id = current_setting('leaktest.user_b')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'GEVAL 7 FAALT: A vinkte % rij(en) van B af', n;
  END IF;
  RAISE NOTICE 'GEVAL 7 OK: UPDATE op de rij van B raakt 0 rijen.';

  -- 8: INSERT met andermans user_id → WITH CHECK weigert (42501)
  BEGIN
    INSERT INTO public.achieved_milestones (user_id, milestone_key, kind)
    VALUES (current_setting('leaktest.user_b')::uuid, 'LEAKTEST:spoof', 'doel');
    RAISE EXCEPTION 'GEVAL 8 FAALT: INSERT met andermans user_id werd TOEGESTAAN';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 8 OK: INSERT met andermans user_id geweigerd (42501).';
  END;

  -- 9: DELETE op de eigen rij → geen delete-policy, dus 0 rijen en geen fout
  BEGIN
    DELETE FROM public.achieved_milestones
     WHERE user_id = current_setting('leaktest.user_a')::uuid
       AND milestone_key = 'LEAKTEST:vermogen:100000';
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Ook aanvaardbaar als iemand later tóch een tabel-brede REVOKE DELETE
    -- toevoegt; de garantie (de rij overleeft) is dan nog steeds waar.
    n := 0;
    RAISE NOTICE 'GEVAL 9: DELETE geweigerd met 42501 i.p.v. stil gefilterd — garantie blijft, foutvorm wijkt af van het ontwerp.';
  END;
  IF n <> 0 THEN
    RAISE EXCEPTION 'GEVAL 9 FAALT: DELETE verwijderde % rij(en) — de log is geen historie meer', n;
  END IF;
  RAISE NOTICE 'GEVAL 9 OK: DELETE raakt 0 rijen (geen delete-policy).';
END $$;

-- ── Geval 10: structuur en rechten (als eigenaarsrol) ───────────────────────

RESET ROLE;

DO $$
DECLARE
  v_tbl  regclass := 'public.achieved_milestones'::regclass;
  v_bool boolean;
  n      int;
  v_txt  text;
BEGIN
  -- RLS aan
  SELECT relrowsecurity INTO v_bool FROM pg_class WHERE oid = v_tbl;
  IF NOT v_bool THEN RAISE EXCEPTION 'GEVAL 10 FAALT: RLS staat UIT op achieved_milestones'; END IF;

  -- Precies drie policies, alle drie uitsluitend voor authenticated
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'achieved_milestones';
  IF n <> 3 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: % policies gevonden, verwacht 3', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'achieved_milestones'
     AND roles <> '{authenticated}';
  IF n <> 0 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: % policy(s) staan op een andere rol dan authenticated', n; END IF;

  SELECT string_agg(DISTINCT cmd, ',' ORDER BY cmd) INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'achieved_milestones';
  IF v_txt IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: policy-verbs zijn "%", verwacht "INSERT,SELECT,UPDATE" (geen DELETE, geen ALL)', v_txt;
  END IF;

  -- Rechten: dit is het meetpunt voor de aanname over ALTER DEFAULT PRIVILEGES
  IF has_table_privilege('authenticated', v_tbl, 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: authenticated heeft nog TABEL-brede UPDATE — de kolom-GRANT is dan een no-op';
  END IF;
  IF NOT has_column_privilege('authenticated', v_tbl, 'acknowledged_at', 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: authenticated mist UPDATE op acknowledged_at';
  END IF;
  IF has_column_privilege('authenticated', v_tbl, 'achieved_at', 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: authenticated heeft UPDATE op achieved_at';
  END IF;
  IF has_column_privilege('authenticated', v_tbl, 'milestone_key', 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: authenticated heeft UPDATE op milestone_key';
  END IF;
  IF NOT has_table_privilege('authenticated', v_tbl, 'SELECT')
     OR NOT has_table_privilege('authenticated', v_tbl, 'INSERT') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: authenticated mist SELECT en/of INSERT — de app kan niet lezen of loggen';
  END IF;
  -- anon MOET SELECT houden: dat is wat een lege set i.p.v. een fout oplevert
  IF NOT has_table_privilege('anon', v_tbl, 'SELECT') THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: anon mist SELECT — geval 3 zou een 42501 geven i.p.v. een lege set';
  END IF;

  -- FK naar auth.users met ON DELETE CASCADE (AVG-wisroute)
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_tbl AND contype = 'f' AND confdeltype = 'c'
     AND confrelid = 'auth.users'::regclass;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: FK naar auth.users met ON DELETE CASCADE ontbreekt (n=%)', n; END IF;

  -- Once-guard
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_tbl AND contype = 'u' AND conname = 'achieved_milestones_user_key_uniq';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: UNIQUE (user_id, milestone_key) ontbreekt'; END IF;

  -- Beide indexen, inclusief het partiële predicaat
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'achieved_milestones'
     AND indexname = 'achieved_milestones_user_achieved_idx';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: index achieved_milestones_user_achieved_idx ontbreekt'; END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'achieved_milestones'
     AND indexname = 'achieved_milestones_user_unacked_idx'
     AND indexdef ILIKE '%WHERE (acknowledged_at IS NULL)%';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: partiële index achieved_milestones_user_unacked_idx ontbreekt of mist het predicaat'; END IF;

  -- Additieve kolom op profiles
  SELECT count(*) INTO n FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
     AND attname = 'milestones_seeded_at' AND NOT attisdropped;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 10 FAALT: profiles.milestones_seeded_at ontbreekt'; END IF;

  RAISE NOTICE 'GEVAL 10 OK: RLS aan, 3 policies (SELECT/INSERT/UPDATE, alleen authenticated), geen tabel-brede UPDATE voor authenticated, kolom-GRANT uitsluitend op acknowledged_at, anon houdt SELECT, FK CASCADE, UNIQUE, beide indexen en profiles.milestones_seeded_at aanwezig.';
END $$;

SELECT 'ALLE 10 GEVALLEN ZOALS ONTWORPEN — transactie rolt nu terug, geen testrijen achtergebleven' AS uitkomst;

ROLLBACK;
