-- Krant 1A: duiding van nieuwsartikelen in de schaduw (ADR 0171).
-- Eigenaarsbesluiten 21-09-2026: B2 (alleen euro's), B3 (samenvatting in de
-- duiding), B4 (automatisch vrijgeven, achteraf terugtrekken), B10 (het
-- bestaande AI-pad blijft), keuzes 4–7 op kaart 1A.
--
-- ── Wat er bijkomt ────────────────────────────────────────────────────────────
-- `news_articles` is de platform-brede artikelbak (geen user_id; RLS = één
-- geconsolideerde policy "news_articles service or superadmin", FOR ALL, sinds
-- 20260721211306 — de oorspronkelijke superadmin_all + service_role_all uit
-- 20260324152331 zijn daarin samengevoegd). De duidingsstap in
-- lib/krant/duiding.ts schrijft per artikel:
--   * duiding           jsonb — het gesloten schema `DuidingV1`
--                       (lib/krant/duiding-schema.ts); NULL zolang niet geduid
--                       of afgewezen
--   * duiding_status    wacht | geduid | afgewezen | mislukt | teruggetrokken
--                       Default 'wacht' op bestaande rijen: de ~100 huidige
--                       artikelen worden bij de eerste run geduid, zodat de
--                       K1-meting direct begint.
--   * duiding_versie    smallint — DUIDING_VERSIE waarmee geduid is; een lagere
--                       versie gaat terug op 'wacht' (herleiden, niet ophogen)
--   * geduid_at         moment van de laatste (poging tot) duiding
--   * duiding_fout      korte code uit de controles ('ongegrond:rente_pct',
--                       'schema', 'mislukt' …) — nooit modeltekst
--   * duiding_pogingen  aantal modelcalls; na 3 mislukkingen 'afgewezen'
--   * teruggetrokken_*  B4: wie, wanneer en waarom beheer een vrijgegeven
--                       duiding heeft teruggetrokken (fase 2 schrijft dit via
--                       POST /api/admin/news-duiding/terugtrekken, gelogd in
--                       admin_actions_log). BEWUST GEEN vrijgegeven_door/_at:
--                       na de codecontroles is 'geduid' meteen de live-status.
--
-- ── Bewaartermijn ─────────────────────────────────────────────────────────────
-- Geen schemawijziging: de harde grens van 100 rijen en het 90-dagen-vangnet
-- in lib/news-ingest.ts zijn vervangen door ARTICLE_RETENTION_DAYS = 120.
-- Omvang: ~50/dag × 120 ≈ 6.000 rijen à 1–2 KB.
--
-- ── RLS-dekking ───────────────────────────────────────────────────────────────
-- Additieve kolommen op een bestaande tabel: ze erven de tabelbrede policy
-- "news_articles service or superadmin" (anon/authenticated: 0 rijen, geen
-- fout — leak-check 21-09-2026). Geen nieuwe policy, geen nieuw eigenaarschap. De
-- schrijver is de service-role (cron) of de superadmin-sessie (handmatige
-- ingest); lezers buiten beheer bestaan in K1 niet. ADR 0146: `news_articles`
-- staat op VRIJ_LEESBAAR, en de duiding is afgeleide, niet-persoonlijke inhoud
-- over openbaar nieuws — geen gebruikersdata.
--
-- De FK `teruggetrokken_door -> profiles(id) on delete set null` volgt de
-- conventie van `admin_actions_log`: de audit blijft staan als de beheerder
-- verdwijnt. Eigen (partial) index op de FK conform 20260719085405_perf_fk_indexes.
--
-- ── De terugweg ───────────────────────────────────────────────────────────────
-- Append-only. Blijkt de duiding fout, dan is de correctie een UPDATE
-- (status terug naar 'wacht' of 'teruggetrokken'), geen DDL. Moet het schema
-- terug, dan een latere migratie die de kolommen dropt — pas nadat 1B/1C er
-- niet meer op lezen. Signaal dat het misging: `duiding_status = 'afgewezen'`
-- op vrijwel alle rijen (controles te streng of prompt kapot) of een cron die
-- op maxDuration afbreekt (`job_runs.summary.duiding.wacht` groeit dag op dag).

alter table public.news_articles
  add column if not exists duiding jsonb,
  add column if not exists duiding_status text not null default 'wacht',
  add column if not exists duiding_versie smallint,
  add column if not exists geduid_at timestamptz,
  add column if not exists duiding_fout text,
  add column if not exists duiding_pogingen smallint not null default 0,
  add column if not exists teruggetrokken_at timestamptz,
  add column if not exists teruggetrokken_door uuid references public.profiles(id) on delete set null,
  add column if not exists teruggetrokken_reden text;

alter table public.news_articles
  add constraint news_articles_duiding_status_check
    check (duiding_status in ('wacht', 'geduid', 'afgewezen', 'mislukt', 'teruggetrokken')),
  add constraint news_articles_teruggetrokken_reden_check
    check (
      teruggetrokken_reden is null
      or teruggetrokken_reden in ('fout-getal', 'verkeerde-doelgroep', 'verkeerd-mechanisme', 'anders')
    ),
  -- Een teruggetrokken duiding draagt altijd tijdstip én reden (B4: het
  -- terugtrekken is de enige menselijke beslissing in de keten en moet
  -- verantwoord zijn).
  add constraint news_articles_teruggetrokken_volledig_check
    check (
      duiding_status <> 'teruggetrokken'
      or (teruggetrokken_at is not null and teruggetrokken_reden is not null)
    ),
  add constraint news_articles_duiding_pogingen_check
    check (duiding_pogingen >= 0),
  -- Het leescontract van 1B: status 'geduid' betekent dat er een duiding IS.
  add constraint news_articles_geduid_heeft_duiding_check
    check (duiding_status <> 'geduid' or duiding is not null);

-- Wachtrij-selectie van de duidingsstap: status + nieuwste eerst.
create index if not exists idx_news_articles_duiding_status
  on public.news_articles (duiding_status, fetched_at desc);

create index if not exists idx_news_articles_teruggetrokken_door
  on public.news_articles (teruggetrokken_door)
  where teruggetrokken_door is not null;

comment on column public.news_articles.duiding is
  'Duiding v1 (lib/krant/duiding-schema.ts): soort, ingangsdatum, deadline, doelgroep, '
  'mechanisme, samenvatting, grond, meta. Alleen euro''s (B2). NULL tot geduid. Zie ADR 0171.';
comment on column public.news_articles.duiding_status is
  'wacht | geduid | afgewezen | mislukt | teruggetrokken. Geduid = automatisch vrij na de '
  'codecontroles (B4); alleen geduid telt mee voor een editie (1B).';
comment on column public.news_articles.duiding_fout is
  'Korte foutcode uit lib/krant/duiding-controles.ts (geen modeltekst). Bij status geduid: '
  'het mechanisme viel af maar de rest bleef (keuze 7).';
comment on column public.news_articles.teruggetrokken_reden is
  'fout-getal | verkeerde-doelgroep | verkeerd-mechanisme | anders (B4).';
