-- Superadmin leest op `public.app_settings` geen per-gebruiker-sleutels meer.
-- Eigenaarsbesluit 14/15-09-2026, vastgelegd als ADR 0146 "Beheer ziet gebruik,
-- geen inhoud".
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- De SELECT-policy `app_settings select` heeft vier OR-takken. De vierde luidt
-- "superadmin leest alles": een EXISTS op `profiles.role = 'superadmin'` zonder
-- enige beperking op de sleutel. `app_settings` is echter geen zuivere
-- configuratietabel — hij draagt ook per-gebruiker-sleutels met de uuid van de
-- gebruiker in de naam. Live geteld (15-09-2026, `select … from app_settings`,
-- alleen sleutelpatronen, geen waarden): 66 sleutels mét uuid tegen 28 zonder.
-- Daaronder:
--
--   checkin_snapshot_<uid>_<YYYY-MM>   netWorth, inkomen, uitgaven en de
--                                      vrije reflectietekst van de maand-check-in
--                                      (app/api/checkin/save/route.ts)
--   checkin_household_<hh>_<uid>_…     dezelfde snapshot, huishoudkopie
--   notifications_history_<uid>        meldingen, incl. bedragen en partneracties
--   whatif_scenarios:<uid>             eigen wat-als-scenario's
--   news_cache:<uid>, monthly_checkin_<uid>, last_sovereignty_level_<uid>, …
--
-- Elke superadmin kon die rijen met de gewone browser-client (anon-key + eigen
-- JWT) via PostgREST opvragen — geen service-role, geen audit-log, geen route
-- nodig. Eén bestaande route deed het bovendien al impliciet:
-- `GET /api/admin/settings` doet `select('key, value')` zonder filter op de
-- sessie-client en stuurde dus de check-in-snapshots van álle gebruikers mee in
-- het JSON-antwoord naar het beheerscherm.
--
-- ── Wat deze migratie WEL doet ────────────────────────────────────────────────
-- Tak 4 wordt versmald tot sleutels ZONDER uuid in de naam: globale
-- configuratie, inclusief de secrets die tak 2 bewust uitsluit
-- (`anthropic_api_key`, `truelayer_client_secret`, `notion_…`). Die blijven voor
-- de superadmin leesbaar via de sessie-client, omdat beheer-routes ze zo lezen
-- (o.a. `GET /api/admin/settings` maskeert ze na het lezen) en een upsert met
-- ON CONFLICT DO UPDATE (`PUT /api/admin/settings`) de bestaande rij via de
-- SELECT-policy moet kunnen zien.
--
-- De uuid-regex is LETTERLIJK dezelfde als in tak 2 — bewust: "wat is een
-- per-gebruiker-sleutel" is dan op één manier gedefinieerd, en tak 2 en tak 4
-- kunnen niet uit elkaar lopen over wat globaal heet.
--
-- Takken 1, 2 en 3 zijn LETTERLIJK overgenomen uit het live predicaat
-- (`pg_get_expr(polqual, polrelid)` op `pg_policy`, gemeten 15-09-2026), niet
-- uit een migratiebestand. Ook de initplan-wrappers staan zoals live:
-- `(select auth.uid())` en `(select public.user_household_id())` — die laatste
-- is sinds 20260810220000 gewikkeld; 20260806160000 toont nog de kale vorm en
-- is voor dit predicaat dus niet de actuele bron. Tak 4 behoudt de live
-- EXISTS-vorm op `profiles` (geen omzetting naar `is_superadmin()`), zodat de
-- enige inhoudelijke wijziging de toegevoegde sleutelvoorwaarde is.
--
-- ── Wat deze migratie bewust NIET doet ────────────────────────────────────────
-- - De INSERT-, UPDATE- en DELETE-policies op `app_settings` houden hun
--   superadmin-tak. Dat zijn schrijfrechten, geen leesrechten; ze vallen buiten
--   "beheer ziet geen inhoud". Praktisch gevolg: een UPDATE of DELETE met een
--   WHERE op een ándermans uuid-sleutel treft via de sessie-client nu 0 rijen,
--   omdat Postgres voor zo'n WHERE óók de SELECT-policy toepast. Een blinde
--   INSERT van een ándermans sleutel blijft mogelijk. Beide zijn integriteit,
--   geen inzage, en horen bij een eigen besluit.
-- - Geen omzetting van de denylist in tak 2 naar een allowlist (open
--   aandachtspunt in lib/architecture/archimate-concerns.ts, sinds 20260806160000).
-- - Service-role-lezers (`getServiceClient()`, BYPASSRLS) zijn per definitie
--   onaangetast: de retentie-, notificatie- en cron-paden die ándermans sleutels
--   lezen of schrijven (`app/api/ai/actions/[id]/route.ts`, de briefing-cron)
--   blijven werken. Of beheer dáár nog inhoud ziet, is een applicatievraag die
--   ADR 0146 in de routes regelt, niet in RLS.
--
-- ── Geraakte sessie-client-lezers (gecontroleerd 15-09-2026) ──────────────────
-- Geen enkel beheerpad leest via de sessie-client een uuid-sleutel van een
-- ándere gebruiker. `app/api/admin/checkins` leest alleen de eigen sleutels
-- (tak 1). Twee NIET-beheer-routes lezen wél ándermans sleutel via de
-- sessie-client, als fallback: `household_privacy:<partner-uid>` in
-- `app/api/household/data/route.ts` en `app/api/household/partner-privacy/
-- route.ts`. Die fallback gaf al alleen resultaat voor een superadmin (voor een
-- gewone gebruiker vangen takken 1-3 die sleutel niet); na deze migratie krijgt
-- de superadmin hetzelfde als iedereen: de standaard-privacy. Live: 0 rijen
-- `household_privacy:%` en 0 rijen in `household_members` (15-09-2026), dus
-- vandaag geen waarneembaar verschil.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Strenger dan nu en raakt geen tabel, kolom of functie: mag VÓÓR de
-- code-deploy. Idempotent (drop policy if exists + create).
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Een correctiemigratie die de policy opnieuw aanmaakt met tak 4 zonder de
-- sleutelvoorwaarde (de EXISTS-tak zoals hieronder, minus de `key !~*`-regel).
-- Nooit deze migratie zelf aanpassen. Terugdraaien heropent de inzage in
-- check-in-snapshots en hoort dus een expliciet besluit tegen ADR 0146 in te zijn.

