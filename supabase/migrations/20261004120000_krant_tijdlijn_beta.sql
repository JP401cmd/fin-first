-- Krant 1C fase 1: de tijdlijn zonder AI als opt-in bèta (B31, B32, B37, B38).
-- Eigenaarsbesluiten 28-09-2026 (kaart 1C, blokken ONDERZOEK + BESLUIT
-- EIGENAAR): de bestaande `krant_edities` + `krant_editie_items` dienen als
-- VERVERSINGEN van de tijdlijn — één editierij per verversing (bron
-- 'tijdlijn'), een artikel hoogstens één keer in iemands tijdlijn. Geen nieuwe
-- tabel: één archief, één AVG-registratie, één leesvorm (B32/B9).
-- Grondslag B (gerechtvaardigd belang) voor de schaduwweekrun → een
-- bezwaarkolom die de weekcron respecteert.
--
-- ── Lineage ───────────────────────────────────────────────────────────────────
-- Bouwt uitsluitend op 20260922120000_krant_nieuwsprofiel_en_schaduwedities
-- (live sinds 0.92.001, geregistreerd). De ongedraaide voorgangers
-- 20261001120000 (ai_enabled) en 20261003120000 (news_articles.bron_detail,
-- sessie A) raken geen enkel object hieronder; volgorde t.o.v. die twee doet
-- er niet toe.
--
-- ── Wat er verandert ──────────────────────────────────────────────────────────
-- krant_edities.bron        CHECK += 'tijdlijn'. De schaduwweekrun ('schaduw')
--                           loopt ongewijzigd door voor de K1-meting.
-- krant_editie_items.vorm   CHECK += 'raakt' (B37 "Over jouw situatie", zonder
--                           bedrag).
-- krant_editie_items.tijdlijn  boolean, gedenormaliseerd uit de editie
--                           (bron = 'tijdlijn'). Nodig omdat een partiële index
--                           niet naar een kolom van een andere tabel kan kijken.
--                           Schrijver: alleen lib/krant/editie-schrijver.ts
--                           (service-role), die hem gelijk zet aan de bron.
-- uniek (user_id, article_id) WHERE tijdlijn AND article_id IS NOT NULL
--                           — "een artikel staat hoogstens één keer in iemands
--                           tijdlijn" (B31) op DB-niveau. Een GEWONE unieke index
--                           kan niet: de schaduwweekrun en de herberekening (B4)
--                           maken bewust dubbelen. Racen de knop en de cron, dan
--                           faalt de tweede items-insert op deze index en haalt de
--                           compensatie in schrijfEditie die verversing weg.
--                           article_id wordt NULL als de ingest het artikel na
--                           120 dagen opruimt; NULL telt niet mee (WHERE).
-- nieuwsprofiel.krant_variant   'ai' | 'tijdlijn' | NULL (= de standaard; tot
--                           de K1-poort de AI-Krant). Wordt na de omschakeling
--                           de keuze met/zonder AI uit 1E (B23).
-- nieuwsprofiel.tijdlijn_gelezen_tot  "Nieuw sinds je laatste bezoek" + de
--                           nieuwsstip, op elk apparaat gelijk (server-side).
-- profiles.krant_schaduw_bezwaar_at   bezwaar tegen de schaduwweekrun (grondslag
--                           gerechtvaardigd belang, art. 6 lid 1 sub f; art. 21):
--                           de weekcron slaat deze lezer over. Bewust op
--                           PROFILES en niet op nieuwsprofiel: nieuwsprofiel
--                           valt onder de sessie-wis (deleteAllUserData,
--                           /api/onboarding/reset) en heeft een eigen-rij-
--                           DELETE — een reset zou het bezwaar stil opheffen
--                           en de volgende weekrun maakt een vers profiel
--                           zonder bezwaar (security Y1 / eindreview M3,
--                           28-09). De seed-upsert en de reset schrijven deze
--                           kolom niet, dus hij overleeft ze. De lezer mag hem
--                           zelf zetten en intrekken (tabelbrede grant op
--                           profiles; niet in de guard-denylist) — het is zijn
--                           eigen bezwaar; beheer zet hem na een bezwaar via
--                           het contactkanaal met de service-role.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- RLS-policies ongewijzigd (eigen rij; schrijven op edities/items alleen
-- service-role). NIEUW: kolomrechten op nieuwsprofiel. De eigen-rij-policies
-- voor INSERT/UPDATE staan tabelbreed open (bedoeld voor het profielscherm van
-- 2C). Zonder kolomgrant kon een lezer via de browser-client zélf
-- `krant_variant = 'tijdlijn'` zetten terwijl de bèta dicht is. Daarom:
-- authenticated mag alleen de PROFIELVELDEN schrijven, plus `herkomst` (een
-- zelf ingevulde waarde als 'zelf' markeren is legitiem: dan overschrijft de
-- afleiding hem niet), `tijdlijn_gelezen_tot` (een eigen-rij-voorkeur, zoals
-- CLAUDE.md die via de sessie-client laat schrijven) en updated_at; bij UPDATE
-- ook `user_id`, omdat PostgREST een upsert als ON CONFLICT … DO UPDATE SET
-- user_id = EXCLUDED.user_id bouwt — de WITH CHECK `user_id = auth.uid()` houdt
-- her-sleutelen tegen (security G1). `krant_variant` en `afgeleid_at` schrijft
-- uitsluitend de service-role — via een route met de bèta-poort (fase 2) of
-- via beheer.
-- Begrenzing (security G3): `herkomst` en `rubrieken` zijn sessie-schrijfbaar en
-- worden door de gedeelde weekcron gelezen en teruggeschreven; een CHECK op de
-- grootte voorkomt dat één lezer die job opblaast (live 28-09: max 281 bytes,
-- 0 rubrieken). Er is vandaag geen enkele
-- sessie-schrijver op nieuwsprofiel (grep 28-09: alleen de service-role in
-- lib/krant/profiel-afleiding.ts), dus deze inperking breekt niets.
-- anon: had al niets (20260922120000) en krijgt niets.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Geen nieuwe tabel: de drie tabellen staan al in lib/user-data-tables.ts
-- (wis + zelfexport) en cascaden bij accountverwijdering. Bewaartermijn van de
-- tijdlijn: 120 dagen, gehandhaafd door de opruimstap in lib/krant/tijdlijn-run.ts
-- (zoals ruimSchaduwOp de 26 weken van de schaduw handhaaft); geen DDL.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Vóór de code, in ÉÉN transactie (begin … commit): er mag geen moment zijn
-- waarop krant_variant bestaat terwijl de tabelbrede grant nog geldt.
-- Andersom: de tijdlijncron schrijft bron 'tijdlijn' en faalt op de CHECK
-- (job_runs error, geen stille schade); de weekcron leest
-- profiles.krant_schaduw_bezwaar_at en faalt op een onbekende kolom — de hele
-- run wordt dan overgeslagen (fail-closed), dus DDL eerst.
-- De CHECK-wissels valideren bestaande rijen: die dragen alleen 'schaduw' en
-- direct/gevoeligheid/relevant, dus altijd geldig.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Vooruit corrigeren. Een correctiemigratie (1) verwijdert eerst alle
-- tijdlijnrijen (`delete from krant_edities where bron = 'tijdlijn'`, items
-- cascaden), (2) dropt de partiële index en `krant_editie_items.tijdlijn`,
-- (3) zet beide CHECKs terug, (4) dropt de twee nieuwsprofiel-kolommen, de
-- twee grootte-CHECKs en profiles.krant_schaduw_bezwaar_at (pas als de
-- grondslag van de schaduwrun anders is geregeld — anders gaat een bezwaar
-- verloren) en zet de tabelbrede insert/update-grant voor authenticated terug. Data-vernietigend,
-- dus pas nadat de bèta aantoonbaar is gestopt (TIJDLIJN_BETA_OPEN = false en
-- de tijdlijncron uit vercel.json).
-- Signaal dat het misging: job_runs 'krant-tijdlijn' met fouten > 0 run na
-- run, of 23505-meldingen (uniek) buiten de knop/cron-race.

