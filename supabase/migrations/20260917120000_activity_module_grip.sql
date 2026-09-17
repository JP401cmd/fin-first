-- App-deel `grip` toegevoegd aan de gesloten lijst van user_activity_modules.
-- ADR 0147 fase 2 (waardestromen), op de grens van ADR 0146 "Beheer ziet
-- gebruik, geen inhoud". Onderdeel van /beheer/gebruik (eigenaarsbesluit
-- 17-09-2026).
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- `grip` = de drie oppervlakken waar een gebruiker grip op zijn keuzes zoekt:
-- `/overzicht/tips`, `/overzicht/belasting/optimizer` en `/rapportages/benchmark`.
-- Tot nu toe telden die mee onder `overzicht`, `belasting` en `rapportages`; vanaf
-- de uitrol schrijft de tracker ze als `grip` (langste voorvoegsel wint in
-- `VOORVOEGSELS`, lib/activity/modules.ts). De standaardindeling van de
-- waardestromen krijgt een vijfde stroom `{ id: 'grip', modules: ['grip'] }`.
--
-- GEEN BACKFILL. Bestaande rijen blijven staan zoals ze zijn geschreven: welke
-- route een oude `overzicht`-dag voedde is niet vastgelegd (en hoort ook niet
-- vastgelegd te zijn — geen route-log), dus herschrijven zou gokken. De meting
-- van `grip` begint op de uitroldag.
--
-- De lijst blijft GESLOTEN (zie de kop van 20260915140000): één sleutel erbij,
-- geen vrije tekst. Dezelfde 12 sleutels staan in `ACTIVITY_MODULES`
-- (lib/activity/modules.ts), in de zod-enum van POST /api/activity/module en in
-- de validatie van `admin_gebruik_analyse()` (20260917121000) — in één PR.
--
-- ── Toegangsmodel / RLS-dekking ───────────────────────────────────────────────
-- Ongewijzigd. Er komt geen kolom en geen policy bij; alleen de waardeverzameling
-- van `module` wordt één groter. De bestaande eigen-rij policies (INSERT alleen
-- vandaag, SELECT, DELETE — alle `TO authenticated`, `user_id = auth.uid()`)
-- dekken `grip`-rijen precies zoals elke andere sleutel. Schrijfpad blijft
-- uitsluitend POST /api/activity/module met de sessie-client.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Vóór (of gelijk met) de code die `grip` schrijft. Code vóór migratie is
-- tolerant: de tracker slikt de 23514 en `grip`-dagen gaan dan verloren tot de
-- uitrol, er breekt niets. Deze migratie vóór de code is volledig veilig (de
-- sleutel wordt dan nog niet geschreven).
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Vooruit-correctie (nooit deze migratie bewerken):
--   delete from public.user_activity_modules where module = 'grip';
--   alter table public.user_activity_modules drop constraint user_activity_modules_module_check;
--   alter table public.user_activity_modules add constraint user_activity_modules_module_check
--     check (module in ('overzicht','bezittingen','schulden','budget','belasting','toekomst',
--                       'rapportages','berichten','nieuws','mijn','fin'));
-- — pas nadat `grip` uit ACTIVITY_MODULES, de route-enum, de waardestromen en
-- de functievalidatie is verwijderd.
--
-- ── LEAK-CHECK ────────────────────────────────────────────────────────────────
-- Ongewijzigd t.o.v. 20260915140000, plus:
--   * authenticated A insert eigen rij met module = 'grip'   → ok (1 rij)
--   * authenticated A insert met module = '/overzicht/tips'  → 23514 (CHECK)
--   * anon insert module = 'grip'                            → 42501
--
-- ── Live gemeten vóór schrijven (17-09-2026, read-only via execute_sql) ───────
--   * `list_migrations`: laatst toegepast = 20260916120000 (fire_no_deficit_loan);
--     alle repobestanden t/m die versie staan geregistreerd, geen 20260917*.
--   * `to_regclass('public.user_activity_modules')` bestaat (enkele tientallen
--     rijen, eerste dag 2026-09-15).
--   * `pg_constraint` user_activity_modules_module_check =
--     CHECK ((module = ANY (ARRAY['overzicht', 'bezittingen', 'schulden', 'budget',
--     'belasting', 'toekomst', 'rapportages', 'berichten', 'nieuws', 'mijn', 'fin'])))
--     — de 11 sleutels, gelijk aan het repobestand.
--   * Tabel- en kolomcomment live gelijk aan 20260915140000.

alter table public.user_activity_modules
  drop constraint if exists user_activity_modules_module_check;

alter table public.user_activity_modules
  add constraint user_activity_modules_module_check check (module in (
    'overzicht',
    'bezittingen',
    'schulden',
    'budget',
    'belasting',
    'toekomst',
    'rapportages',
    'berichten',
    'nieuws',
    'mijn',
    'fin',
    'grip'
  ));

comment on table public.user_activity_modules is
  'Eén rij per gebruiker per actieve Amsterdamse kalenderdag per app-deel (gesloten lijst van 12 '
  'sleutels incl. grip, ADR 0147 fase 2). Gebruik zonder inhoud (ADR 0146). Eigen-rij INSERT '
  '(alleen vandaag), SELECT en DELETE; beheer leest alleen geaggregeerd via '
  'admin_module_activity_counts() en admin_gebruik_analyse() met de service-role.';

comment on column public.user_activity_modules.module is
  'App-deel, exact een sleutel uit ACTIVITY_MODULES (lib/activity/modules.ts; 12 sleutels, '
  'grip sinds 17-09-2026 zonder backfill). Nooit een route.';
