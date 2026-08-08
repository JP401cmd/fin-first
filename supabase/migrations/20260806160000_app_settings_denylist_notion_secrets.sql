-- Notion-koppelsleutels afschermen op `public.app_settings` (SELECT-denylist).
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- De SELECT-policy `app_settings select` (20260721150000_perf_rls_consolidate_
-- app_settings.sql) is een DENYLIST. Haar tweede OR-tak luidt, samengevat:
--
--     key bevat GEEN uuid  AND  key <> ALL (<hardcoded lijst van 5 secrets>)
--
-- Alles wat niet in die lijst staat en geen uuid in de naam draagt is dus
-- leesbaar voor élke rol `authenticated` — een ingelogde testgebruiker kan de
-- rij gewoon via PostgREST opvragen. De lijst noemt `anthropic_api_key`,
-- `openai_api_key`, `mistral_api_key`, `truelayer_client_id` en
-- `truelayer_client_secret`. `notion_api_token` en
-- `notion_reports_data_source_id` staan er niet in.
--
-- Live geëvalueerd tegen het echte policy-predicaat (06-08-2026, vóór deze
-- migratie): beide notion-sleutels → `true`, `anthropic_api_key` → `false`.
-- Het waren dus geen theoretische leken maar bewezen leesbare sleutels.
--
-- ── Waarom dit tot nu toe geen datalek was ────────────────────────────────────
-- Beide rijen BESTONDEN nog niet op het moment van deze migratie (gemeten:
-- `select … from public.app_settings where key like 'notion%'` → 0 rijen,
-- 06-08-2026). De koppeling is nog niet ingericht, dus er is nooit een token
-- geweest om te lekken. Het lek zou zijn ONTSTAAN op het moment dat iemand het
-- token invult — precies waarom deze migratie vóór die inrichting moet staan en
-- niet erna. Geen meldplicht-traject nodig; wel een harde volgorde-eis:
-- EERST deze migratie, DAARNA pas `notion_api_token` zetten.
--
-- ── Wat deze migratie WEL doet, en wat bewust NIET ────────────────────────────
-- WEL: de twee sleutels aan de denylist toevoegen. De policy wordt integraal
-- opnieuw aangemaakt (drop + create, het huispatroon uit 20260721150000) omdat
-- het predicaat één samengevoegde expressie is. De drie ándere OR-takken zijn
-- LETTERLIJK overgenomen uit het live predicaat (`pg_get_expr(polqual)`,
-- 06-08-2026) — deze migratie wijzigt uitsluitend de denylist-tak, en niets aan
-- de own-key-, checkin-huishouden- of superadmin-toegang.
--
-- NIET: de denylist omzetten naar een ALLOWLIST. Dát is de structurele
-- oplossing — een fail-open denylist maakt élk nieuw secret standaard leesbaar
-- tot iemand eraan denkt het toe te voegen, en dit is nu de TWEEDE keer dat dat
-- met de hand moet (eerst TrueLayer, nu Notion). Die omzetting raakt elke lezer
-- van `app_settings` en is een eigen beslissing met een eigen migratie; ze is
-- als aandachtspunt vastgelegd in lib/architecture/archimate-concerns.ts en
-- bewust niet hier meegenomen.
--
-- ── Eén stap verder dan de twee namen: het hele `notion_`-voorvoegsel ─────────
-- Naast de twee literalen sluit deze migratie ook `notion\_%` als geheel uit.
-- Motivering: elke sleutel van deze koppeling is server-only (het token, de
-- data source; wat er later ook bij komt) — er bestaat geen `notion_`-instelling
-- die de browser hoort te kunnen lezen. Zonder die regel is de volgende
-- notion-sleutel opnieuw standaard leesbaar en moet er opnieuw een migratie aan
-- te pas komen. De twee namen blijven daarnáást expliciet in de array staan: die
-- lijst is de vindplaats waar iemand gaat kijken ("welke secrets zijn
-- afgeschermd?") en spiegelt hoe TrueLayer er staat.
-- Het risico van de prefix-regel is fail-CLOSED: zou iemand ooit een bewust
-- publieke `notion_`-instelling willen, dan merkt hij dat meteen (leest niet) in
-- plaats van dat een secret stil meelekt.
--
-- LIKE-escape: `'notion\_%'` — de backslash escapet het underscore-jokerteken,
-- zodat dit letterlijk "begint met notion_" betekent en niet "notion" + één
-- willekeurig teken. Zelfde vorm als de bestaande `checkin_household_…\_%`-tak.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Deze migratie mag ruim vóór een code-deploy: ze raakt geen tabel, kolom of
-- functie en wijzigt uitsluitend leesrechten in de STRENGERE richting. De
-- server-side lezer (`lib/user-reports/notion.ts#getNotionCredentials`) gaat via
-- de service-role-client, en die heeft BYPASSRLS — die leest dus onveranderd
-- door. Er is geen client-side lezer van deze sleutels.
--
-- Idempotent (drop policy if exists + create): re-apply is een no-op.

drop policy if exists "app_settings select" on public.app_settings;

create policy "app_settings select" on public.app_settings
  for select to authenticated
  using (
    -- 1. Eigen per-user key (de key draagt de uuid van de gebruiker).
    position((select auth.uid())::text in key) > 0
    -- 2. Globale, niet-geheime instellingen. DIT is de denylist-tak.
    or (
      key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      and key <> all (array[
        'anthropic_api_key',
        'openai_api_key',
        'mistral_api_key',
        'truelayer_client_id',
        'truelayer_client_secret',
        -- Nieuw: de Notion-koppeling (meldingen van testgebruikers).
        'notion_api_token',
        'notion_reports_data_source_id'
      ])
      -- En alles wat er in de toekomst nog bij komt onder hetzelfde voorvoegsel.
      and key not like 'notion\_%'
    )
    -- 3. Check-ins van het eigen huishouden.
    or (
      user_household_id() is not null
      and key like ('checkin_household_' || (user_household_id())::text || '\_%')
    )
    -- 4. Superadmin leest alles.
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'
    )
  );
