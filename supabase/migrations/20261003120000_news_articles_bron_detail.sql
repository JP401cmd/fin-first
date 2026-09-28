-- ── Krant 1F fase 3 · De artikelpagina ophalen — detailstatus per rij (ADR 0176) ──
--
-- Voor een item van een lijstbron (CPB, AFM) of een CBS-feed haalt de ingest
-- voortaan de artikelpagina zelf op, alleen op de hosts en paden van
-- `DETAIL_HOSTS` in lib/news-sources.ts. Deze kolom legt per rij vast hoe dat
-- ging:
--
--   null        nooit geprobeerd (andere bron, of een rij van vóór fase 3)
--   gelezen     de artikeltekst staat in bron_fragment (≤ 4.000 tekens)
--   terugval    ophalen of lezen mislukte; het fragment uit de feed of de
--               lijstregel bleef staan
--   geen_html   de link wees naar een pdf of een ander niet-HTML-document;
--               bewust niet gelezen
--
-- Waarom een kolom en geen heuristiek op de fragmentlengte: de backfill moet
-- "geprobeerd en mislukt" (pdf, time-out) kunnen onderscheiden van "nooit
-- geprobeerd", anders haalt elke run dezelfde pdf opnieuw op. En de meting
-- "aandeel met artikeltekst" wordt er een exacte query door.
--
-- Nullable, geen default: tussen deze migratie en de deploy schrijft de oude
-- ingest rijen zonder deze kolom, en die horen juist `null` (nooit geprobeerd)
-- te zijn. Geen index: de backfill leest hoogstens enkele tientallen rijen per
-- run en filtert al op bron_soort.
--
-- Eigenaarschap en RLS ongewijzigd: news_articles is een platformtabel
-- (policy "news_articles service or superadmin", ALL). Geen nieuwe tabel,
-- geen policy-wijziging.
--
-- VOLGORDE: deze migratie vóór de deploy. De nieuwe ingest schrijft
-- bron_detail mee in elke upsert; zonder kolom weigert PostgREST de hele rij
-- (PGRST204) en telt de run alles als `skipped`.
--
-- Terugweg: een kolom toevoegen is niet destructief. Gaat het mis, dan draait
-- de oude code gewoon door (hij kent de kolom niet). Een correctie gaat vooruit
-- met een nieuwe migratie; `drop column` alleen in een aparte, latere migratie.

alter table public.news_articles
  add column if not exists bron_detail text;

-- Herhaalbaar (conventie van de repo, zie 20260922160000): een tweede run
-- geeft geen 42710.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_articles_bron_detail_check'
      and conrelid = 'public.news_articles'::regclass
  ) then
    alter table public.news_articles
      add constraint news_articles_bron_detail_check
      check (bron_detail is null or bron_detail in ('gelezen', 'terugval', 'geen_html'));
  end if;
end $$;

comment on column public.news_articles.bron_detail is
  'Krant 1F fase 3: uitkomst van het ophalen van de artikelpagina (gelezen · terugval · geen_html); null = nooit geprobeerd.';
