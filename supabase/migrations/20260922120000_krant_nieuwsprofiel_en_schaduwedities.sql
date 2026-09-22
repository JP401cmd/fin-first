-- Krant 1B fase 2: het nieuwsprofiel en de schaduweditie in eigen tabellen (ADR 0173).
-- Eigenaarsbesluiten 21-09-2026: keuze 8 (EIGEN tabellen — `news_editions` en
-- haar vijf lezers blijven onaangeraakt tot 1C), B2 (alleen euro's), B4
-- (automatisch vrijgeven, achteraf terugtrekken → `vervangen_door`), B8
-- (profiel afgeleid uit eigen data; woonplan en rubrieken vult de gebruiker
-- zelf), B10 (het AI-pad blijft: geen bestaande tabel geraakt).
--
-- ── Lineage ───────────────────────────────────────────────────────────────────
-- Bouwt op `news_articles.duiding` / `duiding_status` uit
-- 20260921120000_news_articles_duiding (live sinds release 0.92.0, 22-09-2026)
-- en op `profiles(id)`. Geen andere ongedraaide voorganger.
--
-- ── Drie tabellen ─────────────────────────────────────────────────────────────
-- nieuwsprofiel        — één rij per gebruiker: de dertien profielvelden van
--                        lib/krant/profiel-velden.ts in BANDEN (geen bedragen,
--                        geen namen, geen partnerdata), plus per veld de
--                        herkomst ('zelf' | 'afgeleid'). NULL = "weet ik niet".
--                        De weekcron leidt de afgeleide velden elke run opnieuw
--                        af uit de eigen data (herleiden, niet ophogen) en
--                        overschrijft nooit een 'zelf'-waarde.
-- krant_edities        — de editie die de matcher (ADR 0172) voor één lezer
--                        en één ISO-week bouwde. `bron` = schaduw (K1) | live
--                        (vanaf 1C); `met_ai` = false voor de matcher-editie,
--                        true voor de latere AI-laag (1E, B22). Een lege editie
--                        is een geldige rij (`leeg = true`, geen items).
--                        `profiel_snapshot` = de bandwaarden van dat moment —
--                        de audit van "waarom zie ik dit?" (welke banden
--                        gaven deze regel); de herberekening (B4) leest 'm
--                        NIET maar leidt het profiel opnieuw af (verse run).
-- krant_editie_items   — de regels van een editie. `article_id` wijst naar het
--                        artikel (on delete set null: het archief blijft
--                        leesbaar via `snapshot` nadat de ingest het artikel
--                        na 120 dagen opruimt). `slots` en `impact` dragen
--                        alleen banden en bedragen in euro's (B2).
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- PERSOONLIJK, geen huishouddeling — óók niet op nieuwsprofiel, hoewel
-- `assets` huishoud-gedeeld is: het profiel is een lezing van de EIGEN situatie
-- (B1: eigen inkomen, eigen spaargeld), nooit die van de partner.
--
--   nieuwsprofiel        eigen-rij SELECT / INSERT / UPDATE / DELETE, TO
--                        authenticated. INSERT/UPDATE zijn er voor het
--                        profielscherm (2x) dat 'zelf'-waarden schrijft via
--                        een own-row read-modify-write (spiegel
--                        app/api/appearance); DELETE voor de sessie-wis
--                        (deleteAllUserData) en de AVG-route.
--   krant_edities        eigen-rij SELECT (de testsectie op /nieuws, fase 3,
--                        en de AVG-zelfexport) en eigen-rij DELETE (wis).
--                        GEEN INSERT/UPDATE-policy: alleen de service-role
--                        (weekcron, herberekening) schrijft. Een lezer kan
--                        dus nooit zelf een editie fabriceren of `bron` op
--                        'live' zetten.
--   krant_editie_items   idem: eigen-rij SELECT + DELETE, schrijven alleen
--                        service-role. `user_id` is gedenormaliseerd zodat
--                        RLS en de herberekening (artikel → item → user_id,
--                        ADR 0171 contract 7) geen join nodig hebben.
--
-- GEEN superadmin-policy. Beheer leest uitsluitend GEBRUIK (job_runs-tellingen
-- per profieltype, ADR 0146) — nooit een profiel of een editie-inhoud. De
-- itemcontrole voor de K1-poort gebeurt ingelogd als testaccount (keuze 12).
-- Alle drie de tabellen zijn inhoud en staan bewust NIET op VRIJ_LEESBAAR in
-- lib/beheer/geen-inhoud.test.ts.
--
-- Least privilege op grant-niveau (zoals 20260915121000): anon krijgt niets
-- (LEAK-CHECK: voor anon is 42501 het verwachte resultaat, geen lege set);
-- authenticated houdt precies wat de policies toestaan.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Alle drie ingedeeld in lib/user-data-tables.ts (SESSION_WIPE_TABLES → wis én
-- zelfexport) en gewist in lib/seed-persona.ts#deleteAllUserData. FK op
-- auth.users ON DELETE CASCADE: bij verwijdering van het account blijft er
-- niets achter. Retentie: geen leeftijdspurge via lib/retention.ts; de cap van
-- 26 weken per gebruiker in de cron (lib/krant/editie-schrijver.ts) is de
-- bewaarregel voor schaduwedities.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Drie nieuwe tabellen, niets bestaands geraakt: mag vóór de code. Andersom is
-- ook veilig: de cron logt een error-run naar job_runs zolang de tabellen
-- ontbreken en schrijft niets.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Append-only. Blijkt een editie fout, dan is de correctie het terugtrekken van
-- de duiding (B4) en een herberekening — geen DDL. Moet het schema terug, dan
-- een latere migratie die de drie tabellen dropt (items → edities →
-- nieuwsprofiel) — pas nadat de cron uit vercel.json is, de JobKey en de
-- registraties in lib/user-data-tables.ts / lib/seed-persona.ts weg zijn.
-- Signaal dat het misging: job_runs.summary.leeg ≈ summary.edities over alle
-- profieltypes (matcher of afleiding kapot), of `fouten` > 0 run na run.

-- ── nieuwsprofiel ─────────────────────────────────────────────────────────────

create table if not exists public.nieuwsprofiel (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  profiel_versie      smallint    not null default 1,
  geboortejaar        smallint,
  huishouden          text,
  kinderen            text,
  werk                text[],
  inkomen             text,
  wonen               text,
  hypotheek_restschuld text,
  hypotheek_rentevast text,
  woonplan            text,
  spaargeld           text,
  beleggingen         text,
  beleggingen_vorm    text[],
  schulden            text[],
  pensioen_werkgever  text,
  pensioen_lijfrente  text,
  rubrieken           text[],
  -- Per veld 'zelf' | 'afgeleid'; ontbreekt een sleutel, dan is het veld nog
  -- nooit gezet. De cron schrijft alleen velden die niet 'zelf' zijn.
  herkomst            jsonb       not null default '{}'::jsonb,
  afgeleid_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- De bandsleutels zijn het vocabulaire van lib/krant/profiel-velden.ts
  -- (DOELGROEP_SLEUTELS). NULL = onbekend is overal geldig.
  constraint nieuwsprofiel_geboortejaar_check
    check (geboortejaar is null or (geboortejaar between 1920 and 2020)),
  constraint nieuwsprofiel_huishouden_check
    check (huishouden is null or huishouden in ('alleen', 'fiscaal-partner', 'samenwonend-zonder-fiscaal-partner')),
  constraint nieuwsprofiel_kinderen_check
    check (kinderen is null or kinderen in ('geen', 'jongste-0-3', 'jongste-4-11', 'jongste-12-17', 'alleen-18-plus')),
  -- `coalesce(array_length, 0)`: array_length('{}') is NULL en zou een lege
  -- array stil door de CHECK laten; het schema (zod .min(1)) eist minstens één.
  constraint nieuwsprofiel_werk_check
    check (werk is null or (coalesce(array_length(werk, 1), 0) >= 1 and werk <@ array['loondienst', 'zelfstandig', 'dga', 'uitkering', 'pensioen', 'studie']::text[])),
  constraint nieuwsprofiel_inkomen_check
    check (inkomen is null or inkomen in ('tot-1750', '1750-2500', '2500-3250', '3250-4250', '4250-5500', 'boven-5500')),
  constraint nieuwsprofiel_wonen_check
    check (wonen is null or wonen in ('huur-sociaal', 'huur-vrije-sector', 'koop-met-hypotheek', 'koop-zonder-hypotheek', 'inwonend')),
  constraint nieuwsprofiel_hypotheek_restschuld_check
    check (hypotheek_restschuld is null or hypotheek_restschuld in ('tot-150k', '150k-300k', '300k-450k', 'boven-450k')),
  constraint nieuwsprofiel_hypotheek_rentevast_check
    check (hypotheek_rentevast is null or hypotheek_rentevast in ('tot-1-jaar', '2-5-jaar', 'boven-5-jaar', 'variabel')),
  constraint nieuwsprofiel_woonplan_check
    check (woonplan is null or woonplan in ('kopen-binnen-2-jaar', 'geen-koopplan')),
  constraint nieuwsprofiel_spaargeld_check
    check (spaargeld is null or spaargeld in ('tot-5k', '5k-25k', '25k-50k', '50k-100k', '100k-250k', 'boven-250k')),
  constraint nieuwsprofiel_beleggingen_check
    check (beleggingen is null or beleggingen in ('geen', 'tot-25k', '25k-100k', '100k-250k', 'boven-250k')),
  constraint nieuwsprofiel_beleggingen_vorm_check
    check (beleggingen_vorm is null or beleggingen_vorm <@ array['fondsen', 'aandelen', 'crypto', 'tweede-woning']::text[]),
  constraint nieuwsprofiel_schulden_check
    check (schulden is null or (coalesce(array_length(schulden, 1), 0) >= 1 and schulden <@ array['studieschuld-tot-15k', 'studieschuld-15k-40k', 'studieschuld-boven-40k', 'consumptief-krediet', 'geen']::text[])),
  constraint nieuwsprofiel_pensioen_werkgever_check
    check (pensioen_werkgever is null or pensioen_werkgever in ('ja', 'nee', 'weet-niet')),
  constraint nieuwsprofiel_pensioen_lijfrente_check
    check (pensioen_lijfrente is null or pensioen_lijfrente in ('ja', 'nee')),
  constraint nieuwsprofiel_herkomst_object_check
    check (jsonb_typeof(herkomst) = 'object')
);

comment on table public.nieuwsprofiel is
  'Nieuwsprofiel v1 van de Krant (ADR 0172/0173): dertien velden in banden, geen bedragen. '
  'Eigen rij, geen huishouddeling. Afgeleide velden herleidt de weekcron elke run; '
  '''zelf''-velden (herkomst) blijven staan. Inhoud — niet voor beheer (ADR 0146).';
comment on column public.nieuwsprofiel.herkomst is
  'Per profielveld (lib/krant/profiel-velden.ts PROFIEL_VELDEN) ''zelf'' of ''afgeleid''.';

alter table public.nieuwsprofiel enable row level security;

revoke all on table public.nieuwsprofiel from anon;
revoke truncate, references, trigger on table public.nieuwsprofiel from authenticated;

drop policy if exists "nieuwsprofiel own select" on public.nieuwsprofiel;
create policy "nieuwsprofiel own select" on public.nieuwsprofiel
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "nieuwsprofiel own insert" on public.nieuwsprofiel;
create policy "nieuwsprofiel own insert" on public.nieuwsprofiel
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "nieuwsprofiel own update" on public.nieuwsprofiel;
create policy "nieuwsprofiel own update" on public.nieuwsprofiel
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "nieuwsprofiel own delete" on public.nieuwsprofiel;
create policy "nieuwsprofiel own delete" on public.nieuwsprofiel
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── krant_edities ─────────────────────────────────────────────────────────────

create table if not exists public.krant_edities (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  -- ISO-week in Amsterdamse tijd (amsterdamWeekKey, lib/briefing/snapshot.ts).
  week_key          text        not null,
  bron              text        not null default 'schaduw',
  met_ai            boolean     not null default false,
  matcher_versie    smallint    not null,
  sjabloon_versie   smallint    not null,
  profiel_versie    smallint    not null,
  -- Grove typering zonder id (profielType): leeftijdsklasse × wonen × partner —
  -- de sleutel van de K1-meting "lege edities per profieltype".
  profiel_type      text        not null,
  profiel_snapshot  jsonb       not null,
  leeg              boolean     not null,
  lege_tekst        text,
  item_count        smallint    not null default 0,
  -- Het algemene katern (B7): kop, label en de artikelen zonder regel voor jou.
  algemeen          jsonb       not null default '{}'::jsonb,
  -- B4: na het terugtrekken van een duiding wordt de editie opnieuw berekend;
  -- de oude rij blijft staan en wijst naar zijn opvolger.
  vervangen_door    uuid        references public.krant_edities(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint krant_edities_bron_check check (bron in ('schaduw', 'live')),
  constraint krant_edities_week_key_check check (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  constraint krant_edities_item_count_check check (item_count >= 0),
  constraint krant_edities_leeg_consistent_check check ((leeg and item_count = 0) or (not leeg and item_count > 0))
);

comment on table public.krant_edities is
  'Editie van de Krant zonder AI per lezer en ISO-week (ADR 0172/0173). bron = schaduw (K1) | '
  'live (vanaf 1C); met_ai = false voor de matcher-editie. Schrijven alleen service-role; '
  'lezen eigen rij. Los van news_editions (keuze 8) tot 1C.';
comment on column public.krant_edities.vervangen_door is
  'B4: de editie die deze verving na het terugtrekken van een duiding; NULL = de geldende editie van die week.';

-- De cron en de herberekening zoeken de GELDENDE editie van een week; de cap
-- ruimt op leeftijd op.
create index if not exists idx_krant_edities_user_week
  on public.krant_edities (user_id, bron, week_key, created_at desc);
create index if not exists idx_krant_edities_vervangen_door
  on public.krant_edities (vervangen_door)
  where vervangen_door is not null;

alter table public.krant_edities enable row level security;

revoke all on table public.krant_edities from anon;
revoke insert, update, truncate, references, trigger on table public.krant_edities from authenticated;

drop policy if exists "krant_edities own select" on public.krant_edities;
create policy "krant_edities own select" on public.krant_edities
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "krant_edities own delete" on public.krant_edities;
create policy "krant_edities own delete" on public.krant_edities
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── krant_editie_items ────────────────────────────────────────────────────────

create table if not exists public.krant_editie_items (
  id            uuid        primary key default gen_random_uuid(),
  editie_id     uuid        not null references public.krant_edities(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  article_id    uuid        references public.news_articles(id) on delete set null,
  positie       smallint    not null,
  vorm          text        not null,
  score         smallint    not null,
  mechanisme    text,
  sjabloon_id   text        not null,
  variant       smallint    not null,
  -- Gevulde sjabloonslots: alleen banden en bedragen in euro's (B2).
  slots         jsonb       not null default '{}'::jsonb,
  -- De gerenderde regel voor jou.
  tekst         text        not null,
  -- Het ruwe bereik {lo, hi, eenheid, richting, vorm, jaar} voor 1E (B22); NULL bij relevant.
  impact        jsonb,
  deadline      jsonb,
  wat_mist      text[]      not null default '{}'::text[],
  waarom        text[]      not null default '{}'::text[],
  -- Kop, rubriek, bron, url, datum en de 1A-samenvatting — leesbaar nadat het
  -- artikel is opgeruimd (article_id wordt dan NULL).
  snapshot      jsonb       not null,
  created_at    timestamptz not null default now(),
  constraint krant_editie_items_vorm_check check (vorm in ('direct', 'gevoeligheid', 'relevant')),
  constraint krant_editie_items_score_check check (score between 1 and 5),
  constraint krant_editie_items_positie_check check (positie >= 0),
  constraint krant_editie_items_editie_positie_key unique (editie_id, positie)
);

comment on table public.krant_editie_items is
  'Regels van een Krant-editie (ADR 0172/0173). article_id → news_articles on delete set null; '
  'de herberekening na terugtrekken (B4) vindt via article_id → editie → user_id de geraakte '
  'edities. Schrijven alleen service-role; lezen eigen rij.';

create index if not exists idx_krant_editie_items_article
  on public.krant_editie_items (article_id)
  where article_id is not null;
create index if not exists idx_krant_editie_items_user
  on public.krant_editie_items (user_id);

alter table public.krant_editie_items enable row level security;

revoke all on table public.krant_editie_items from anon;
revoke insert, update, truncate, references, trigger on table public.krant_editie_items from authenticated;

drop policy if exists "krant_editie_items own select" on public.krant_editie_items;
create policy "krant_editie_items own select" on public.krant_editie_items
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "krant_editie_items own delete" on public.krant_editie_items;
create policy "krant_editie_items own delete" on public.krant_editie_items
  for delete to authenticated
  using (user_id = (select auth.uid()));
