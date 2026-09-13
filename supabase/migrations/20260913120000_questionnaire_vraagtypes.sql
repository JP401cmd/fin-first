-- ============================================================================
-- Vragenlijsten — nieuwe vraagtypes (ja/nee, rangschikken), instelbare schaal
-- ============================================================================
-- DOEL
-- De vragenlijsten kenden drie vraagtypes (open, schaal, meerkeuze) met een
-- vaste schaal van 1 tot 10. Beheer wil ook ja/nee- en rangschikvragen kunnen
-- stellen, een schaal die bij 0 mag beginnen of korter mag zijn (bv. 1-5), en
-- bij meerkeuze een "anders, namelijk…"-optie. Daarnaast starten nieuwe lijsten
-- voortaan inactief, zodat een half ingevulde lijst niet direct bij gebruikers
-- verschijnt.
--
-- WAT VERANDERT
--   1. questionnaire_questions.type: + 'yes_no', 'ranking'.
--   2. questionnaire_questions: nieuwe kolommen scale_min (0 of 1, default 1),
--      scale_max (2..10, default 10) en allow_other (default false), plus twee
--      CHECKs: geldige schaalgrenzen, en `options` is NULL of een JSON-array.
--   3. questionnaire_responses.answer_scale: ondergrens van 1 naar 0.
--   4. questionnaire_responses.answer_text: maximaal 2000 tekens, answer_choice
--      maximaal 12000 (≤20 opties × 200 tekens als JSON-array, met marge). DB-
--      grens naast de validatie in de route; de responses-policy staat de eigen
--      sessie schrijven toe, dus de database is de laatste verdedigingslinie.
--   5. questionnaires.is_active: default van true naar false. Bestaande rijen
--      worden NIET aangeraakt — alleen de default voor nieuwe inserts wijzigt.
--
-- BEWUST NIET IN DE DATABASE
-- Of answer_scale binnen de scale_min..scale_max van de BIJBEHORENDE vraag valt,
-- is een rij-overstijgende regel (een CHECK kan de vraagrij niet lezen). Die
-- toets hoort in de respond-route. De CHECK hier is de app-brede buitengrens.
--
-- LIVE GEMETEN VÓÓR SCHRIJVEN (pg_constraint / information_schema, 13-09-2026)
--   * Constraintnamen: `questionnaire_questions_type_check` en
--     `questionnaire_responses_answer_scale_check` (de gegenereerde namen van
--     de inline CHECKs uit 20260326000001). Andere CHECKs op deze drie tabellen
--     bestaan niet; de drie nieuwe namen hieronder waren nog vrij.
--   * Alle bestaande vragen voldoen aan de options-array-CHECK (options is
--     overal NULL of een array) en hebben een type binnen de nieuwe lijst.
--   * Alle bestaande antwoorden voldoen aan de nieuwe tekstlengte-grens en aan
--     de verruimde schaal. (Aantallen bewust niet hier: publieke repo, ADR 0111.)
--   * Kolomdrift: `questionnaire_questions.is_multi_select` bestaat live maar
--     stond in geen enkele repo-migratie. Hieronder vastgelegd als no-op
--     (`add column if not exists`), zodat repo, ERD-scanner en database weer
--     hetzelfde beschrijven.
--
-- LINEAGE
-- Bouwt op 20260326000001_create_questionnaire_tables (live NIET geregistreerd
-- in supabase_migrations.schema_migrations, maar het effect staat er: de
-- tabellen en constraints bestaan), 20260719090108_perf_rls_initplan_consolidatie
-- (geregistreerd) en 20260721150100_perf_rls_consolidate_longtail (geregistreerd
-- onder apply-tijdstempel 20260721211306). Bouwt op géén ongedraaide migratie.
--
-- RLS-DEKKING VAN DE NIEUWE KOLOMMEN (additieve kolom = expliciete check)
-- Geen policywijziging. Gemeten tegen pg_policies, 13-09-2026:
--   * questionnaire_questions SELECT "authenticated_read_questions"
--     (authenticated, using true) — de nieuwe kolommen zijn net als
--     question_text leesbaar voor elke ingelogde gebruiker. Het zijn
--     vraagdefinities, geen persoonsgegevens.
--   * questionnaire_questions INSERT/UPDATE/DELETE "questionnaire_questions
--     admin insert|update|delete" — alleen service_role of superadmin. Het
--     bedoelde schrijfpad is de beheer-route onder app/api/admin/questionnaires.
--   * questionnaires "questionnaires select" (is_active = true OR service_role
--     OR superadmin) — de nieuwe default false houdt een nieuwe lijst dus
--     automatisch buiten beeld tot beheer hem activeert.
--   * questionnaire_responses "questionnaire_responses access" (ALL: service_role,
--     superadmin of eigen sessie) — ongewijzigd; de nieuwe CHECKs begrenzen
--     alleen wat daarbinnen geschreven mag worden.
--
-- TERUGWEG
-- Er is geen down-migratie; herstel gaat via een nieuwe correctiemigratie die:
--   * de type-CHECK terugzet naar ('open','scale','multiple_choice') — pas NA
--     het omzetten of verwijderen van yes_no/ranking-vragen, anders faalt hij;
--   * de answer_scale-CHECK terugzet naar 1..10 — pas na het corrigeren van
--     antwoorden met waarde 0;
--   * de vier nieuwe CHECKs dropt en `scale_min`, `scale_max`, `allow_other`
--     dropt (verlies van die instellingen, geen verlies van antwoorden);
--   * `questionnaires.is_active` weer `default true` geeft.
-- ============================================================================

