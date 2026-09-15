-- Vragenlijsten — uitnodiging + promptstaat per (lijst, gebruiker). ADR 0147.
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Twee dingen die per gebruiker per lijst bijgehouden moeten worden, en die geen
-- plaats hebben in `questionnaire_sessions` (die begint pas bij het invullen):
--   1. DE PROMPTSTAAT — is de uitnodiging getoond, uitgesteld ("later"), of
--      weggeklikt, en hoe vaak. Zonder deze staat blijft een popup elke lading
--      terugkomen, of verdwijnt hij juist voorgoed op één apparaat (localStorage).
--   2. DE PERSOONSGEBONDEN TOEWIJZING — een lijst die beheer handmatig of per groep
--      aan iemand toewijst. Die toewijzing kán niet uit `questionnaires.verspreiding`
--      komen: die kolom is leesbaar voor elke ingelogde gebruiker en mag daarom
--      geen id's bevatten (zie 20260915130000).
--
-- WAT DEZE TABEL NIET IS: de bron van zichtbaarheid voor REGEL-lijsten. Of een
-- regel-verspreide lijst voor jou geldt, wordt compute-on-read bepaald in
-- GET /api/questionnaires door de regels uit `questionnaires.verspreiding` tegen je
-- eigen profiel te houden. Een rij met `bron = 'regel'` is niet meer dan de BEVROREN
-- MATCH (welke regel raakte, op welk moment) plus de promptstaat. Dat is precies
-- waarom de eigenaar zo'n rij zelf mag inserten: hij wint er niets mee. Geeft een
-- gebruiker zichzelf een `bron='regel'`-rij voor een lijst waar hij niet voor in
-- aanmerking komt, dan verandert dat aan zijn zichtbaarheid niets — de route
-- herberekent de match en de invulgrenzen uit 20260913130000 (actieve lijst, eigen
-- open sessie) blijven onverkort gelden. `bron='handmatig'` en `bron='groep'`
-- daarentegen KENNEN wél toe, en die twee kan de gebruiker daarom niet zelf schrijven:
-- alleen de service-role.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- PERSOONLIJK, geen huishouddeling. Alle policies `to authenticated`, met
-- `(select auth.uid())` / `(select auth.role())` in initplan-vorm en een
-- service_role-tak voor symmetrie met de consolidatie-migraties (service_role heeft
-- BYPASSRLS en raakt policies feitelijk niet).
--
--   SELECT  — eigen rij, of service_role. GEEN superadmin-tak. Beheer leest deze
--             tabel uitsluitend via de service-role (ADR 0006/0146): een RLS-tak voor
--             superadmins zou hier hetzelfde browser-leespad openen dat ADR 0146 op
--             `app_settings` en `user_activity_days` juist dichthoudt. Let op dat dit
--             AFWIJKT van de oudere vragenlijst-tabellen (sessions/responses/questions
--             hebben nog wél een superadmin-tak, gemeten 15-09-2026): die zijn van
--             vóór ADR 0146 en worden hier bewust niet gekopieerd.
--   INSERT  — alleen de eigen, schone regel-rij: `user_id = auth.uid()`,
--             `bron = 'regel'`, promptstaat op de begintoestand (shown_at,
--             snoozed_until, dismissed_at NULL en dismiss_count 0) en de lijst moet
--             ACTIEF zijn. De promptstaat-eisen zijn geen formaliteit: zonder hen kon
--             een gebruiker een rij inserten die al "weggeklikt" heet, of met
--             dismiss_count vooraf vol — onderzoeksmeta vervuilen zonder ooit iets te
--             zien. Handmatig/groep alleen via de service-role.
--   UPDATE  — USING en WITH CHECK allebei "eigen rij". De echte grens zit in het
--             KOLOMRECHT hieronder, niet in het predicaat.
--   DELETE  — GEEN policy voor authenticated. Motivering: de rij is tegelijk
--             onderzoeksmeta (is deze uitnodiging aangekomen? hoe vaak weggeklikt?)
--             én een toewijzing die beheer deed. Kon de gebruiker hem wissen, dan
--             wist hij daarmee een handmatige toewijzing weg en kreeg hij de popup
--             opnieuw — precies het tegenovergestelde van wat wegklikken betekent.
--             Wie de uitnodiging definitief niet meer wil, zet de promptstaat op
--             'niet_meer' (dismissed_at + dismiss_count) en is er vanaf. Wissen
--             gebeurt door de service-role in `deleteAllUserData` en door de
--             FK-cascade bij accountverwijdering; RI-acties omzeilen RLS.
--
-- anon: geen enkele policy staat `to anon` open, én de tabelgrant wordt ingetrokken.
--
-- LEAK-CHECK — BEWUSTE AFWIJKING van het huiscontract "anon: 0 rijen én géén fout",
-- identiek aan 20260915121000 (user_activity_days): omdat anon hier géén tabelgrant
-- heeft, is het VERWACHTE resultaat voor anon een 42501 (permission denied), geen
-- lege set. Dat is least privilege, geen rolset-regressie. Een leak-test op deze
-- tabel hoort 42501 te asserten voor anon, en 0 rijen (geen fout) voor een
-- ingelogde gebruiker die de rij van een ánder opvraagt.
--
-- ── Kolomrecht (waarom RLS hier niet genoeg is) ───────────────────────────────
-- RLS ziet in WITH CHECK alleen de NIEUWE rij, nooit de oude. Een UPDATE-policy met
-- "eigen rij" laat daarom toe dat de eigenaar zijn eigen rij VERHANGT: questionnaire_id
-- naar een andere lijst (en zo een handmatige toewijzing verplaatst), bron van
-- 'regel' naar 'handmatig' (en zo een toewijzing fabriceert die beheer nooit deed),
-- invited_at backdaten, of bron_detail met een verzonnen regel-match vullen. Alle
-- vier blijven "eigen rij" en komen dus ongehinderd door WITH CHECK. Daarom verliest
-- authenticated het tabel-brede UPDATE-recht en krijgt hij alleen de vier
-- promptstaat-kolommen terug. Dit is hetzelfde patroon als
-- `grant update (completed_at)` op questionnaire_sessions (20260913130000, live
-- geverifieerd via information_schema.column_privileges, 15-09-2026).
-- LET OP bij een toekomstige kolom die de gebruiker wél moet kunnen zetten: die
-- heeft een eigen `grant update (kolom)` nodig, anders faalt de schrijfactie met 42501.
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
--   GET   /api/questionnaires                       sessie-client — insert van de
--         eigen `bron='regel'`-rij op het moment dat een regel voor het eerst matcht,
--         plus select van de eigen rijen om de promptstaat te bepalen.
--   PATCH /api/questionnaires/[id]/uitnodiging      sessie-client — update van
--         uitsluitend shown_at / snoozed_until / dismissed_at / dismiss_count.
--   PUT   /api/admin/questionnaires/[id]/verspreiding  SERVICE-ROLE — insert en
--         delete van `bron='handmatig'` (en 'groep') rijen; dit is het enige pad dat
--         toewijst, en het enige pad dat rijen van ánderen aanraakt.
--   lib/seed-persona.ts#deleteAllUserData           SERVICE-ROLE — wis bij reset en
--         accountverwijdering.
-- Geen ander pad schrijft deze tabel.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Persoonsgegeven (user_id + gedrag). Wordt door de orchestrator ingedeeld in
-- lib/user-data-tables.ts als SERVICE_WIPE_TABLES — bewust niet SESSION_WIPE, want er
-- is geen eigen-rij DELETE-policy — en in lib/seed-persona.ts. FK op auth.users met
-- ON DELETE CASCADE, dus bij accountverwijdering blijft er hoe dan ook niets achter.
-- Eigen-rij SELECT dekt de AVG-zelfexport (art. 15/20) via de sessie-client.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Nieuwe tabel, niets bestaands geraakt: mag vóór de code. Zolang de code er nog
-- niet is, blijft de tabel leeg en verandert er niets aan het gedrag van de app.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie met `drop table public.questionnaire_invitations;` — pas nadat de
-- routes hierboven en de regels in lib/user-data-tables.ts / lib/seed-persona.ts zijn
-- verwijderd (anders faalt de wisroutine op een ontbrekende relatie).
--
-- ── Live gemeten vóór schrijven (15-09-2026) ──────────────────────────────────
--   * `mcp list_migrations`: laatst toegepaste versie = 20260913160000. De migraties
--     20260915120000 / 121000 / 122000 staan in de repo maar zijn NIET toegepast.
--     Deze migratie bouwt daar dus NIET op voort — alleen op de live vragenlijsttabellen
--     (`questionnaires` + de policies uit 20260913130000, die wél live zijn).
--   * `to_regclass('public.questionnaire_invitations')` = NULL: de tabel bestaat nog niet.
--   * `pg_policies` op questionnaires: "questionnaires select" to authenticated
--     USING (is_active OR service_role OR superadmin) + admin insert/update/delete —
--     de `exists (... q.is_active)`-subquery hieronder draait dus binnen die RLS en
--     ziet actieve lijsten hoe dan ook.
--   * `pg_policies` op questionnaire_sessions: de vier gesplitste policies uit
--     20260913130000 staan live (select/insert/update/delete, alle to authenticated),
--     elk met een superadmin-tak. Bewust niet gekopieerd — zie Toegangsmodel.
--   * `information_schema.column_privileges`: authenticated heeft op
--     questionnaire_sessions géén tabel-breed UPDATE meer, alleen UPDATE(completed_at).
--     Het kolomrecht-patroon werkt dus in deze database zoals bedoeld.

