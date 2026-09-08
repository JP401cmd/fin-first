-- RLS-leaktest voor public.chat_conversations + public.chat_messages
-- Hoort bij migratie 20260908120000_chat_gespreksgeschiedenis.sql en ADR 0137.
--
-- ── STATUS: NOG NIET GEDRAAID ───────────────────────────────────────────────
-- De migratie is op 08-09-2026 geschreven maar bewust NIET uitgerold (de
-- eigenaar rolt hem uit na de security-review). Alles hieronder is dus een
-- VERWACHTING, geen meting. Werk deze kop bij zodra het script live gedraaid
-- is — met de datum en de uitslag, zoals bij
-- scripts/verify-achieved-milestones-rls.sql.
--
-- ── VORM (patroon uit deze repo) ────────────────────────────────────────────
-- Rol-gesimuleerde verificatie: `set local role` + `request.jwt.claims`, in één
-- transactie die TERUGROLT. Er blijven geen testrijen achter.
--
-- Het script is LUID BIJ FALEN en stil bij succes: elk geval eindigt op
-- RAISE NOTICE (geslaagd) of RAISE EXCEPTION (gefaald, met de reden). Eén
-- afwijking breekt de hele transactie af.
--
-- ── VOORWAARDEN ─────────────────────────────────────────────────────────────
--   * Draaien als de migratie-/eigenaarsrol (postgres), niet als anon.
--   * Er moeten minimaal TWEE bestaande rijen in auth.users staan.
--
-- ── DE GEVALLEN EN HUN VERWACHTE UITKOMST ───────────────────────────────────
--   1  SELECT eigen gesprek als authenticated        → 1 rij   (positieve controle)
--   2  SELECT gesprek van een ANDERE gebruiker       → 0 rijen (cross-user dicht)
--  2b  SELECT berichten van een ANDERE gebruiker     → 0 rijen (de gevoeligste tabel)
--   3  SELECT als anon (beide tabellen)              → 0 rijen ÉN geen fout
--  3b  INSERT als anon                               → geweigerd, 42501
--  3c  UPDATE als anon                               → geweigerd 42501 of 0 rijen
--   4  UPDATE title op eigen gesprek                 → toegestaan, 1 rij
--   5  UPDATE message_count als authenticated        → geweigerd, 42501
--   6  UPDATE origin als authenticated               → geweigerd, 42501
--   7  INSERT met origin = 'lokaal'                  → geweigerd, 23514 (DE VLOER)
--   8  INSERT met andermans user_id                  → geweigerd, 42501
--  8b  INSERT in chat_messages, EIGEN gesprek        → geweigerd, 42501 (RPC = enige schrijver)
--  8c  INSERT in chat_messages, ANDERMANS gesprek    → geweigerd, 42501 (de cross-parent-inbraak)
--   9  UPDATE op chat_messages.content               → 0 rijen of 42501 (onveranderlijk)
--  10  append_chat_turn op EIGEN gesprek             → slaagt, teller + next_seq herteld
-- 10b  append_chat_turn tweemaal met dezelfde seq    → idempotent, geen duplicaat
-- 10c  append_chat_turn op ANDERMANS gesprek         → geweigerd, 42501
-- 10d  append_chat_turn met createdAt 'infinity'     → geklemd op now() + 1 min
--  11  DELETE eigen gesprek                          → 1 rij, berichten cascaden mee
--  12  Structuur- en rechtencontrole (ACL, policies, indexen, FK, CHECK, kolom)
--
-- Geval 1 is geen franje: zonder positieve controle bewijst "0 rijen" niets —
-- een lege tabel of een kapotte rolsimulatie geeft dezelfde nul. Faalt geval 1,
-- dan is de SIMULATIE stuk (bv. `auth.uid()` leest de oudere GUC
-- `request.jwt.claim.sub`), niet de policy.
--
-- Geval 3 is verplicht (.claude/skills/_shared/pijplijn-conventies.md —
-- "Leak-checks: altijd óók de anon-rol") en toetst óók de FOUTVORM: anon hoort
-- een LEGE SET te krijgen, geen policy-/permissiefout. Een fout i.p.v. een lege
-- set duidt op een rolset-regressie, niet op strengere beveiliging (ADR 0048).
--
-- Geval 7 is het hart van deze test: het is de databasehelft van de
-- privacyvloer uit ADR 0137. Slaagt die insert, dan kan een coderegressie een
-- lokaal gevoerd gesprek alsnog naar onze servers schrijven.
--
-- Geval 8c komt uit de security-ronde van 08-09-2026 en is subtieler dan hij
-- oogt. De eerste opzet had op `chat_messages` een INSERT-policy die alleen
-- `user_id = auth.uid()` toetste. Een FK-check omzeilt RLS, dus A kon een rij
-- schrijven met zijn EIGEN user_id en het `conversation_id` van B. Zo'n rij is
-- in B's transcript onzichtbaar (de SELECT-policy filtert op user_id) maar telde
-- wél mee in B's cap, liet B's oudste beurten snoeien, schoof B's
-- `last_message_at` op en bezette `seq`-nummers waardoor B's echte beurten stil
-- op `ON CONFLICT DO NOTHING` verdampten. De INSERT-policy is daarom weg en het
-- INSERT-recht ingetrokken: `append_chat_turn` is de enige schrijver. Geval 8b
-- staat ernaast omdat het onderscheid ertoe doet — zelfs op zijn EIGEN gesprek
-- mag een gebruiker niet rechtstreeks schrijven, want dan loopt hij om de cap
-- en de `truncated`-markering heen.

