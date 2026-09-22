-- ── Krant 1F fase 1 · Wat is een artikel — herkomst per rij (ADR 0176) ──────
--
-- De ingest bepaalt voortaan zelf wat één artikel is, met een vaste bronsoort
-- per bron en een server-bepaalde sleutel (B24). Deze kolommen leggen per rij
-- vast WAAR het artikel vandaan komt en WELKE brontekst erbij hoort, zodat
-- elke duiding en elke kop achteraf na te lopen is:
--
--   bron_soort       rss · web_lijst · web_pagina (de vaste soort van de bron)
--   bron_pagina_url  de geconfigureerde feed of pagina waar het item uit kwam
--   inhoud_hash      sha256 (hex) van de genormaliseerde brontekst, server-berekend
--   published_bron   waar published_at vandaan komt: feed · meta · eerste_gezien
--   bron_kop         de eigen kop van de bron (RSS-titel, sectiekop, linktekst)
--   bron_fragment    de eigen brontekst van het item (≤ 8.000 tekens)
--   laatst_gezien_at laatste run waarin het item nog op de bron stond (bewaren)
--
-- De sleutel blijft `source_url` (unieke index news_articles_source_url_unique):
-- de ingest leidt die nu server-side af (feed-link, `href` van de pagina, of
-- pagina + `#tf-s-<sectiehash>`). Er komt dus GEEN nieuwe unieke index en geen
-- nieuwe onConflict-target — geen 42P10-risico, geen aanroeper die mee moet.
-- `inhoud_hash` krijgt een gewone index: de ingest ontdubbelt er exacte
-- inhoud mee en de K1-meting telt er dubbelen mee.
--
-- Nullable: tussen deze migratie en de deploy schrijft de oude ingest nog
-- rijen zonder deze velden. Die worden bij de omschakeling gewist
-- (20260922161000, B29). Een NOT NULL-aanscherping hoort in een latere,
-- aparte migratie, nadat de nieuwe ingest een run heeft gedraaid.
--
-- Eigenaarschap en RLS ongewijzigd: news_articles is een platformtabel
-- (policy "news_articles service or superadmin", ALL). Geen nieuwe tabel,
-- geen policy-wijziging.
--
-- Terugweg: kolommen toevoegen is niet destructief. Gaat het mis, dan draait
-- de oude code gewoon door (hij kent de kolommen niet). Een correctie gaat
-- vooruit met een nieuwe migratie; `drop column` alleen in een aparte, latere
-- migratie.

alter table public.news_articles
  add column if not exists bron_soort text,
  add column if not exists bron_pagina_url text,
  add column if not exists inhoud_hash text,
  add column if not exists published_bron text,
  add column if not exists bron_kop text,
  add column if not exists bron_fragment text,
  -- Het laatste moment waarop de ingest dit artikel nog op de bron zag. De
  -- bewaartermijn loopt hierop, niet op fetched_at: een sectie of link die nog
  -- op de bron staat, wordt anders na 120 dagen gewist en komt als "nieuw"
  -- terug (release-review 1F, M2). Bestaande rijen krijgen het moment van de
  -- migratie; die worden bij de omschakeling gewist (20260922161000).
  add column if not exists laatst_gezien_at timestamptz not null default now();

-- Herhaalbaar (conventie van de repo: DO-blok met pg_constraint): een tweede
-- run geeft geen 42710.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('news_articles_bron_soort_check',
       'check (bron_soort is null or bron_soort in (''rss'', ''web_lijst'', ''web_pagina''))'),
      ('news_articles_published_bron_check',
       'check (published_bron is null or published_bron in (''feed'', ''meta'', ''eerste_gezien''))'),
      ('news_articles_inhoud_hash_vorm_check',
       'check (inhoud_hash is null or inhoud_hash ~ ''^[0-9a-f]{64}$'')'),
      ('news_articles_bron_fragment_lengte_check',
       'check (bron_fragment is null or char_length(bron_fragment) <= 8000)'),
      ('news_articles_bron_kop_lengte_check',
       'check (bron_kop is null or char_length(bron_kop) <= 300)')
    ) as t(naam, definitie)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.news_articles'::regclass and conname = c.naam
    ) then
      execute format('alter table public.news_articles add constraint %I %s', c.naam, c.definitie);
    end if;
  end loop;
end
$$;

create index if not exists idx_news_articles_inhoud_hash
  on public.news_articles (inhoud_hash)
  where inhoud_hash is not null;

create index if not exists idx_news_articles_bron_soort
  on public.news_articles (bron_soort, fetched_at desc);

-- Voor de bewaarstap (`delete … where laatst_gezien_at < grens`).
create index if not exists idx_news_articles_laatst_gezien_at
  on public.news_articles (laatst_gezien_at);

comment on column public.news_articles.bron_soort is 'ADR 0176: vaste bronsoort van de bron (rss · web_lijst · web_pagina).';
comment on column public.news_articles.bron_pagina_url is 'ADR 0176: de geconfigureerde feed of pagina waar het item uit kwam.';
comment on column public.news_articles.inhoud_hash is 'ADR 0176: sha256 (hex) van de genormaliseerde brontekst, server-berekend.';
comment on column public.news_articles.published_bron is 'ADR 0176: herkomst van published_at — feed (pubDate), meta (JSON-LD/OG) of eerste_gezien (ophaalmoment).';
comment on column public.news_articles.bron_kop is 'ADR 0176: de eigen kop van de bron; nooit modeltekst.';
comment on column public.news_articles.laatst_gezien_at is 'ADR 0176: laatste ingest-run waarin het artikel nog op de bron stond; de bewaartermijn loopt hierop.';
comment on column public.news_articles.bron_fragment is 'ADR 0176: de eigen brontekst van het item (≤ 8.000 tekens); de grondslag voor de duiding vanaf 1F fase 2.';
