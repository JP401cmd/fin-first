-- RLS- en kolomgrant-leaktest voor de AI-laag van de Krant (Krant 1E)
-- Hoort bij migratie 20261008120000_krant_ai_laag.sql en ADR 0190.
--
-- ── STATUS: NOG NIET GEDRAAID ───────────────────────────────────────────────
-- Draaien ná het toepassen van 20261004120000 én 20261008120000 (in de
-- release), als postgres. Zelfde vorm als scripts/verify-krant-tijdlijn-rls.sql:
-- rol-gesimuleerd (`set local role` + `request.jwt.claims`) in één transactie
-- die TERUGROLT; stil bij succes (RAISE NOTICE), RAISE EXCEPTION bij een
-- afwijking. Er blijven geen testrijen achter.
--
-- Wat hij bewijst:
--   0   structuur: de kolommen, CHECKs en de unieke oud_ref-index bestaan; geen
--       sessie heeft een schrijfrecht op ai_tekst/ai_toegevoegd/ai_uitkomst/oud_ref.
--   1-2 eigen rij leesbaar (incl. de AI-kolommen), vreemde rij niet.
--   3-5 een sessie kan de AI-kolommen niet schrijven — ook niet op de eigen rij
--       (42501), en kan geen "door AI toegevoegd"-bericht fabriceren.
--   6   anon: 42501. Beide tabellen hebben voor anon geen enkel recht (revoke
--       all sinds 20260922120000, stap 0c bewijst dat); 42501 is hier het
--       VERWACHTE resultaat, zoals in verify-krant-tijdlijn-rls.sql geval 15.
--       Een lege set zonder fout zou betekenen dat anon SELECT terugkreeg: dat
--       is een afwijking (eindreview G5 — de tak "0 rijen" was dode code).
--   7   service_role schrijft de AI-kolommen wel; de CHECKs weigeren wat niet
--       kan (toegevoegd zonder tekst, vorm 'ai' zonder AI-tekst, vorm 'ai-oud'
--       mét AI-tekst of artikel, vorm 'ai' buiten de tijdlijn, een met_ai die
--       niet bij ai_uitkomst past).
--   8   de omzetting (K7) is herhaalbaar: dezelfde oud_ref een tweede keer = 23505.

BEGIN;
DO $$ DECLARE v_a uuid; v_b uuid; e_a uuid; e_b uuid; BEGIN
  SELECT id INTO v_a FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM auth.users WHERE id <> v_a ORDER BY created_at, id LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'OPZET: twee auth.users nodig'; END IF;
  INSERT INTO public.krant_edities (user_id, week_key, bron, met_ai, ai_uitkomst, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg, item_count)
    VALUES (v_a, '2026-W40', 'tijdlijn', true, 'met-ai', 5, 2, 1, 'leaktest', '{}', false, 1) RETURNING id INTO e_a;
  INSERT INTO public.krant_edities (user_id, week_key, bron, met_ai, ai_uitkomst, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg, item_count)
    VALUES (v_b, '2026-W40', 'tijdlijn', true, 'met-ai', 5, 2, 1, 'leaktest', '{}', false, 1) RETURNING id INTO e_b;
  INSERT INTO public.krant_editie_items (editie_id, user_id, article_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_tekst, snapshot)
    VALUES (e_a, v_a, NULL, true, 0, 'relevant', 2, 'leaktest', 0, 'regel A', 'toelichting A', '{}');
  INSERT INTO public.krant_editie_items (editie_id, user_id, article_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_tekst, ai_toegevoegd, snapshot)
    VALUES (e_b, v_b, NULL, true, 0, 'ai', 1, 'ai-toegevoegd', 0, '', 'toelichting B', true, '{}');
  PERFORM set_config('leaktest.a', v_a::text, true);
  PERFORM set_config('leaktest.b', v_b::text, true);
  PERFORM set_config('leaktest.ea', e_a::text, true);
END $$;

