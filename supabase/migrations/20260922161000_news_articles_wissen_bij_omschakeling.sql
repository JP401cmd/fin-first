-- ── Krant 1F fase 1 · B29: de oude artikelbak wissen bij de omschakeling ────
--
-- DATAMUTATIE — apart van de DDL (20260922160000). Toepassen bij de release
-- van 1F fase 1, in deze volgorde:
--   1. DDL 20260922160000 (kolommen)
--   2. deploy van de nieuwe ingest
--   3. DEZE migratie (wissen)
--   4. eerste ingest-run (handmatig via Vercel Run of de beheerknop)
-- Niet eerder: tot de deploy is dit de enige bak voor de AI-editie op /nieuws.
--
-- Besluit B29 (eigenaar, 22-09-2026), afwijkend van het advies: wissen in
-- plaats van legacy markeren. De rijen van vóór ADR 0176 zijn voor 81 %
-- parafrase-dubbels van statische pagina's met een modelkop, een modeldatum
-- of een model-URL (9 geven een 404).
--
-- Wat er gewist wordt: uitsluitend rijen ZONDER bron_soort — alles wat de
-- oude ingest schreef (op 22-09-2026: 192 rijen; 58 geduid, 2 afgewezen,
-- 39 mislukt, 93 wacht; 3 met is_used). Rijen die de nieuwe ingest al schreef
-- (bron_soort gezet) blijven staan. Daardoor is de migratie idempotent: een
-- tweede keer draaien raakt niets.
--
-- Precondities, read-only nagegaan op 22-09-2026:
--   - De enige FK naar news_articles is krant_editie_items.article_id
--     (ON DELETE SET NULL); die tabel had 0 rijen. Een oude rij waar een
--     editie-item naar verwijst, wordt NIET gewist (een SET NULL zou een
--     schaduweditie stil zijn bronartikel afnemen); blijft er daardoor een
--     oude rij over, dan faalt de migratie en rolt alles terug. Edities op
--     NIEUWE rijen (bron_soort gezet) houden de wis niet tegen.
--   - news_editions (1 rij, geen FK) bevat geen artikel-id en geen
--     source_url van een news_articles-rij.
--   - De regressiedata (bf458a7b, 059ba103, 41ed4267, 7ce838c7) staat met het
--     opnieuw opgehaalde bronfragment in lib/krant/__golden__/bron-*.json.
--   - De nulmeting van 22-09-2026 staat in Notion (MEETRESULTAAT op 1A/1B en
--     het ONDERZOEK-blok op 1F), niet in de DB.
--
-- Meetbaar: tel vóór en ná.
--   select count(*) filter (where bron_soort is null) as oud,
--          count(*) filter (where bron_soort is not null) as nieuw
--   from public.news_articles;
--   -- verwacht ná: oud = 0, nieuw ongewijzigd
--
-- Terugweg: er is geen terugweg voor de gewiste rijen zelf — dit is de enige
-- data-vernietigende stap en daarom een eigen migratie. Wat NIET terugkomt:
-- de 58 duidingen en 2 afwijzingen (inclusief duiding_fout/-pogingen), de
-- 3 is_used-markeringen, de oude fetched_at/published_at-waarden en de
-- modelkoppen/-samenvattingen. Wat WEL terugkomt: bij de eerste ingest-run de
-- huidige stand van elke werkende bron, met een server-bepaalde sleutel,
-- bronkop en bronfragment; die rijen staan op 'wacht' en worden door de
-- duidingsstap (60 per cron-run) opnieuw geduid. De LLM-editie op /nieuws
-- vult zich vanaf die run weer; tot dan is hij dunner.