BEGIN;

-- ── Opzet ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_a     uuid;
  v_b     uuid;
  v_ca    uuid;
  v_cb    uuid;
BEGIN
  SELECT id INTO v_a FROM auth.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM auth.users WHERE id <> v_a ORDER BY created_at, id LIMIT 1;

  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'OPZET FAALT: leaktest vereist twee bestaande auth.users-rijen';
  END IF;

  INSERT INTO public.chat_conversations (user_id, title)
  VALUES (v_a, 'LEAKTEST gesprek A') RETURNING id INTO v_ca;
  INSERT INTO public.chat_conversations (user_id, title)
  VALUES (v_b, 'LEAKTEST gesprek B') RETURNING id INTO v_cb;

  INSERT INTO public.chat_messages (conversation_id, user_id, seq, role, content)
  VALUES
    (v_ca, v_a, 0, 'user',      'LEAKTEST vraag van A'),
    (v_ca, v_a, 1, 'assistant', 'LEAKTEST antwoord aan A'),
    (v_cb, v_b, 0, 'user',      'LEAKTEST vraag van B — mag A NOOIT zien');

  PERFORM set_config('leaktest.user_a', v_a::text, true);
  PERFORM set_config('leaktest.user_b', v_b::text, true);
  PERFORM set_config('leaktest.conv_a', v_ca::text, true);
  PERFORM set_config('leaktest.conv_b', v_cb::text, true);

  RAISE NOTICE 'OPZET OK: gesprekken voor A=% en B=% geplaatst', v_a, v_b;
END $$;