-- ── krant_edities: bron 'tijdlijn' ────────────────────────────────────────────

alter table public.krant_edities drop constraint if exists krant_edities_bron_check;
alter table public.krant_edities
  add constraint krant_edities_bron_check check (bron in ('schaduw', 'live', 'tijdlijn'));

comment on column public.krant_edities.bron is
  'schaduw (K1-weekrun) | live (gereserveerd) | tijdlijn (één rij per verversing van de tijdlijn-bèta, B31/B38).';

-- ── krant_editie_items: vorm 'raakt' + tijdlijn-vlag + uniek per lezer ────────

alter table public.krant_editie_items drop constraint if exists krant_editie_items_vorm_check;
alter table public.krant_editie_items
  add constraint krant_editie_items_vorm_check check (vorm in ('direct', 'gevoeligheid', 'relevant', 'raakt'));

alter table public.krant_editie_items
  add column if not exists tijdlijn boolean not null default false;

comment on column public.krant_editie_items.tijdlijn is
  'Gedenormaliseerd: true als de editie bron = ''tijdlijn'' heeft. Draagt de partiële unieke index lezer + artikel (B31).';

create unique index if not exists krant_editie_items_tijdlijn_lezer_artikel_key
  on public.krant_editie_items (user_id, article_id)
  where tijdlijn and article_id is not null;