drop policy if exists "app_settings select" on public.app_settings;

create policy "app_settings select" on public.app_settings
  for select to authenticated
  using (
    -- 1. Eigen per-user key (de key draagt de uuid van de gebruiker).
    (position(((select auth.uid())::text) in key) > 0)
    -- 2. Globale, niet-geheime instellingen (denylist-tak, ongewijzigd).
    or (
      (key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'::text)
      and (key <> all (array[
        'anthropic_api_key'::text, 'openai_api_key'::text, 'mistral_api_key'::text,
        'truelayer_client_id'::text, 'truelayer_client_secret'::text,
        'notion_api_token'::text, 'notion_reports_data_source_id'::text
      ]))
      and (key !~~ 'notion\_%'::text)
    )
    -- 3. Check-ins van het eigen huishouden (ongewijzigd).
    or (
      ((select public.user_household_id()) is not null)
      and (key ~~ (('checkin_household_'::text || ((select public.user_household_id()))::text) || '\_%'::text))
    )
    -- 4. Superadmin leest globale sleutels, ook de secrets die tak 2 uitsluit —
    --    maar NOOIT een sleutel met een uuid erin (ADR 0146). De eigen
    --    per-user-sleutels van de superadmin vallen al onder tak 1.
    or (
      (key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'::text)
      and (exists (
        select 1 from public.profiles
        where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'::text
      ))
    )
  );