-- ── Rol A: ingelogde gebruiker A ────────────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('leaktest.user_a'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Geval 1 + 2 + 2b — lezen
DO $$
DECLARE
  n_eigen int;
  n_ander int;
  n_msg   int;
BEGIN
  SELECT count(*) INTO n_eigen FROM public.chat_conversations
   WHERE id = current_setting('leaktest.conv_a')::uuid;
  SELECT count(*) INTO n_ander FROM public.chat_conversations
   WHERE user_id = current_setting('leaktest.user_b')::uuid;
  SELECT count(*) INTO n_msg FROM public.chat_messages
   WHERE conversation_id = current_setting('leaktest.conv_b')::uuid;

  IF n_eigen <> 1 THEN
    RAISE EXCEPTION 'GEVAL 1 FAALT: eigen gesprek niet zichtbaar (n=%). Positieve controle mislukt — geval 2 bewijst dan niets.', n_eigen;
  END IF;
  IF n_ander <> 0 THEN
    RAISE EXCEPTION 'GEVAL 2 FAALT: CROSS-USER LEK — % gesprek(ken) van B zichtbaar voor A', n_ander;
  END IF;
  IF n_msg <> 0 THEN
    RAISE EXCEPTION 'GEVAL 2b FAALT: CROSS-USER LEK OP DE CHATTEKST — % bericht(en) van B zichtbaar voor A', n_msg;
  END IF;
  RAISE NOTICE 'GEVAL 1 OK (eigen gesprek zichtbaar). GEVAL 2 OK / 2b OK (niets van B zichtbaar).';
END $$;

-- ── Rol anon ────────────────────────────────────────────────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;

DO $$
DECLARE
  n_conv int;
  n_msg  int;
BEGIN
  -- Geval 3 — lege set, geen fout
  BEGIN
    SELECT count(*) INTO n_conv FROM public.chat_conversations;
    SELECT count(*) INTO n_msg  FROM public.chat_messages;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'GEVAL 3 FAALT: anon kreeg SQLSTATE % i.p.v. een lege set. Dat duidt op een rolset-regressie (SELECT-grant weggevallen), niet op betere beveiliging.', SQLSTATE;
  END;
  IF n_conv <> 0 OR n_msg <> 0 THEN
    RAISE EXCEPTION 'GEVAL 3 FAALT: anon ziet % gesprek(ken) en % bericht(en)', n_conv, n_msg;
  END IF;
  RAISE NOTICE 'GEVAL 3 OK: anon ziet 0 rijen in beide tabellen en krijgt geen fout.';

  -- Geval 3b — anon INSERT geweigerd
  BEGIN
    INSERT INTO public.chat_conversations (user_id, title)
    VALUES (current_setting('leaktest.user_a')::uuid, 'anonpoging');
    RAISE EXCEPTION 'GEVAL 3b FAALT: anon kon een gesprek INSERTEN';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 3b OK: anon INSERT geweigerd (42501).';
  END;

  -- Geval 3c — anon UPDATE geweigerd of 0 rijen
  BEGIN
    UPDATE public.chat_conversations SET title = 'anonpoging';
    GET DIAGNOSTICS n_conv = ROW_COUNT;
    IF n_conv <> 0 THEN
      RAISE EXCEPTION 'GEVAL 3c FAALT: anon muteerde % rij(en)', n_conv;
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

DO $$
DECLARE
  n int;
BEGIN
  -- 4: hernoemen MOET slagen (anders is PATCH /api/chat/conversations/[id] stuk)
  UPDATE public.chat_conversations
     SET title = 'LEAKTEST hernoemd'
   WHERE id = current_setting('leaktest.conv_a')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'GEVAL 4 FAALT: UPDATE op title raakte % rij(en), verwacht 1', n;
  END IF;
  RAISE NOTICE 'GEVAL 4 OK: hernoemen slaagt op het eigen gesprek (1 rij).';

  -- 5: message_count herschrijven mag niet (kolom-gescoopte GRANT)
  BEGIN
    UPDATE public.chat_conversations
       SET message_count = 9999
     WHERE id = current_setting('leaktest.conv_a')::uuid;
    RAISE EXCEPTION 'GEVAL 5 FAALT: UPDATE op message_count werd TOEGESTAAN — de teller is dan een tweede waarheid';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 5 OK: UPDATE op message_count geweigerd (42501).';
  END;

  -- 6: origin herschrijven mag niet — anders is de vloer alsnog te draaien
  BEGIN
    UPDATE public.chat_conversations
       SET origin = 'lokaal'
     WHERE id = current_setting('leaktest.conv_a')::uuid;
    RAISE EXCEPTION 'GEVAL 6 FAALT: UPDATE op origin werd TOEGESTAAN — de privacyvloer is omkeerbaar vanuit de client';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 6 OK: UPDATE op origin geweigerd (42501).';
  END;

  -- 7: DE VLOER — een lokaal gevoerd gesprek mag hier niet landen
  BEGIN
    INSERT INTO public.chat_conversations (user_id, title, origin)
    VALUES (current_setting('leaktest.user_a')::uuid, 'LEAKTEST lokaal', 'lokaal');
    RAISE EXCEPTION 'GEVAL 7 FAALT: een gesprek met origin=''lokaal'' kon op de SERVER worden geschreven — de privacyvloer van ADR 0137 is weg';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'GEVAL 7 OK: INSERT met origin=''lokaal'' geweigerd door de CHECK (23514).';
  END;

  -- 8: INSERT met andermans user_id → WITH CHECK weigert (42501)
  BEGIN
    INSERT INTO public.chat_conversations (user_id, title)
    VALUES (current_setting('leaktest.user_b')::uuid, 'LEAKTEST spoof');
    RAISE EXCEPTION 'GEVAL 8 FAALT: INSERT met andermans user_id werd TOEGESTAAN';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 8 OK: INSERT met andermans user_id geweigerd (42501).';
  END;

  -- 8b: rechtstreeks in de EIGEN gesprekstekst schrijven mag niet — dat zou om
  --     de cap van 200 en de truncated-markering heen lopen. append_chat_turn
  --     is de enige schrijver.
  BEGIN
    INSERT INTO public.chat_messages (conversation_id, user_id, seq, role, content)
    VALUES (current_setting('leaktest.conv_a')::uuid,
            current_setting('leaktest.user_a')::uuid,
            90, 'user', 'LEAKTEST directe insert op eigen gesprek');
    RAISE EXCEPTION 'GEVAL 8b FAALT: een directe INSERT in chat_messages werd TOEGESTAAN — de RPC is dan niet de enige schrijver en de cap is te omzeilen';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 8b OK: directe INSERT in chat_messages geweigerd (42501).';
  END;

  -- 8c: DE CROSS-PARENT-INBRAAK. Eigen user_id, andermans conversation_id. Een
  --     FK-check omzeilt RLS, dus dit moet op het RECHT stuklopen en niet op
  --     een policy die alleen user_id toetst. Zie de kop.
  BEGIN
    INSERT INTO public.chat_messages (conversation_id, user_id, seq, role, content)
    VALUES (current_setting('leaktest.conv_b')::uuid,
            current_setting('leaktest.user_a')::uuid,
            91, 'user', 'LEAKTEST rij van A in het gesprek van B');
    RAISE EXCEPTION 'GEVAL 8c FAALT: A kon een bericht in het gesprek van B schuiven — onzichtbaar voor B, maar het vult zijn cap, snoeit zijn oudste beurten en bezet zijn seq-nummers';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 8c OK: INSERT met andermans conversation_id geweigerd (42501).';
  END;

  -- 9: een bewaard bericht is onveranderlijk (geen UPDATE-policy)
  BEGIN
    UPDATE public.chat_messages
       SET content = 'LEAKTEST herschreven'
     WHERE conversation_id = current_setting('leaktest.conv_a')::uuid;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'GEVAL 9 FAALT: % bericht(en) herschreven — een beurt hoort onveranderlijk te zijn', n;
    END IF;
    RAISE NOTICE 'GEVAL 9 OK: UPDATE op chat_messages raakt 0 rijen (geen update-policy).';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 9 OK: UPDATE op chat_messages geweigerd (42501).';
  END;
END $$;

-- Geval 10 — de RPC
DO $$
DECLARE
  v_row   jsonb;
  n       int;
BEGIN
  -- 10: eigen gesprek → slaagt, teller wordt HERTELD (2 bestaande + 2 nieuwe)
  v_row := public.append_chat_turn(
    current_setting('leaktest.conv_a')::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 2, 'role', 'user',      'content', 'LEAKTEST vervolgvraag', 'richKinds', '[]'::jsonb),
      jsonb_build_object('seq', 3, 'role', 'assistant', 'content', 'LEAKTEST vervolgantwoord', 'richKinds', jsonb_build_array('visualisatie'))
    )
  );
  IF (v_row->>'message_count')::int <> 4 THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: message_count is % , verwacht 4 (herteld, niet opgehoogd)', v_row->>'message_count';
  END IF;
  IF (v_row->>'truncated')::boolean THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: truncated staat TRUE bij 4 berichten';
  END IF;
  -- next_seq = max(seq) + 1 = 4. Dit is het contract met de client: hij houdt
  -- geen eigen volgnummer bij, want zo'n teller beweegt niet mee als een
  -- schrijfactie faalt en laat de volgende beurt stil op ON CONFLICT DO NOTHING
  -- verdampen. Bewust NIET gelijk aan message_count in het algemene geval —
  -- die is gecapt op 200 terwijl seq doorloopt.
  IF (v_row->>'next_seq')::int <> 4 THEN
    RAISE EXCEPTION 'GEVAL 10 FAALT: next_seq is %, verwacht 4 (max(seq) + 1)', v_row->>'next_seq';
  END IF;
  RAISE NOTICE 'GEVAL 10 OK: append_chat_turn schreef de beurt, hertelde naar 4 en gaf next_seq = 4 terug.';

  -- 10b: dezelfde seq nogmaals → idempotent, geen duplicaat, geen fout
  v_row := public.append_chat_turn(
    current_setting('leaktest.conv_a')::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 2, 'role', 'user', 'content', 'LEAKTEST POGING TOT OVERSCHRIJVEN', 'richKinds', '[]'::jsonb)
    )
  );
  SELECT count(*) INTO n FROM public.chat_messages
   WHERE conversation_id = current_setting('leaktest.conv_a')::uuid;
  IF n <> 4 THEN
    RAISE EXCEPTION 'GEVAL 10b FAALT: herhaalde seq leverde % berichten, verwacht 4', n;
  END IF;
  SELECT count(*) INTO n FROM public.chat_messages
   WHERE conversation_id = current_setting('leaktest.conv_a')::uuid
     AND content = 'LEAKTEST POGING TOT OVERSCHRIJVEN';
  IF n <> 0 THEN
    RAISE EXCEPTION 'GEVAL 10b FAALT: een bestaande beurt is OVERSCHREVEN via de RPC';
  END IF;
  RAISE NOTICE 'GEVAL 10b OK: herhaalde seq is een no-op en overschrijft niets.';

  -- 10c: andermans gesprek → geweigerd, en NIET stil
  BEGIN
    v_row := public.append_chat_turn(
      current_setting('leaktest.conv_b')::uuid,
      jsonb_build_array(jsonb_build_object('seq', 1, 'role', 'user', 'content', 'LEAKTEST inbraak', 'richKinds', '[]'::jsonb))
    );
    RAISE EXCEPTION 'GEVAL 10c FAALT: A kon via de security-definer-RPC in het gesprek van B schrijven';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GEVAL 10c OK: append_chat_turn op andermans gesprek geweigerd (42501).';
  END;

  -- 10d: `createdAt` komt van de client en 'infinity' is een GELDIG
  --      TIMESTAMPTZ-literal. Ongeklemd landt hij via greatest() in
  --      last_message_at: het gesprek staat dan permanent bovenaan én de
  --      keyset-pagineerder weigert zijn eigen cursor (Date.parse('infinity')
  --      is NaN → 400). Herstellen kan de gebruiker niet — last_message_at valt
  --      buiten zijn kolom-GRANT.
  v_row := public.append_chat_turn(
    current_setting('leaktest.conv_a')::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 4, 'role', 'user', 'content', 'LEAKTEST toekomstig tijdstip',
                         'richKinds', '[]'::jsonb, 'createdAt', 'infinity')
    )
  );
  IF (v_row->>'last_message_at')::timestamptz > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'GEVAL 10d FAALT: last_message_at staat op % — een client-createdAt van ''infinity'' wordt niet geklemd; het gesprek staat dan voorgoed bovenaan en de pagineerder weigert zijn eigen cursor', v_row->>'last_message_at';
  END IF;
  IF (v_row->>'next_seq')::int <> 5 THEN
    RAISE EXCEPTION 'GEVAL 10d FAALT: next_seq is %, verwacht 5', v_row->>'next_seq';
  END IF;
  RAISE NOTICE 'GEVAL 10d OK: createdAt = ''infinity'' geklemd, last_message_at blijft bruikbaar, next_seq = 5.';
