-- ── Krant · redactieregels (ADR 0191) — basis of wijziging, en de echte datum ──
--
-- Steekproef eigenaar 29 sep 2026: van 17 berichten hadden er 6 zonder
-- voorbehoud impact. Twee van de vier redactieregels hebben een kolom nodig,
-- vastgelegd BIJ DE INGEST en niet achteraf geraden:
--
--   bron_wijziging   alleen voor web_pagina (een vaste uitlegpagina, geknipt
--                    in secties):
--                      basis      de sectie kwam binnen omdat we de PAGINA voor
--                                 het eerst zagen — de stand van zaken, geen
--                                 nieuws (nooit in de tijdlijn, nooit "Nieuw")
--                      gewijzigd  een nieuwe sectie op een pagina die we al
--                                 kenden — een wijziging, dus nieuws
--                    null voor rss en web_lijst (nieuwsberichten).
--   published_bron   krijgt de waarde 'pagina': geen metadata, wel een datum
--                    vlak bij de kop in de artikeltekst ("Nieuws 24/08/26" bij
--                    AFM). 'eerste_gezien' blijft het ophaalmoment en is nooit
--                    een publicatiedatum.
--
-- Waarom een kolom en geen afleiding: "is dit de eerste run van deze pagina" is
-- achteraf alleen af te leiden zolang de rijen van die eerste run bestaan. De
-- bewaartermijn (120 dagen op laatst_gezien_at) kan ze wissen, en dan zou een
-- latere wijziging stil als basis gelezen worden. De ingest weet het op het
-- moment zelf zeker; dat leggen we vast.
--
-- ── Wat deze migratie doet (één transactie) ──────────────────────────────────
--   1. kolom bron_wijziging + CHECK (waarden) + CHECK (alleen bij web_pagina);
--   2. de CHECK op published_bron verruimd met 'pagina';
--   3. backfill bron_wijziging: per bron_pagina_url zijn de rijen van de EERSTE
--      ophaalrun (fetched_at = het minimum van die pagina; één run deelt één
--      fetched_at) 'basis', latere rijen 'gewijzigd'. Verwacht (gemeten 29 sep,
--      alleen aantallen): 126 web_pagina-rijen → 125 basis, 1 gewijzigd;
--   4. backfill van de echte datum voor web_lijst-rijen met 'eerste_gezien'
--      waarvan de artikeltekst (bron_detail = 'gelezen') het patroon van hun
--      host draagt — dezelfde patronen als PAGINA_DATUM_PATRONEN in
--      lib/news-sources.ts, op dezelfde tekst, met dezelfde grenzen (niet na
--      de ophaaldag, niet meer dan 730 dagen ervoor). Alleen uit het fragment
--      dat we al hebben; geen nieuwe ophaalronde. Verwacht: 6 AFM-rijen;
--   5. de momentopnamen van de Krant (krant_editie_items.snapshot en
--      krant_edities.algemeen) krijgen dezelfde lezing: zonder echte datum
--      "gezienOp" in plaats van een publicatiedatum. Alleen items die dat veld
--      nog niet dragen. Verwacht (29 sep): 15 items (7 schaduw, 8 tijdlijn) en
--      de algemeen-blokken van hoogstens 17 edities (15 schaduw, 2 tijdlijn).
--
-- ── Herhaalbaar ──────────────────────────────────────────────────────────────
-- Kolom en CHECKs via `if not exists` / pg_constraint; stap 3 raakt alleen
-- rijen met bron_wijziging is null; stap 4 alleen published_bron =
-- 'eerste_gezien' (na de update staat hij op 'pagina'); stap 5 alleen items
-- zonder de sleutel "gezienOp". Een tweede run verandert niets.
--
-- ── Eigenaarschap en RLS ─────────────────────────────────────────────────────
-- Ongewijzigd. news_articles is een platformtabel (policy "news_articles
-- service or superadmin", ALL). krant_edities / krant_editie_items blijven
-- eigen-rij; stap 5 wijzigt alleen de weergavedatum in rijen die er al zijn
-- (geen verplaatsing tussen lezers, geen nieuwe rij).
--
-- ── Uitrolvolgorde ───────────────────────────────────────────────────────────
-- DEZE MIGRATIE VÓÓR DE CODE. De Krant-loader (KANDIDAAT_KOLOMMEN) leest
-- bron_wijziging; zonder kolom geeft die select 42703 en werpen de Krant-crons.
-- De ingest overleeft de omgekeerde volgorde wel: bij PGRST204 (onbekende
-- kolom) of 23514 (CHECK zonder 'pagina') schrijft hij de rij in de vorm van
-- vóór deze migratie.
--
-- ── Terugweg ─────────────────────────────────────────────────────────────────
-- Vooruit corrigeren. Kolom en CHECK toevoegen is niet destructief; de oude code
-- kent de kolom niet en draait door. Terug naar de oude CHECK op published_bron
-- kan pas nadat de 'pagina'-rijen terug zijn gezet (update … set
-- published_bron = 'eerste_gezien', published_at = fetched_at where
-- published_bron = 'pagina'). `drop column` alleen in een aparte, latere
-- migratie.

begin;

-- ── 1. Kolom en CHECKs ───────────────────────────────────────────────────────

alter table public.news_articles
  add column if not exists bron_wijziging text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_articles_bron_wijziging_check'
      and conrelid = 'public.news_articles'::regclass
  ) then
    alter table public.news_articles
      add constraint news_articles_bron_wijziging_check
      check (bron_wijziging is null or bron_wijziging in ('basis', 'gewijzigd'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_articles_bron_wijziging_soort_check'
      and conrelid = 'public.news_articles'::regclass
  ) then
    alter table public.news_articles
      add constraint news_articles_bron_wijziging_soort_check
      check (bron_wijziging is null or bron_soort = 'web_pagina');
  end if;
end $$;

comment on column public.news_articles.bron_wijziging is
  'ADR 0191: alleen web_pagina — basis (sectie gezien omdat de pagina nieuw was: stand van zaken) of gewijzigd (nieuwe sectie op een bekende pagina: nieuws); null bij rss en web_lijst.';

-- ── 2. published_bron: 'pagina' erbij ────────────────────────────────────────
-- Drop + add in dezelfde transactie: er is geen moment zonder CHECK. De nieuwe
-- CHECK valideert bestaande rijen, die alleen feed/meta/eerste_gezien dragen.

alter table public.news_articles
  drop constraint if exists news_articles_published_bron_check;
alter table public.news_articles
  add constraint news_articles_published_bron_check
  check (published_bron is null or published_bron in ('feed', 'meta', 'pagina', 'eerste_gezien'));

comment on column public.news_articles.published_bron is
  'ADR 0176/0191: herkomst van published_at — feed (pubDate), meta (JSON-LD/OG/Dublin Core), pagina (zichtbare datum bij de kop) of eerste_gezien (ophaalmoment, nooit een publicatiedatum).';

-- ── 3. Backfill bron_wijziging ───────────────────────────────────────────────

with eerste as (
  select bron_pagina_url, min(fetched_at) as eerste_run
  from public.news_articles
  where bron_soort = 'web_pagina' and bron_pagina_url is not null
  group by bron_pagina_url
)
update public.news_articles a
set bron_wijziging = case when a.fetched_at = e.eerste_run then 'basis' else 'gewijzigd' end
from eerste e
where a.bron_soort = 'web_pagina'
  and a.bron_wijziging is null
  and a.bron_pagina_url = e.bron_pagina_url;

-- Een web_pagina-rij zonder bron_pagina_url (hoort niet te bestaan) is de
-- voorzichtige lezing: basis.
update public.news_articles
set bron_wijziging = 'basis'
where bron_soort = 'web_pagina' and bron_wijziging is null;

-- ── 4. Backfill van de echte datum (web_lijst, eerste_gezien) ────────────────
-- Per rij in een eigen blok: een datum die geen bestaande kalenderdag is
-- (31/02) laat make_date werpen; die rij houdt dan eerste_gezien.

do $$
declare
  r record;
  m text[];
  dag int;
  maand int;
  jaar int;
  datum date;
  aanhef text;
begin
  for r in
    select id, source_url, bron_fragment, fetched_at
    from public.news_articles
    where bron_soort = 'web_lijst'
      and published_bron = 'eerste_gezien'
      and bron_detail = 'gelezen'
      and bron_fragment is not null
  loop
    aanhef := left(r.bron_fragment, 400);
    m := null;
    if r.source_url like 'https://www.afm.nl/%' then
      -- "Nieuws 24/08/26": soortwoord + dd/mm/jj op een eigen regel.
      m := regexp_match(aanhef, '(?:^|\n)[A-Z][A-Za-z]{2,24} (\d{2})/(\d{2})/(\d{2})(?=\s|$)');
      if m is not null then
        dag := m[1]::int; maand := m[2]::int; jaar := 2000 + m[3]::int;
      end if;
    elsif r.source_url like 'https://www.cpb.nl/%' then
      -- "15 september 2026" op een eigen regel direct na de titel.
      m := regexp_match(aanhef, '(?:^|\n)(\d{1,2}) (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) (\d{4})[ \t]*(?=\n|$)', 'i');
      if m is not null then
        dag := m[1]::int;
        maand := array_position(array['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'], lower(m[2]));
        jaar := m[3]::int;
      end if;
    elsif r.source_url like 'https://www.rijksoverheid.nl/%' then
      -- "Nieuwsbericht 29-09-2026 | 14:15", "Mediatekst 25-09-2026".
      m := regexp_match(aanhef, '(?:^|\n)[A-Z][a-z]{2,24} (\d{1,2})-(\d{1,2})-(\d{4})(?=\s|$)');
      if m is not null then
        dag := m[1]::int; maand := m[2]::int; jaar := m[3]::int;
      end if;
    end if;
    continue when m is null;
    begin
      datum := make_date(jaar, maand, dag);
    exception when others then
      continue;
    end;
    continue when datum > (r.fetched_at at time zone 'UTC')::date;
    continue when datum < (r.fetched_at at time zone 'UTC')::date - 730;
    update public.news_articles
    set published_at = (datum::timestamp at time zone 'UTC'),
        published_bron = 'pagina'
    where id = r.id and published_bron = 'eerste_gezien';
  end loop;
end $$;

-- ── 5. Momentopnamen: "gezien op" in plaats van een verzonnen datum ──────────
-- Een echte datum (feed/meta/pagina) blijft of wordt de publicatiedatum; anders
-- wordt gepubliceerd null en gezienOp het ophaalmoment. Alleen items zonder
-- de sleutel gezienOp (van vóór ADR 0191).
--
-- Eén uitzondering, gelijk aan heeftEchteArtikelDatum in lib/krant/redactie.ts:
-- een GEWIJZIGDE sectie van een uitlegpagina draagt de datum van de hele
-- pagina, niet van de wijziging, en toont dus "gezien op" (eindreview Y3).
-- Stap 3 hierboven heeft bron_wijziging dan al gezet.

create or replace function pg_temp.echte_datum(published_bron text, bron_soort text, bron_wijziging text) returns boolean
language sql immutable as $f$
  select coalesce(published_bron in ('feed', 'meta', 'pagina'), false)
     and not coalesce(bron_soort = 'web_pagina' and bron_wijziging = 'gewijzigd', false)
$f$;

update public.krant_editie_items i
set snapshot = i.snapshot || jsonb_build_object(
      'gepubliceerd', case when pg_temp.echte_datum(a.published_bron, a.bron_soort, a.bron_wijziging) then to_jsonb(a.published_at) else 'null'::jsonb end,
      'gezienOp', case when pg_temp.echte_datum(a.published_bron, a.bron_soort, a.bron_wijziging) then 'null'::jsonb else to_jsonb(a.fetched_at) end
    )
from public.news_articles a
where a.id = i.article_id
  and i.snapshot is not null
  and jsonb_typeof(i.snapshot) = 'object'
  and not (i.snapshot ? 'gezienOp');

-- Een item waarvan het artikel is opgeruimd (a.id is null) blijft zoals het
-- is: we weten de herkomst van zijn datum niet meer, dus we raken hem niet aan
-- (security G5 — gelijk aan de items hierboven, die de join dan overslaat).
create or replace function pg_temp.redactie_items(items jsonb) returns jsonb
language sql stable as $f$
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(x) <> 'object' or x ? 'gezienOp' or a.id is null then x
      else x || jsonb_build_object(
        'gepubliceerd', case when pg_temp.echte_datum(a.published_bron, a.bron_soort, a.bron_wijziging) then to_jsonb(a.published_at) else 'null'::jsonb end,
        'gezienOp', case when pg_temp.echte_datum(a.published_bron, a.bron_soort, a.bron_wijziging) then 'null'::jsonb else to_jsonb(a.fetched_at) end
      )
    end
    order by t.nr), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as t(x, nr)
  left join public.news_articles a on a.id::text = t.x->>'artikelId'
$f$;

update public.krant_edities e
set algemeen = e.algemeen
  || case when jsonb_typeof(e.algemeen->'items') = 'array'
       then jsonb_build_object('items', pg_temp.redactie_items(e.algemeen->'items')) else '{}'::jsonb end
  || case when jsonb_typeof(e.algemeen->'achtergrond'->'items') = 'array'
       then jsonb_build_object('achtergrond', (e.algemeen->'achtergrond') || jsonb_build_object('items', pg_temp.redactie_items(e.algemeen->'achtergrond'->'items')))
       else '{}'::jsonb end
where jsonb_typeof(e.algemeen) = 'object'
  and e.algemeen is distinct from (
    e.algemeen
    || case when jsonb_typeof(e.algemeen->'items') = 'array'
         then jsonb_build_object('items', pg_temp.redactie_items(e.algemeen->'items')) else '{}'::jsonb end
    || case when jsonb_typeof(e.algemeen->'achtergrond'->'items') = 'array'
         then jsonb_build_object('achtergrond', (e.algemeen->'achtergrond') || jsonb_build_object('items', pg_temp.redactie_items(e.algemeen->'achtergrond'->'items')))
         else '{}'::jsonb end
  );

commit;