-- ── AANVULLING (22-09-2026, eigenaar) · óók de schaduwedities wissen ────────
--
-- Read-only nagegaan op 22-09-2026: er staan 16 krant_edities (één per
-- gebruiker, waarvan 11 echte gebruikers en 5 testaccounts). Alle 16 dragen
-- een IDENTIEK `algemeen`-blok ("Ook in het nieuws") met 5 items — 80
-- instanties, 5 unieke — en die vijf dragen precies de fouten die ADR 0176
-- uitbant:
--   - 01265d1d "Box 3-berekening op voorlopige aanslag 2026 aangepast": de
--     overclaimende modelkop die het 1F-onderzoek aanwees (voltooid
--     wijzigingswerkwoord terwijl de bron geen wijziging noemt).
--   - alle vijf `gepubliceerd` op 2026-09-22T00:00:00+00:00 — het
--     00:00-symptoom van de modeldatum (192/192 in het onderzoek).
--   - geen enkele draagt het nieuwe sleutelschema: oude
--     `#tf-<djb2-van-modelkop>`-ankers, en twee zonder fragment
--     (ecb/ecb-rentetarieven/, …/digitale-euro-voor-jou/) — verzonnen
--     relativeUrl's die 404 geven.
--   - drie van de vijf komen van bronnen die fase 1 juist verwijderd heeft
--     (DNB Algemeen nieuws, DNB Publicaties, AFM Waarschuwingen).
-- `algemeen` is een gedenormaliseerde kopie: `artikelId` resolveert nu nog,
-- maar dangelt ná de wis STIL — op dat pad staat geen FK. Zonder deze stap
-- overleeft precies de tekst waar fase 2 voor gebouwd is, in de edities van
-- elf echte gebruikers.
--
-- Waarom alle rijen en niet een selectie: op het moment dat deze migratie
-- draait (ná de deploy, vóór de eerste ingest — stap 3 van 4) is er per
-- definitie geen editie die op nieuwe rijen gebouwd kan zijn. De guard
-- hieronder bewijst dat in plaats van het aan te nemen.
--
-- Kosten van weggooien: nihil. krant_editie_items is leeg (0 rijen), de
-- weekcron (`/api/krant/cron`, maandag 06:00 UTC) bouwt de edities opnieuw,
-- en de nulmeting van 22-09-2026 staat in Notion, niet in de DB.
--
-- Meetbaar: tel vóór en ná.
--   select count(*) as edities,
--          coalesce(sum(jsonb_array_length(algemeen->'items')),0) as items
--   from public.krant_edities;
--   -- verwacht vóór: 16 / 80 · verwacht ná: 0 / 0
--
-- Terugweg: geen — dit is data-vernietigend en hoort daarom in DEZE migratie,
-- samen met de artikelwis, zodat het één atomair moment is. Wat niet
-- terugkomt: de 16 edities met hun profiel_snapshot en het oude
-- `algemeen`-blok. Wat wel terugkomt: bij de eerstvolgende weekcron een verse
-- editie per gebruiker, gebouwd op bronkoppen en bronfragmenten.

-- Eén transactie (de migratie), race-vrij: de uitsluiting van gekoppelde
-- rijen zit IN de delete, niet in een aparte telling ervoor. De controle
-- daarna wordt een exception — en daarmee een rollback van de delete — als er
-- nog een oude rij over is.

-- ÉÉN TRANSACTIE (verplicht): pas deze migratie als één geheel toe —
-- `apply_migration` of één `execute_sql`-call met het hele bestand, NIET per
-- statement. Alleen dan rolt de exception hieronder de delete terug
-- (fail-closed) en geldt de lock tot het einde.
--
-- De lock: onder READ COMMITTED ziet de `not exists` een krant_editie_item
-- niet dat ná de snapshot van de delete commit. SHARE MODE blokkeert
-- schrijvers op krant_editie_items tot deze transactie klaar is (lezers niet).
-- Lock-orde: edities vóór items — dezelfde orde die de weekcron aanhoudt
-- (eerst de editie, dan haar items), zodat er geen deadlock kan ontstaan.
-- Binnen één transactie conflicteert onze latere ROW EXCLUSIVE niet met onze
-- eigen SHARE; andere schrijvers wachten tot deze transactie klaar is.
lock table public.krant_edities in share mode;
lock table public.krant_editie_items in share mode;

-- Guard vóór élke delete: bestaat er een editie die op de NIEUWE ingest is
-- gebouwd, dan is deze migratie buiten de voorgeschreven orde toegepast
-- (stap 3 hoort vóór de eerste ingest-run). Dan wissen we niets — een verse
-- editie weggooien is een ander soort fout dan een oude laten staan.
do $$
declare
  nieuw integer;
begin
  select count(*) into nieuw
  from public.krant_edities e
  where exists (
          select 1
          from public.krant_editie_items k
          join public.news_articles a on a.id = k.article_id
          where k.editie_id = e.id
            and a.bron_soort is not null
        )
     or exists (
          select 1
          from jsonb_array_elements(
                 case when jsonb_typeof(e.algemeen->'items') = 'array'
                      then e.algemeen->'items' else '[]'::jsonb end) it
          join public.news_articles a on a.id::text = it->>'artikelId'
          where a.bron_soort is not null
        );

  if nieuw > 0 then
    raise exception 'B29-aanvulling: % editie(s) verwijzen naar rijen van de NIEUWE ingest — deze migratie is buiten de orde toegepast (stap 3 hoort vóór de eerste ingest-run). Niets gewist.', nieuw;
  end if;
end
$$;

-- De edities eerst. De cascade op krant_editie_items.editie_id ruimt hun
-- items op, waardoor de artikelwis hieronder niets meer hoeft over te slaan.
delete from public.krant_edities;

delete from public.news_articles a
where a.bron_soort is null
  and not exists (
    select 1 from public.krant_editie_items k where k.article_id = a.id
  );

do $$
declare
  over     integer;
  edities  integer;
begin
  select count(*) into over
  from public.news_articles
  where bron_soort is null;

  if over > 0 then
    raise exception 'B29: % oude artikel(en) niet gewist — er verwijst een schaduweditie naar. Eerst beoordelen; de delete is teruggerold.', over;
  end if;

  select count(*) into edities from public.krant_edities;

  if edities > 0 then
    raise exception 'B29-aanvulling: % editie(s) over na de wis. Eerst beoordelen; alles is teruggerold.', edities;
  end if;
end
$$;