END $$;

-- Geval 11 — verwijderen (mag hier wél, anders dan bij achieved_milestones)
DO $$
DECLARE
  n int;
BEGIN
  DELETE FROM public.chat_conversations
   WHERE id = current_setting('leaktest.conv_a')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'GEVAL 11 FAALT: DELETE op het eigen gesprek raakte % rij(en), verwacht 1 — de opslagkeuze is hol zonder wisrecht', n;
  END IF;

  SELECT count(*) INTO n FROM public.chat_messages
   WHERE conversation_id = current_setting('leaktest.conv_a')::uuid;
  IF n <> 0 THEN
    RAISE EXCEPTION 'GEVAL 11 FAALT: % bericht(en) overleefden het verwijderen van het gesprek (cascade kapot)', n;
  END IF;
  RAISE NOTICE 'GEVAL 11 OK: eigen gesprek verwijderd, berichten cascadeerden mee.';
END $$;

-- ── Geval 12: structuur en rechten (als eigenaarsrol) ───────────────────────

RESET ROLE;

DO $$
DECLARE
  v_conv regclass := 'public.chat_conversations'::regclass;
  v_msg  regclass := 'public.chat_messages'::regclass;
  v_bool boolean;
  n      int;
  v_txt  text;
BEGIN
  -- RLS aan op beide tabellen
  SELECT relrowsecurity INTO v_bool FROM pg_class WHERE oid = v_conv;
  IF NOT v_bool THEN RAISE EXCEPTION 'GEVAL 12 FAALT: RLS staat UIT op chat_conversations'; END IF;
  SELECT relrowsecurity INTO v_bool FROM pg_class WHERE oid = v_msg;
  IF NOT v_bool THEN RAISE EXCEPTION 'GEVAL 12 FAALT: RLS staat UIT op chat_messages'; END IF;

  -- Policies: 4 op conversations, 3 op messages, alle uitsluitend authenticated
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'chat_conversations';
  IF n <> 4 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: % policies op chat_conversations, verwacht 4', n; END IF;

  -- Twee, niet drie: de INSERT-policy is bewust verworpen (zie de kop bij 8c).
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'chat_messages';
  IF n <> 2 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: % policies op chat_messages, verwacht 2 (SELECT + DELETE; een INSERT-policy hoort er NIET te zijn)', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('chat_conversations', 'chat_messages')
     AND roles <> '{authenticated}';
  IF n <> 0 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: % policy(s) staan op een andere rol dan authenticated', n; END IF;

  SELECT string_agg(DISTINCT cmd, ',' ORDER BY cmd) INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'chat_messages';
  IF v_txt IS DISTINCT FROM 'DELETE,SELECT' THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: policy-verbs op chat_messages zijn "%", verwacht "DELETE,SELECT" (geen INSERT, geen UPDATE, geen ALL — append_chat_turn is de enige schrijver)', v_txt;
  END IF;

  -- Kolom-gescoopt schrijfrecht op chat_conversations
  IF has_table_privilege('authenticated', v_conv, 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated heeft nog TABEL-brede UPDATE op chat_conversations — de kolom-GRANT is dan een no-op';
  END IF;
  IF NOT has_column_privilege('authenticated', v_conv, 'title', 'UPDATE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated mist UPDATE op title — hernoemen is stuk';
  END IF;
  FOREACH v_txt IN ARRAY ARRAY['message_count', 'next_seq', 'last_message_at', 'truncated', 'origin', 'surface', 'user_id'] LOOP
    IF has_column_privilege('authenticated', v_conv, v_txt, 'UPDATE') THEN
      RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated heeft UPDATE op chat_conversations.%', v_txt;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', v_conv, 'SELECT')
     OR NOT has_table_privilege('authenticated', v_conv, 'INSERT')
     OR NOT has_table_privilege('authenticated', v_conv, 'DELETE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated mist SELECT/INSERT/DELETE op chat_conversations';
  END IF;

  -- chat_messages: LEZEN en WISSEN, niet schrijven. De INSERT is ingetrokken,
  -- zodat een directe insert een luide 42501 geeft (geval 8b/8c) i.p.v. een
  -- stille nul via de ontbrekende policy. DELETE moet blijven, anders doet
  -- deleteAllUserData (sessieclient) stil niets.
  IF has_table_privilege('authenticated', v_msg, 'INSERT') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated heeft INSERT op chat_messages — append_chat_turn is dan niet de enige schrijver';
  END IF;
  IF NOT has_table_privilege('authenticated', v_msg, 'SELECT')
     OR NOT has_table_privilege('authenticated', v_msg, 'DELETE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated mist SELECT/DELETE op chat_messages';
  END IF;

  -- anon MOET SELECT houden: dat is wat een lege set i.p.v. een fout oplevert
  IF NOT has_table_privilege('anon', v_conv, 'SELECT')
     OR NOT has_table_privilege('anon', v_msg, 'SELECT') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: anon mist SELECT — geval 3 zou een 42501 geven i.p.v. een lege set';
  END IF;

  -- … maar anon heeft géén schrijfrechten meer. RLS blokkeert hem al volledig
  -- (geen enkele policy is TO anon); dit haalt de tabel-brede grants uit
  -- ALTER DEFAULT PRIVILEGES weg, zodat één weggevallen policy niet meteen een
  -- schrijfgat is.
  FOREACH v_txt IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('anon', v_conv, v_txt) THEN
      RAISE EXCEPTION 'GEVAL 12 FAALT: anon heeft % op chat_conversations', v_txt;
    END IF;
    IF has_table_privilege('anon', v_msg, v_txt) THEN
      RAISE EXCEPTION 'GEVAL 12 FAALT: anon heeft % op chat_messages', v_txt;
    END IF;
  END LOOP;

  -- De vloer als constraint
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_conv AND contype = 'c' AND conname = 'chat_conversations_origin_floor';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: de privacyvloer chat_conversations_origin_floor ontbreekt'; END IF;

  SELECT pg_get_constraintdef(oid) INTO v_txt FROM pg_constraint
   WHERE conrelid = v_conv AND conname = 'chat_conversations_origin_floor';
  IF v_txt NOT ILIKE '%origin%=%cloud%' THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: de vloer is VERRUIMD — constraint luidt nu "%". Verruimen mag alleen via een nieuw ADR.', v_txt;
  END IF;

  -- Idempotentie-sleutel
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_msg AND contype = 'u' AND conname = 'chat_messages_seq_uniq';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: UNIQUE (conversation_id, seq) ontbreekt — het appenden is dan niet idempotent'; END IF;

  -- FK's naar auth.users met ON DELETE CASCADE (AVG-wisroute), op BEIDE tabellen
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_conv AND contype = 'f' AND confdeltype = 'c'
     AND confrelid = 'auth.users'::regclass;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: chat_conversations mist de FK naar auth.users met ON DELETE CASCADE (n=%)', n; END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_msg AND contype = 'f' AND confdeltype = 'c'
     AND confrelid = 'auth.users'::regclass;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: chat_messages mist de FK naar auth.users met ON DELETE CASCADE (n=%)', n; END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = v_msg AND contype = 'f' AND confdeltype = 'c'
     AND confrelid = v_conv;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: chat_messages mist de FK naar chat_conversations met ON DELETE CASCADE (n=%)', n; END IF;

  -- Indexen
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'chat_conversations_user_recent_idx';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: index chat_conversations_user_recent_idx ontbreekt'; END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'chat_messages_user_idx';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: index chat_messages_user_idx ontbreekt'; END IF;

  -- De RPC: security definer, en anon/service_role hebben GEEN execute
  SELECT prosecdef INTO v_bool FROM pg_proc
   WHERE oid = 'public.append_chat_turn(uuid, jsonb)'::regprocedure;
  IF NOT v_bool THEN RAISE EXCEPTION 'GEVAL 12 FAALT: append_chat_turn is geen security definer'; END IF;

  IF has_function_privilege('anon', 'public.append_chat_turn(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: anon mag append_chat_turn uitvoeren';
  END IF;
  IF has_function_privilege('service_role', 'public.append_chat_turn(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: service_role mag append_chat_turn uitvoeren — er hoort geen systeemschrijfpad op de chattekst te zijn';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.append_chat_turn(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GEVAL 12 FAALT: authenticated mag append_chat_turn NIET uitvoeren — het appenden is stuk';
  END IF;

  -- Leeg search_path: alle verwijzingen in de functie zijn volledig
  -- gekwalificeerd, dus dit kost niets en maakt de functie onafhankelijk van die
  -- zorgvuldigheid. Een later toegevoegde onqualifieerde naam faalt dan luid.
  -- Postgres schrijft een leeg pad als `search_path=` of `search_path=""`,
  -- afhankelijk van de versie; beide vormen zijn goed.
  SELECT count(*) INTO n
    FROM pg_proc p, unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
   WHERE p.oid = 'public.append_chat_turn(uuid, jsonb)'::regprocedure
     AND cfg IN ('search_path=', 'search_path=""');
  IF n <> 1 THEN
    SELECT coalesce(array_to_string(proconfig, ', '), '(geen)') INTO v_txt FROM pg_proc
     WHERE oid = 'public.append_chat_turn(uuid, jsonb)'::regprocedure;
    RAISE EXCEPTION 'GEVAL 12 FAALT: append_chat_turn draait met proconfig "%", verwacht een leeg search_path', v_txt;
  END IF;

  -- next_seq: de kolom die het volgnummer-contract draagt
  SELECT count(*) INTO n FROM pg_attribute
   WHERE attrelid = v_conv AND attname = 'next_seq' AND NOT attisdropped;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: chat_conversations.next_seq ontbreekt — de client zou zijn volgnummer weer zelf moeten bijhouden'; END IF;

  -- Additieve kolom op profiles + de CHECK
  SELECT count(*) INTO n FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
     AND attname = 'chat_history_mode' AND NOT attisdropped;
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: profiles.chat_history_mode ontbreekt'; END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass
     AND conname = 'profiles_chat_history_mode_check';
  IF n <> 1 THEN RAISE EXCEPTION 'GEVAL 12 FAALT: profiles_chat_history_mode_check ontbreekt'; END IF;

  RAISE NOTICE 'GEVAL 12 OK: RLS aan, 4+2 policies (alleen authenticated; op messages geen INSERT en geen UPDATE), geen tabel-brede UPDATE op chat_conversations, kolom-GRANT uitsluitend op title, authenticated heeft op chat_messages alleen SELECT+DELETE, anon houdt SELECT maar heeft geen schrijfrechten, de origin-vloer staat er ongewijzigd, FK-cascades op alle drie de relaties, beide indexen, de RPC is security definer met een leeg search_path en execute alleen voor authenticated, next_seq bestaat, en profiles.chat_history_mode bestaat mét CHECK.';
END $$;

SELECT 'ALLE GEVALLEN ZOALS ONTWORPEN — transactie rolt nu terug, geen testrijen achtergebleven' AS uitkomst;

ROLLBACK;