create table if not exists public.questionnaire_invitations (
  questionnaire_id uuid        not null references public.questionnaires(id) on delete cascade,
  user_id          uuid        not null references auth.users(id)           on delete cascade,
  -- Hoe deze uitnodiging ontstond. 'regel' = automatisch gematcht op de
  -- verspreidingsregels; 'handmatig' = beheer wees deze persoon aan; 'groep' = beheer
  -- wees een groep aan waar deze persoon in zat.
  bron             text        not null check (bron in ('regel', 'handmatig', 'groep')),
  -- Bevroren context bij het ontstaan: welke regel matchte (regel), welke groep
  -- (groep), of welk e-mailadres beheer intypte (handmatig). Bevroren, zodat later
  -- nog te herleiden is waaróm iemand deze lijst kreeg, ook als de regel intussen is
  -- gewijzigd.
  bron_detail      jsonb,
  invited_at       timestamptz not null default now(),
  -- Promptstaat. De enige vier kolommen die de gebruiker zelf mag schrijven.
  shown_at         timestamptz,
  snoozed_until    timestamptz,
  dismissed_at     timestamptz,
  dismiss_count    integer     not null default 0 check (dismiss_count between 0 and 10),
  primary key (questionnaire_id, user_id)
);

comment on table public.questionnaire_invitations is
  'Uitnodiging + promptstaat per (vragenlijst, gebruiker) — ADR 0147. Eigen-rij SELECT, '
  'eigen-rij INSERT alleen voor een schone bron=''regel''-rij op een actieve lijst, '
  'eigen-rij UPDATE beperkt tot de vier promptstaat-kolommen (kolomrecht), geen DELETE '
  'voor authenticated. Beheer leest en wijst toe via de service-role (ADR 0006/0146). '
  'Zichtbaarheid van regel-lijsten komt NIET uit deze tabel maar compute-on-read uit '
  'questionnaires.verspreiding.';

