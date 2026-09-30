-- Leaktest voor de blocked_at-bewaking op profiles (Y1, security-run 0.92.27)
-- Hoort bij migratie 20261010120000_profiles_blocked_at_bewaakt.sql.
--
-- ── STATUS: NOG NIET GEDRAAID ───────────────────────────────────────────────
-- Draaien ná het toepassen van 20261010120000, als postgres. Zelfde vorm als
-- scripts/verify-krant-ai-laag-rls.sql: rol-gesimuleerd (`set local role` +
-- `request.jwt.claims`) in één transactie die TERUGROLT; stil bij succes
-- (RAISE NOTICE), RAISE EXCEPTION bij een afwijking. Er blijft niets achter:
-- de enige schrijfacties zijn het tijdelijk blokkeren van proefgebruiker A en
-- de service_role-proeven, alles binnen de ROLLBACK.
--
-- Wat hij bewijst:
--   0   structuur: beide triggers bestaan en zijn aan; de functie noemt blocked_at.
--   1   A (geblokkeerd) kan blocked_at niet wissen — 42501, met de blocked_at-melding;
--   1b  ook niet via de upsert-vorm van PostgREST (ON CONFLICT DO UPDATE).
--   2   A kan een ánder eigen profielveld nog wel wijzigen (gedrag ongewijzigd).
--   3   A kan zijn geblokkeerde profiel niet wissen — 42501.
--   4   B (niet geblokkeerd) kan zichzelf niet blokkeren — 42501.
--   5   B kan geen profiel invoeren met blocked_at gevuld — 42501 (de BEFORE INSERT-
--       trigger vuurt vóór de conflictcontrole, dus ON CONFLICT DO NOTHING bewijst
--       het zonder een tweede rij). Controle: dezelfde insert zonder blocked_at
--       geeft géén fout.
--   6   anon raakt geen profielrij (RLS: 0 rijen, geen fout).
--   7   service_role (de beheerroute) blokkeert en deblokkeert wél.
--   8   postgres (migraties, de RI-cascade als eigenaar) blijft vrij.

BEGIN;
DO $$ DECLARE v_a uuid; v_b uuid; BEGIN
  SELECT p.id INTO v_a FROM public.profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_b FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id <> v_a ORDER BY p.created_at, p.id LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'OPZET: twee profielen met een auth.users-rij nodig'; END IF;
  -- Als postgres (vrij): A blokkeren, B zeker niet geblokkeerd.
  UPDATE public.profiles SET blocked_at = now() WHERE id = v_a;
  UPDATE public.profiles SET blocked_at = NULL WHERE id = v_b;
  PERFORM set_config('leaktest.a', v_a::text, true);
  PERFORM set_config('leaktest.b', v_b::text, true);
END $$;

-- 0 structuur
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_guard_profiles_role' AND tgenabled = 'O')
  THEN RAISE EXCEPTION '0a trg_guard_profiles_role ontbreekt of staat uit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_guard_profiles_blocked_delete' AND tgenabled = 'O'
                 AND pg_get_triggerdef(oid) ILIKE '%BEFORE DELETE%')
  THEN RAISE EXCEPTION '0b trg_guard_profiles_blocked_delete ontbreekt, staat uit of is geen BEFORE DELETE'; END IF;
  IF pg_get_functiondef('public.guard_profiles_role()'::regprocedure) NOT ILIKE '%new.blocked_at is distinct from old.blocked_at%'
  OR pg_get_functiondef('public.guard_profiles_role()'::regprocedure) NOT ILIKE '%new.blocked_at is not null%'
  THEN RAISE EXCEPTION '0c guard_profiles_role bewaakt blocked_at niet'; END IF;
  RAISE NOTICE '0 structuur OK';
END $$;