-- 0 structuur
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='krant_editie_items' AND column_name='ai_tekst')
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='krant_editie_items' AND column_name='ai_toegevoegd')
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='krant_edities' AND column_name='ai_uitkomst')
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='krant_edities' AND column_name='oud_ref')
  THEN RAISE EXCEPTION '0a een AI-kolom ontbreekt'; END IF;
  IF has_column_privilege('authenticated','public.krant_editie_items','ai_tekst','UPDATE') OR has_column_privilege('authenticated','public.krant_editie_items','ai_tekst','INSERT')
  OR has_column_privilege('authenticated','public.krant_editie_items','ai_toegevoegd','UPDATE') OR has_column_privilege('authenticated','public.krant_editie_items','ai_toegevoegd','INSERT')
  OR has_column_privilege('authenticated','public.krant_edities','ai_uitkomst','UPDATE') OR has_column_privilege('authenticated','public.krant_edities','ai_uitkomst','INSERT')
  OR has_column_privilege('authenticated','public.krant_edities','oud_ref','UPDATE') OR has_column_privilege('authenticated','public.krant_edities','oud_ref','INSERT')
  THEN RAISE EXCEPTION '0b een sessie mag een AI-kolom schrijven'; END IF;
  IF has_table_privilege('anon','public.krant_editie_items','SELECT') OR has_table_privilege('anon','public.krant_edities','SELECT') THEN RAISE EXCEPTION '0c anon heeft SELECT'; END IF;
  IF NOT has_column_privilege('service_role','public.krant_editie_items','ai_tekst','UPDATE') THEN RAISE EXCEPTION '0d service_role mist schrijfrecht op ai_tekst'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='krant_edities_oud_ref_key' AND indexdef ILIKE 'CREATE UNIQUE%(oud_ref)%WHERE%oud_ref IS NOT NULL%') THEN RAISE EXCEPTION '0e unieke oud_ref-index ontbreekt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='krant_editie_items_vorm_check' AND pg_get_constraintdef(oid) ILIKE '%''ai''%' AND pg_get_constraintdef(oid) ILIKE '%''ai-oud''%') THEN RAISE EXCEPTION '0f vorm-CHECK kent ''ai''/''ai-oud'' niet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='krant_editie_items_ai_vorm_check') THEN RAISE EXCEPTION '0g CHECK vorm ai/ai-oud ontbreekt'; END IF;
  RAISE NOTICE '0 structuur OK';
END $$;

-- 1-5 als gebruiker A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('leaktest.a'), 'role','authenticated')::text, true),
       set_config('request.jwt.claim.sub', current_setting('leaktest.a'), true);
DO $$ DECLARE n int; t text; a uuid := current_setting('leaktest.a')::uuid; b uuid := current_setting('leaktest.b')::uuid; ea uuid := current_setting('leaktest.ea')::uuid; BEGIN
  SELECT ai_tekst INTO t FROM public.krant_editie_items WHERE user_id = a AND editie_id = ea;
  IF t IS DISTINCT FROM 'toelichting A' THEN RAISE EXCEPTION '1 A leest zijn eigen AI-tekst niet (%) — simulatie of policy stuk', t; END IF;
  SELECT count(*) INTO n FROM public.krant_editie_items WHERE user_id = b;
  IF n <> 0 THEN RAISE EXCEPTION '2a A ziet items van B'; END IF;
  SELECT count(*) INTO n FROM public.krant_edities WHERE user_id = b;
  IF n <> 0 THEN RAISE EXCEPTION '2b A ziet verversingen van B'; END IF;
  BEGIN UPDATE public.krant_editie_items SET ai_tekst = 'zelf geschreven' WHERE user_id = a; RAISE EXCEPTION '3 sessie schreef ai_tekst';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '3 OK 42501 ai_tekst'; END;
  BEGIN UPDATE public.krant_editie_items SET ai_toegevoegd = true WHERE user_id = a; RAISE EXCEPTION '4a sessie schreef ai_toegevoegd';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '4a OK 42501 ai_toegevoegd'; END;
  BEGIN UPDATE public.krant_edities SET ai_uitkomst = 'leeg', met_ai = false WHERE user_id = a; RAISE EXCEPTION '4b sessie schreef ai_uitkomst';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '4b OK 42501 ai_uitkomst'; END;
  BEGIN INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_tekst, ai_toegevoegd, snapshot)
          VALUES (ea, a, true, 9, 'ai', 1, 'ai-toegevoegd', 0, '', 'nep', true, '{}');
        RAISE EXCEPTION '5 sessie fabriceert een door-AI-toegevoegd bericht';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '5 OK 42501'; END;
END $$;