comment on column public.questionnaire_invitations.bron is
  '''regel'' = automatisch gematcht (mag de gebruiker zelf inserten, wint er niets mee); '
  '''handmatig''/''groep'' = toewijzing door beheer, uitsluitend via de service-role.';

comment on column public.questionnaire_invitations.bron_detail is
  'Bevroren context bij het ontstaan: de regel-match, het groep-id of het e-mailadres '
  'dat beheer invoerde. Naslag, geen invoer voor de zichtbaarheidsberekening.';

-- De PK (questionnaire_id, user_id) dekt lookups per lijst; de lees-hotpath is
-- andersom: "alle uitnodigingen van DEZE gebruiker" in GET /api/questionnaires.
create index if not exists questionnaire_invitations_user_id_idx
  on public.questionnaire_invitations (user_id);

alter table public.questionnaire_invitations enable row level security;

-- Least privilege op grant-niveau. Supabase geeft nieuwe tabellen standaard ALL aan
-- anon en authenticated; anon heeft hier niets te zoeken. Zie de LEAK-CHECK in de kop:
-- voor anon is 42501 het verwachte resultaat, geen lege set.
revoke all on table public.questionnaire_invitations from anon;
revoke truncate, references, trigger on table public.questionnaire_invitations from authenticated;

-- DELETE bewust niet gegrant: er is geen DELETE-policy voor authenticated, en zonder
-- grant geeft een poging een 42501 in plaats van een stille nul rijen.
revoke delete on table public.questionnaire_invitations from authenticated;