-- De leesloader (fase 2) pakt de nieuwste 20 van één lezer.
create index if not exists idx_krant_editie_items_tijdlijn_lezer
  on public.krant_editie_items (user_id, created_at desc)
  where tijdlijn;

-- ── nieuwsprofiel: opt-in, gelezen-tot, bezwaar ──────────────────────────────

alter table public.nieuwsprofiel
  add column if not exists krant_variant text,
  add column if not exists tijdlijn_gelezen_tot timestamptz,
  add column if not exists tijdlijn_vernieuwd_at timestamptz;

alter table public.nieuwsprofiel drop constraint if exists nieuwsprofiel_krant_variant_check;
alter table public.nieuwsprofiel
  add constraint nieuwsprofiel_krant_variant_check check (krant_variant is null or krant_variant in ('ai', 'tijdlijn'));

comment on column public.nieuwsprofiel.krant_variant is
  'Welke Krant de lezer leest: ''ai'' (bewust de AI-Krant, alleen met AI aan + AI-abonnement) | ''tijdlijn'' | NULL = de standaard: de tijdlijn zonder AI (B40, zolang TIJDLIJN_BETA_OPEN dicht staat alleen voor de superadmin). Alleen service-role schrijft.';
comment on column public.nieuwsprofiel.tijdlijn_vernieuwd_at is
  'Fase 2: de ATOMAIRE rem van de vernieuwknop (hoogstens één per 10 minuten). lib/krant/tijdlijn-vernieuwen.ts claimt met update … where (null or < now() - 10 min) returning; van gelijktijdige verzoeken wint er één (eindreview Y3 / security Y1, 29-09). Service-role only (niet in de sessiegrant); wisTijdlijn raakt hem niet, dus wisselen van variant reset de rem niet.';
comment on column public.nieuwsprofiel.tijdlijn_gelezen_tot is
  'Tot wanneer de lezer de tijdlijn heeft gezien ("nieuw sinds je laatste bezoek", nieuwsstip). Eigen-rij-voorkeur: sessie-schrijfbaar.';