-- ── 1 + 2. questionnaire_questions ──────────────────────────────────────────
alter table public.questionnaire_questions
  add column if not exists is_multi_select boolean not null default false,
  add column if not exists scale_min smallint not null default 1,
  add column if not exists scale_max smallint not null default 10,
  add column if not exists allow_other boolean not null default false;

alter table public.questionnaire_questions
  drop constraint if exists questionnaire_questions_type_check,
  drop constraint if exists questionnaire_questions_scale_range_check,
  drop constraint if exists questionnaire_questions_options_array_check;

alter table public.questionnaire_questions
  add constraint questionnaire_questions_type_check
    check (type in ('open', 'scale', 'multiple_choice', 'yes_no', 'ranking')),
  add constraint questionnaire_questions_scale_range_check
    check (scale_min in (0, 1) and scale_max between 2 and 10 and scale_min < scale_max),
  add constraint questionnaire_questions_options_array_check
    check (options is null or jsonb_typeof(options) = 'array');

comment on column public.questionnaire_questions.scale_min is
  'Ondergrens van een schaalvraag: 0 of 1. Alleen betekenisvol bij type = scale.';
comment on column public.questionnaire_questions.scale_max is
  'Bovengrens van een schaalvraag: 2 t/m 10, groter dan scale_min. Alleen betekenisvol bij type = scale.';
comment on column public.questionnaire_questions.allow_other is
  'Meerkeuze: toon een vrije "anders, namelijk"-optie. Het antwoord landt in questionnaire_responses.answer_text.';

-- ── 3 + 4. questionnaire_responses ──────────────────────────────────────────
alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_answer_scale_check,
  drop constraint if exists questionnaire_responses_answer_text_length_check,
  drop constraint if exists questionnaire_responses_answer_choice_length_check;

alter table public.questionnaire_responses
  add constraint questionnaire_responses_answer_scale_check
    check (answer_scale between 0 and 10),
  add constraint questionnaire_responses_answer_text_length_check
    check (answer_text is null or char_length(answer_text) <= 2000),
  add constraint questionnaire_responses_answer_choice_length_check
    check (answer_choice is null or char_length(answer_choice) <= 12000);

-- ── 5. questionnaires.is_active — alleen de default ─────────────────────────
alter table public.questionnaires
  alter column is_active set default false;