-- ── SELECT — eigen rij, geen superadmin-tak (ADR 0146/0006) ──────────────────
drop policy if exists "questionnaire_invitations select" on public.questionnaire_invitations;
create policy "questionnaire_invitations select" on public.questionnaire_invitations
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or user_id = (select auth.uid())
  );

-- ── INSERT — alleen de eigen, schone regel-rij op een actieve lijst ──────────
drop policy if exists "questionnaire_invitations insert" on public.questionnaire_invitations;
create policy "questionnaire_invitations insert" on public.questionnaire_invitations
  for insert to authenticated
  with check (
    (select auth.role()) = 'service_role'
    or (
      user_id = (select auth.uid())
      and bron = 'regel'
      and shown_at is null
      and dismissed_at is null
      and snoozed_until is null
      and dismiss_count = 0
      and exists (
        select 1 from public.questionnaires q
        where q.id = questionnaire_invitations.questionnaire_id
          and q.is_active = true
      )
    )
  );

-- ── UPDATE — eigen rij; de echte grens is het kolomrecht hieronder ───────────
drop policy if exists "questionnaire_invitations update" on public.questionnaire_invitations;
create policy "questionnaire_invitations update" on public.questionnaire_invitations
  for update to authenticated
  using (
    (select auth.role()) = 'service_role'
    or user_id = (select auth.uid())
  )
  with check (
    (select auth.role()) = 'service_role'
    or user_id = (select auth.uid())
  );

-- Kolomrecht: RLS ziet de oude rij niet in WITH CHECK, dus zonder dit kon de eigenaar
-- zijn rij verhangen naar een andere lijst, bron naar 'handmatig' zetten (een
-- toewijzing fabriceren die beheer nooit deed), invited_at backdaten of bron_detail
-- vervalsen. Alleen de promptstaat is een gebruikersschrijfactie.
revoke update on public.questionnaire_invitations from authenticated;
grant update (shown_at, snoozed_until, dismissed_at, dismiss_count)
  on public.questionnaire_invitations to authenticated;

-- ── DELETE — geen policy voor authenticated (bewust) ─────────────────────────
-- Wissen loopt via de service-role (deleteAllUserData) en de FK-cascade vanaf
-- auth.users / questionnaires. Zie de motivering in de kop: de rij is onderzoeksmeta
-- én toewijzing; definitief stoppen doet de gebruiker met 'niet_meer' (promptstaat),
-- niet door het bewijs van de uitnodiging te verwijderen.