alter table public.nieuwsprofiel drop constraint if exists nieuwsprofiel_herkomst_grootte_check;
alter table public.nieuwsprofiel
  add constraint nieuwsprofiel_herkomst_grootte_check check (pg_column_size(herkomst) <= 2048);
alter table public.nieuwsprofiel drop constraint if exists nieuwsprofiel_rubrieken_grootte_check;
alter table public.nieuwsprofiel
  add constraint nieuwsprofiel_rubrieken_grootte_check check (rubrieken is null or cardinality(rubrieken) <= 20);

-- ── profiles: bezwaar tegen de schaduwrun (buiten de sessie-wis) ─────────────

alter table public.profiles
  add column if not exists krant_schaduw_bezwaar_at timestamptz;

comment on column public.profiles.krant_schaduw_bezwaar_at is
  'Bezwaar tegen de schaduwweekrun van de Krant (grondslag gerechtvaardigd belang, besluit 28-09-2026, ADR 0183): de weekcron slaat deze lezer over. Op profiles zodat een reset/sessie-wis het bezwaar niet opheft.';

-- Kolomrechten: sessies schrijven alleen de profielvelden (zie Toegangsmodel).
revoke insert, update on table public.nieuwsprofiel from authenticated;
grant insert (
  user_id, profiel_versie, geboortejaar, huishouden, kinderen, werk, inkomen, wonen,
  hypotheek_restschuld, hypotheek_rentevast, woonplan, spaargeld, beleggingen,
  beleggingen_vorm, schulden, pensioen_werkgever, pensioen_lijfrente, rubrieken,
  herkomst, tijdlijn_gelezen_tot, created_at, updated_at
) on table public.nieuwsprofiel to authenticated;
grant update (
  user_id, profiel_versie, geboortejaar, huishouden, kinderen, werk, inkomen, wonen,
  hypotheek_restschuld, hypotheek_rentevast, woonplan, spaargeld, beleggingen,
  beleggingen_vorm, schulden, pensioen_werkgever, pensioen_lijfrente, rubrieken,
  herkomst, tijdlijn_gelezen_tot, updated_at
) on table public.nieuwsprofiel to authenticated;

-- ── krant_geduide_artikelen: actuele duiding voor de leesloader (fase 2) ─────
-- De tijdlijn-leesloader (lib/krant/tijdlijn-lezen.ts) leest via de
-- SESSIE-client. Achtergrond en katern staan als jsonb op de verversing en
-- moeten bij het lezen gefilterd worden op de ACTUELE duiding_status (een
-- teruggetrokken artikel mag daar niet blijven staan; eindreview M2 fase 1).
-- news_articles is voor sessies niet leesbaar (policy service/superadmin,
-- 20260719090108). Deze functie geeft uit de opgegeven id's alleen die terug
-- die NU 'geduid' zijn — geen inhoud, geen lezersdata; de status van een
-- publiek nieuwsartikel. Begrensd op 200 id's (een verversing draagt er ≤ ~16).
-- SECURITY DEFINER met lege search_path en volledig gekwalificeerde namen;
-- alleen authenticated mag hem aanroepen (anon en public niet).
-- VERWACHT na toepassen: een get_advisors-WARN "SECURITY DEFINER callable by
-- authenticated" op deze functie. Die is BEDOELD (de sessie-loader moet hem
-- kunnen aanroepen); niet "fixen" door authenticated in te trekken (ADR 0183).
create or replace function public.krant_geduide_artikelen(ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.news_articles a
  where a.id = any (ids[1:200])
    and a.duiding_status = 'geduid'
$$;

comment on function public.krant_geduide_artikelen(uuid[]) is
  'Krant 1C fase 2: welke van deze artikel-id''s zijn nu geduid? Alleen id''s, geen inhoud. Voor de tijdlijn-leesloader (sessie-client), ADR 0183.';

revoke all on function public.krant_geduide_artikelen(uuid[]) from public, anon;
grant execute on function public.krant_geduide_artikelen(uuid[]) to authenticated;