-- 1-3 als gebruiker A (geblokkeerd)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('leaktest.a'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('leaktest.a'), true);
DO $$ DECLARE a uuid := current_setting('leaktest.a')::uuid; n int; msg text; BEGIN
  BEGIN UPDATE public.profiles SET blocked_at = NULL WHERE id = a;
        RAISE EXCEPTION '1 A wiste zijn eigen blocked_at';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT ILIKE '%blocked_at%' THEN RAISE EXCEPTION '1 42501, maar niet van de blocked_at-regel: %', msg; END IF;
    RAISE NOTICE '1 OK 42501 (%)', msg;
  END;
  -- 1b de upsert-vorm van PostgREST (security-run 0.92.28, 🟢-2): het conflict valt
  --    in de BEFORE UPDATE-trigger en moet dezelfde weigering geven.
  BEGIN INSERT INTO public.profiles (id) VALUES (a) ON CONFLICT (id) DO UPDATE SET blocked_at = NULL;
        RAISE EXCEPTION '1b A wiste zijn blocked_at via een upsert';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT ILIKE '%blocked_at%' THEN RAISE EXCEPTION '1b 42501, maar niet van de blocked_at-regel: %', msg; END IF;
    RAISE NOTICE '1b OK 42501 ook via upsert';
  END;
  UPDATE public.profiles SET updated_at = now() WHERE id = a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '2 A kan zijn eigen profiel niet meer bijwerken (% rijen) — simulatie of guard te breed', n; END IF;
  RAISE NOTICE '2 OK ander eigen veld bijwerken mag';
  BEGIN DELETE FROM public.profiles WHERE id = a;
        RAISE EXCEPTION '3 A wiste zijn geblokkeerde profiel';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT ILIKE '%geblokkeerd%' THEN RAISE EXCEPTION '3 42501, maar niet van de delete-regel: %', msg; END IF;
    RAISE NOTICE '3 OK 42501 (%)', msg;
  END;
END $$;

-- 4-5 als gebruiker B (niet geblokkeerd)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('leaktest.b'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('leaktest.b'), true);
DO $$ DECLARE b uuid := current_setting('leaktest.b')::uuid; msg text; BEGIN
  BEGIN UPDATE public.profiles SET blocked_at = now() WHERE id = b;
        RAISE EXCEPTION '4 B zette zijn eigen blocked_at';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT ILIKE '%blocked_at%' THEN RAISE EXCEPTION '4 42501, maar niet van de blocked_at-regel: %', msg; END IF;
    RAISE NOTICE '4 OK 42501';
  END;
  BEGIN INSERT INTO public.profiles (id, blocked_at) VALUES (b, now()) ON CONFLICT (id) DO NOTHING;
        RAISE EXCEPTION '5a insert met blocked_at toegelaten';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT ILIKE '%blocked_at%' THEN RAISE EXCEPTION '5a 42501, maar niet van de blocked_at-regel: %', msg; END IF;
    RAISE NOTICE '5a OK 42501';
  END;
  -- Controle: zonder blocked_at geen fout (bestaande rij → DO NOTHING).
  INSERT INTO public.profiles (id) VALUES (b) ON CONFLICT (id) DO NOTHING;
  RAISE NOTICE '5b OK insert zonder blocked_at geeft geen fout';
END $$;

-- 6 anon: RLS laat geen rij door, dus ook geen trigger en geen fout
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
DO $$ DECLARE n int; BEGIN
  UPDATE public.profiles SET blocked_at = NULL WHERE blocked_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '6 anon wijzigde % profielen', n; END IF;
  RAISE NOTICE '6 OK anon raakt 0 rijen';
END $$;

-- 7 service_role: de beheerroute (app/api/admin/users/block) werkt nog
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a uuid := current_setting('leaktest.a')::uuid; b uuid := current_setting('leaktest.b')::uuid; BEGIN
  UPDATE public.profiles SET blocked_at = NULL WHERE id = a;
  IF NOT FOUND THEN RAISE EXCEPTION '7a service_role deblokkeert niet'; END IF;
  UPDATE public.profiles SET blocked_at = now() WHERE id = b;
  IF NOT FOUND THEN RAISE EXCEPTION '7b service_role blokkeert niet'; END IF;
  RAISE NOTICE '7 OK service_role blokkeert en deblokkeert';
END $$;

-- 8 postgres blijft vrij
RESET ROLE;
DO $$ DECLARE b uuid := current_setting('leaktest.b')::uuid; BEGIN
  UPDATE public.profiles SET blocked_at = NULL WHERE id = b;
  IF NOT FOUND THEN RAISE EXCEPTION '8 postgres deblokkeert niet'; END IF;
  RAISE NOTICE '8 OK postgres vrij';
END $$;
ROLLBACK;
