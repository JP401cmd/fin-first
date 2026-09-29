-- RLS- en kolomgrant-leaktest voor de tijdlijn-bèta van de Krant
-- Hoort bij migratie 20261004120000_krant_tijdlijn_beta.sql en ADR 0183.
--
-- ── STATUS: NOG NIET GEDRAAID ───────────────────────────────────────────────
-- Draaien ná het toepassen van de migratie (in de release), als postgres. De
-- opzet komt uit de security-run van 28 sep 2026 en is aangepast aan de
-- review-fixes van dezelfde dag: het bezwaar staat op
-- profiles.krant_schaduw_bezwaar_at (niet op nieuwsprofiel), en
-- tijdlijn_gelezen_tot en UPDATE(user_id) zijn sessie-schrijfbaar.
--
-- ── VORM (patroon uit deze repo) ────────────────────────────────────────────
-- Rol-gesimuleerd (`set local role` + `request.jwt.claims`) in één transactie
-- die TERUGROLT; stil bij succes (RAISE NOTICE), RAISE EXCEPTION bij een
-- afwijking. Er blijven geen testrijen achter. Geval 1 faalt alleen als de
-- simulatie zelf stuk is (A ziet zijn eigen rij niet), niet de policy.
-- anon: 42501 is hier het VERWACHTE resultaat (revoke all sinds 20260922120000).

BEGIN;
DO $$ DECLARE v_a uuid; v_b uuid; BEGIN
  SELECT id INTO v_a FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM auth.users WHERE id <> v_a ORDER BY created_at, id LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'OPZET: twee auth.users nodig'; END IF;
  INSERT INTO public.nieuwsprofiel (user_id) VALUES (v_a),(v_b) ON CONFLICT (user_id) DO NOTHING;
  PERFORM set_config('leaktest.a', v_a::text, true);
  PERFORM set_config('leaktest.b', v_b::text, true);
END $$;

-- 0 structuur
DO $$ BEGIN
  IF has_table_privilege('anon','public.nieuwsprofiel','SELECT') THEN RAISE EXCEPTION '0a anon heeft SELECT'; END IF;
  IF has_table_privilege('authenticated','public.nieuwsprofiel','UPDATE') THEN RAISE EXCEPTION '0b tabelbrede UPDATE nog aanwezig'; END IF;
  IF has_table_privilege('authenticated','public.nieuwsprofiel','INSERT') THEN RAISE EXCEPTION '0c tabelbrede INSERT nog aanwezig'; END IF;
  IF has_column_privilege('authenticated','public.nieuwsprofiel','krant_variant','UPDATE') OR has_column_privilege('authenticated','public.nieuwsprofiel','krant_variant','INSERT')
  OR has_column_privilege('authenticated','public.nieuwsprofiel','afgeleid_at','UPDATE') OR has_column_privilege('authenticated','public.nieuwsprofiel','afgeleid_at','INSERT')
  OR has_column_privilege('authenticated','public.nieuwsprofiel','tijdlijn_vernieuwd_at','UPDATE') OR has_column_privilege('authenticated','public.nieuwsprofiel','tijdlijn_vernieuwd_at','INSERT')
  THEN RAISE EXCEPTION '0d sessie mag een service-role-kolom schrijven'; END IF;
  IF NOT has_column_privilege('authenticated','public.nieuwsprofiel','woonplan','UPDATE') THEN RAISE EXCEPTION '0e profielveld niet schrijfbaar'; END IF;
  IF NOT has_column_privilege('authenticated','public.nieuwsprofiel','tijdlijn_gelezen_tot','UPDATE') THEN RAISE EXCEPTION '0f tijdlijn_gelezen_tot (eigen-rij-voorkeur) niet schrijfbaar'; END IF;
  IF NOT has_column_privilege('authenticated','public.nieuwsprofiel','user_id','UPDATE') THEN RAISE EXCEPTION '0g UPDATE(user_id) ontbreekt — sessie-upsert faalt'; END IF;
  IF NOT has_table_privilege('service_role','public.nieuwsprofiel','UPDATE') OR NOT has_table_privilege('service_role','public.nieuwsprofiel','INSERT') THEN RAISE EXCEPTION '0h service_role mist schrijfrecht'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='krant_editie_items_tijdlijn_lezer_artikel_key'
     AND indexdef ILIKE 'CREATE UNIQUE%(user_id, article_id)%WHERE%tijdlijn%article_id IS NOT NULL%') THEN RAISE EXCEPTION '0i partiële unieke index ontbreekt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='krant_schaduw_bezwaar_at') THEN RAISE EXCEPTION '0j profiles.krant_schaduw_bezwaar_at ontbreekt'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nieuwsprofiel' AND column_name='schaduw_bezwaar_at') THEN RAISE EXCEPTION '0k bezwaar staat op nieuwsprofiel (valt onder de wis)'; END IF;
  RAISE NOTICE '0 structuur OK';