-- 6 anon: 42501 (verwacht) of 0 rijen zonder fout
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
DO $ DECLARE n int; BEGIN
  BEGIN SELECT count(*) INTO n FROM public.krant_editie_items WHERE ai_tekst IS NOT NULL;
        RAISE EXCEPTION '6a anon kreeg SELECT op krant_editie_items terug (% rijen)', n;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '6a OK 42501 (revoke all, bedoeld)'; END;
  BEGIN SELECT count(*) INTO n FROM public.krant_edities WHERE ai_uitkomst IS NOT NULL;
        RAISE EXCEPTION '6b anon kreeg SELECT op krant_edities terug (% rijen)', n;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '6b OK 42501 (revoke all, bedoeld)'; END;
  BEGIN UPDATE public.krant_editie_items SET ai_tekst = 'anon'; RAISE EXCEPTION '6c anon schrijft';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '6c OK 42501'; END;
END $$;

-- 7-8 service_role: positieve controle + de CHECKs + herhaalbaarheid van oud_ref
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a uuid := current_setting('leaktest.a')::uuid; ea uuid := current_setting('leaktest.ea')::uuid; es uuid; ref text; BEGIN
  UPDATE public.krant_editie_items SET ai_tekst = 'service' WHERE editie_id = ea AND user_id = a;
  IF NOT FOUND THEN RAISE EXCEPTION '7a service_role schrijft ai_tekst niet'; END IF;
  BEGIN INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_toegevoegd, snapshot)
          VALUES (ea, a, true, 5, 'ai', 1, 'ai-toegevoegd', 0, '', true, '{}');
        RAISE EXCEPTION '7b toegevoegd zonder AI-tekst toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7b OK 23514'; END;
  INSERT INTO public.krant_edities (user_id, week_key, bron, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg)
    VALUES (a, '2026-W40', 'schaduw', 5, 2, 1, 'leaktest', '{}', true) RETURNING id INTO es;
  BEGIN INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_tekst, snapshot)
          VALUES (es, a, false, 0, 'ai', 1, 'x', 0, '', 'x', '{}');
        RAISE EXCEPTION '7c vorm ai in de schaduw toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7c OK 23514'; END;
  BEGIN INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, snapshot)
          VALUES (ea, a, true, 6, 'ai', 1, 'ai-toegevoegd', 0, '', '{}');
        RAISE EXCEPTION '7f vorm ai zonder AI-tekst toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7f OK 23514'; END;
  BEGIN INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, ai_tekst, snapshot)
          VALUES (ea, a, true, 7, 'ai-oud', 1, 'ai-oud', 0, '', 'oude modeltekst', '{}');
        RAISE EXCEPTION '7g vorm ai-oud mét AI-tekst toegelaten (R2)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7g OK 23514'; END;
  INSERT INTO public.krant_editie_items (editie_id, user_id, tijdlijn, positie, vorm, score, sjabloon_id, variant, tekst, snapshot)
    VALUES (ea, a, true, 8, 'ai-oud', 1, 'ai-oud', 0, '', '{"titel":"oud"}');
  RAISE NOTICE '7h OK vorm ai-oud zonder AI-tekst en zonder artikel mag';
  BEGIN UPDATE public.krant_edities SET met_ai = false WHERE id = ea; RAISE EXCEPTION '7d met_ai los van ai_uitkomst toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7d OK 23514'; END;
  BEGIN UPDATE public.krant_edities SET ai_uitkomst = 'onzin' WHERE id = ea; RAISE EXCEPTION '7e onbekende ai_uitkomst toegelaten';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '7e OK 23514'; END;
  ref := 'ai-oud:' || a::text || ':' || md5('leaktest');
  INSERT INTO public.krant_edities (user_id, week_key, bron, met_ai, oud_ref, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg)
    VALUES (a, '2026-W40', 'tijdlijn', true, ref, 0, 0, 0, 'ai-oud', '{}', true);
  BEGIN INSERT INTO public.krant_edities (user_id, week_key, bron, met_ai, oud_ref, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg)
          VALUES (a, '2026-W40', 'tijdlijn', true, ref, 0, 0, 0, 'ai-oud', '{}', true);
        RAISE EXCEPTION '8 dezelfde oud_ref twee keer toegelaten';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE '8 OK 23505 — omzetting herhaalbaar'; END;
END $$;
RESET ROLE;
ROLLBACK;