END $$;

-- 1-14 als gebruiker A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('leaktest.a'), 'role','authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('leaktest.a'), true);
DO $$ DECLARE n int; a uuid := current_setting('leaktest.a')::uuid; b uuid := current_setting('leaktest.b')::uuid; BEGIN
  SELECT count(*) INTO n FROM public.nieuwsprofiel WHERE user_id = a;
  IF n <> 1 THEN RAISE EXCEPTION '1 A ziet eigen rij niet (%) — simulatie of policy stuk', n; END IF;
  SELECT count(*) INTO n FROM public.nieuwsprofiel WHERE user_id = b;
  IF n <> 0 THEN RAISE EXCEPTION '2 A ziet rij van B'; END IF;
  BEGIN UPDATE public.nieuwsprofiel SET krant_variant = 'tijdlijn' WHERE user_id = a; RAISE EXCEPTION '3 sessie zette krant_variant';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '3 OK 42501 krant_variant'; END;
  BEGIN UPDATE public.nieuwsprofiel SET afgeleid_at = now() WHERE user_id = a; RAISE EXCEPTION '4 sessie zette afgeleid_at';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '4 OK 42501 afgeleid_at'; END;
  UPDATE public.nieuwsprofiel SET tijdlijn_gelezen_tot = now() WHERE user_id = a;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '5 tijdlijn_gelezen_tot eigen rij niet schrijfbaar (%)', n; END IF;
  UPDATE public.nieuwsprofiel SET woonplan = 'geen-koopplan', herkomst = herkomst || '{"woonplan":"zelf"}', updated_at = now() WHERE user_id = a;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '6 profielveld eigen rij niet schrijfbaar (%)', n; END IF;
  UPDATE public.nieuwsprofiel SET woonplan = 'geen-koopplan' WHERE user_id = b;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '7 A schreef rij van B'; END IF;
  BEGIN UPDATE public.nieuwsprofiel SET user_id = b WHERE user_id = a; RAISE EXCEPTION '8 her-sleutelen toegelaten';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR unique_violation THEN RAISE NOTICE '8 OK her-sleutelen geweigerd (%)', SQLSTATE; END;
  BEGIN INSERT INTO public.nieuwsprofiel (user_id, krant_variant) VALUES (a, 'tijdlijn'); RAISE EXCEPTION '9 insert met krant_variant toegelaten';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '9 OK 42501'; END;
  BEGIN INSERT INTO public.nieuwsprofiel (user_id) VALUES (b); RAISE EXCEPTION '10 insert met andermans user_id toegelaten';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '10 OK 42501 (RLS)'; END;
  INSERT INTO public.nieuwsprofiel (user_id, woonplan) VALUES (a, 'kopen-binnen-2-jaar')
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, woonplan = EXCLUDED.woonplan;
  RAISE NOTICE '11 OK PostgREST-upsertvorm toegestaan op de eigen rij';
  BEGIN UPDATE public.nieuwsprofiel SET herkomst = (SELECT jsonb_object_agg('k' || g, repeat('x', 40)) FROM generate_series(1, 200) g) WHERE user_id = a;
        RAISE EXCEPTION '12 herkomst > 2048 bytes toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '12 OK 23514 herkomst begrensd'; END;
  BEGIN UPDATE public.krant_editie_items SET tijdlijn = false WHERE user_id = a; RAISE EXCEPTION '13a sessie schrijft items';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '13a OK 42501'; END;
  BEGIN INSERT INTO public.krant_edities (user_id, week_key, bron, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg)
        VALUES (a, '2026-W40', 'tijdlijn', 4, 2, 1, 'leaktest', '{}', true); RAISE EXCEPTION '13b sessie fabriceert verversing';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '13b OK 42501'; END;
  SELECT count(*) INTO n FROM public.krant_editie_items WHERE user_id = b;
  IF n <> 0 THEN RAISE EXCEPTION '14 A ziet items van B'; END IF;
END $$;

-- 15 anon: 42501 verwacht (geen lege set)
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.nieuwsprofiel LIMIT 1; RAISE EXCEPTION '15a anon leest nieuwsprofiel';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '15a OK 42501'; END;
  BEGIN UPDATE public.nieuwsprofiel SET krant_variant = 'tijdlijn'; RAISE EXCEPTION '15b anon schrijft';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '15b OK 42501'; END;
  BEGIN PERFORM 1 FROM public.krant_editie_items LIMIT 1; RAISE EXCEPTION '15c anon leest items';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '15c OK 42501'; END;
END $$;

-- 16-17 service_role: positieve controle + unieke index
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE n int; a uuid := current_setting('leaktest.a')::uuid; art uuid; e1 uuid; e2 uuid; BEGIN
  UPDATE public.nieuwsprofiel SET krant_variant='tijdlijn', tijdlijn_gelezen_tot=now(), afgeleid_at=now() WHERE user_id = a;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '16a service_role zet service-kolommen niet'; END IF;
  UPDATE public.profiles SET krant_schaduw_bezwaar_at = now() WHERE id = a;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '16b service_role zet het bezwaar niet'; END IF;
  INSERT INTO public.nieuwsprofiel (user_id, woonplan, herkomst, afgeleid_at, updated_at) VALUES (a, 'geen-koopplan', '{}', now(), now())
    ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id, woonplan=EXCLUDED.woonplan, herkomst=EXCLUDED.herkomst, afgeleid_at=EXCLUDED.afgeleid_at, updated_at=EXCLUDED.updated_at;
  RAISE NOTICE '16 OK service_role (incl. PostgREST-upsertvorm)';
  SELECT id INTO art FROM public.news_articles LIMIT 1;
  IF art IS NULL THEN RAISE NOTICE '17 overgeslagen: geen artikel'; RETURN; END IF;
  INSERT INTO public.krant_edities (user_id, week_key, bron, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg, item_count)
    VALUES (a,'2026-W40','tijdlijn',4,2,1,'leaktest','{}',false,1) RETURNING id INTO e1;
  INSERT INTO public.krant_edities (user_id, week_key, bron, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg, item_count)
    VALUES (a,'2026-W40','tijdlijn',4,2,1,'leaktest','{}',false,1) RETURNING id INTO e2;
  INSERT INTO public.krant_editie_items (editie_id,user_id,article_id,tijdlijn,positie,vorm,score,sjabloon_id,variant,tekst,snapshot)
    VALUES (e1,a,art,true,0,'raakt',2,'leaktest',0,'t','{}');
  BEGIN INSERT INTO public.krant_editie_items (editie_id,user_id,article_id,tijdlijn,positie,vorm,score,sjabloon_id,variant,tekst,snapshot)
          VALUES (e2,a,art,true,0,'raakt',2,'leaktest',0,'t','{}');
        RAISE EXCEPTION '17 tweede tijdlijnitem met zelfde artikel toegelaten';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE '17 OK 23505 — artikel hoogstens één keer per tijdlijn'; END;
END $$;
-- 18 RPC krant_geduide_artikelen (fase 2): anon/public geen execute, authenticated wel;
-- 18c/18d draaien als de ECHTE aanroeper (authenticated met JWT-claims), niet
-- als service_role (die omzeilt RLS en zou ook een SECURITY INVOKER-functie
-- laten slagen — security G4, 29-09).
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.krant_geduide_artikelen(uuid[])', 'EXECUTE') THEN RAISE EXCEPTION '18a anon mag de RPC aanroepen'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.krant_geduide_artikelen(uuid[])', 'EXECUTE') THEN RAISE EXCEPTION '18b authenticated mag de RPC niet aanroepen'; END IF;
END $$;
DO $$ DECLARE g uuid; ng uuid; BEGIN
  SELECT id INTO g FROM public.news_articles WHERE duiding_status = 'geduid' LIMIT 1;
  SELECT id INTO ng FROM public.news_articles WHERE duiding_status <> 'geduid' LIMIT 1;
  PERFORM set_config('leaktest.g', coalesce(g::text, ''), true);
  PERFORM set_config('leaktest.ng', coalesce(ng::text, ''), true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('leaktest.a'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('leaktest.a'), true);
DO $$ DECLARE n int; g uuid := nullif(current_setting('leaktest.g'), '')::uuid; ng uuid := nullif(current_setting('leaktest.ng'), '')::uuid; a uuid := current_setting('leaktest.a')::uuid; BEGIN
  -- authenticated leest news_articles zelf NIET (policy service/superadmin), de RPC wel de status.
  SELECT count(*) INTO n FROM public.krant_geduide_artikelen(array_remove(ARRAY[g, ng], NULL));
  IF n <> (CASE WHEN g IS NULL THEN 0 ELSE 1 END) THEN RAISE EXCEPTION '18c RPC als authenticated geeft % rijen, verwacht alleen het geduide artikel', n; END IF;
  -- 18d de exacte PostgREST-upsertvorm van PUT /api/krant/tijdlijn/gelezen
  INSERT INTO public.nieuwsprofiel (user_id, tijdlijn_gelezen_tot, updated_at) VALUES (a, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, tijdlijn_gelezen_tot = EXCLUDED.tijdlijn_gelezen_tot, updated_at = EXCLUDED.updated_at;
  -- 18e de rem-kolom is voor een sessie NIET schrijfbaar
  BEGIN UPDATE public.nieuwsprofiel SET tijdlijn_vernieuwd_at = now() WHERE user_id = a;
        RAISE EXCEPTION '18e sessie schrijft tijdlijn_vernieuwd_at';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE '18 OK RPC als authenticated, gelezen-upsert, rem-kolom dicht';
END $$;
RESET ROLE;
ROLLBACK;
