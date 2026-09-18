-- De rem op meldingen vervalt: melden is vanaf nu onbegrensd.
--
-- ── Waarom ────────────────────────────────────────────────────────────────────
-- `public.reserve_user_report_slot` hield sinds 20260806161500 een rem aan van
-- 5 meldingen per rollend uur per gebruiker. Die rem werkte precies zoals
-- bedoeld — en dat is nu juist het probleem: tijdens een testronde is vijf
-- meldingen per uur laag. Wie een scherm systematisch nalooft, loopt er halverwege
-- tegenaan en krijgt "Je hebt al veel meldingen gestuurd. Probeer het over een
-- uur nog eens." Een testfase waarin de meldknop dichtgaat terwijl er nog
-- bevindingen zijn, kost ons meldingen die we juist willen hebben.
--
-- Besluit van de eigenaar (18-09-2026): de rem gaat er hélemaal uit, niet
-- omhoog. Zie ADR 0159.
--
-- ── Wat blijft er over van de functie ─────────────────────────────────────────
-- Alles behalve de rem, en dat is bewust geen restant. De functie is sinds
-- 20260806161500 het ENIGE insert-pad op `public.user_reports` — de eigen-rij
-- INSERT-policy is toen opgeheven en komt hier NIET terug. Ze blijft dus nodig
-- voor het deel dat niets met remmen te maken heeft:
--
--   * `user_id` komt uit `auth.uid()` en is geen parameter — niemand meldt op
--     andermans naam;
--   * `email` komt uit `auth.users` en niet uit een parameter — de identiteit
--     van de melder stelt de database vast;
--   * zonder sessie (`auth.uid() is null`) weigert ze meteen;
--   * `security definer` + `set search_path = ''` blijven, om exact dezelfde
--     reden als in de oorspronkelijke migratie: de aanroeper heeft geen
--     insert-recht op de tabel, dus de functie moet gezaghebbend schrijven.
--
-- Weg gaan: de constante `v_limit`, de telling over het rollende uur, en de
-- transactiegebonden advisory lock die telling en insert serialiseerde. Die lock
-- had één taak — voorkomen dat N gelijktijdige verzoeken samen over de limiet
-- heen glippen. Zonder limiet is er niets meer te serialiseren, en een lock per
-- melder aanhouden zou alleen nog gelijktijdige meldingen van dezelfde gebruiker
-- op elkaar laten wachten zonder dat iemand daar iets aan heeft. Dubbel
-- verzonden meldingen worden client-side geblokkeerd (`meldingBezig` in de
-- meldmodus) en NIET door de primaire sleutel: de route mint per verzoek een
-- verse `crypto.randomUUID()`, dus twee klikken zijn twee id's en botsen nooit.
-- Dat was vóór deze migratie niet anders — de lock telde beide inzendingen
-- gewoon mee — maar het is het opschrijven waard, zodat niemand hier een
-- waarborg leest die er niet is.
--
-- Let op wat dit NIET raakt: de twee andere vindplaatsen van ADR 0076
-- (`reserve_bank_sync_slot`, `reserve_ai_calculator_slot`) blijven ongemoeid.
-- Dat ADR gaat over de mánier waarop een limiet wordt afgedwongen — atomair in
-- de datalaag — niet over de vraag of een bepaalde limiet moet bestaan. Wij
-- schrappen hier één limiet, niet het patroon.
--
-- ── Wat er nu ongeremd is, en wat dat kost ────────────────────────────────────
-- Expliciet opgeschreven zodat het een keuze blijft en geen verrassing. Wat de
-- rem daadwerkelijk begrensde, is het aantal RIJEN in `user_reports` per
-- gebruiker per uur — en in het kielzog daarvan het aantal Notion-kaartjes en
-- het aantal 48-uurs signed URL's dat met zo'n kaartje meegaat. Dát is vanaf nu
-- alleen nog begrensd door wie er kan inloggen: de beta-allowlist. De prijs is
-- geen geld maar mensenwerk — de drain-queue is het enige beheeroppervlak voor
-- deze meldingen en is met een stortvloed te vervuilen.
--
-- Eén ding NIET mooier voorstellen dan het is: de screenshot-bucket zat NOOIT
-- achter deze rem. De route uploadt vóór de RPC (een geweigerde melding liet al
-- een wees-screenshot achter, dat staat ook in de route), en los daarvan mag
-- elke ingelogde gebruiker via de Storage-API rechtstreeks in zijn eigen prefix
-- van `user-report-screenshots` schrijven — de policy eist het eigen prefix, geen
-- bijbehorende melding en geen aantal. Die bucket heeft eigen, ONAFHANKELIJKE
-- grenzen: privé, 4 MB per bestand, alleen png/jpeg/webp, 90 dagen retentie plus
-- een wees-prefix-veeg, en daarboven de projectquota. Het aantal uploads per
-- gebruiker was onbegrensd en blijft onbegrensd; deze migratie verandert daar
-- niets aan en dekt het ook niet af. Wil je dát begrenzen, dan is dat een eigen
-- besluit (een storage-rem of een koppeling upload↔melding), geen gevolg van
-- deze.
--
-- Verder blijven staan, en die hebben nooit met de rem te maken gehad: de
-- maximale bestandsgrootte en toegestane MIME-typen in de route, de
-- zod-validatie op de payload, en de CHECK-constraints op de tabel.
--
-- ── De terugweg ───────────────────────────────────────────────────────────────
-- Migraties zijn append-only; corrigeren gaat vooruit. Moet de rem terugkomen
-- (bijvoorbeeld wanneer de allowlist opengaat), dan is dat een nieuwe migratie
-- die deze functie opnieuw vervangt door de versie uit 20260806161500, eventueel
-- met een andere waarde voor `v_limit`. Er gaat in deze migratie geen data en
-- geen kolom verloren, dus die weg blijft open. Signaal dat het misging: een
-- ongebruikelijke toeloop van rijen in `user_reports` per gebruiker per uur —
-- zichtbaar met een simpele group-by op `user_id`.
--
-- ── Return-vorm blijft gelijk ─────────────────────────────────────────────────
-- `(slot_allowed, slot_used, slot_limit, report)` blijft ongewijzigd, zodat
-- `app/api/user-reports/route.ts` niet hoeft mee te veranderen om te blijven
-- werken. `slot_allowed` is vanaf nu altijd `true`; `slot_used` en `slot_limit`
-- zijn beide `0` en betekenen "geen rem". De route behoudt zijn 429-tak bewust
-- als vangrail: weigert de RPC ooit weer (na een correctiemigratie), dan
-- handelt de route dat nog steeds netjes af.

create or replace function public.reserve_user_report_slot(
  p_id              uuid,
  p_report_type     text,
  p_description     text,
  p_screen_label    text default null,
  p_expected        text default null,
  p_consent_inzage  boolean default false,
  p_route           text default null,
  p_page_title      text default null,
  p_user_agent      text default null,
  p_viewport        text default null,
  p_app_version     text default null,
  p_screenshot_path text default null
)
returns table (
  slot_allowed boolean,
  slot_used    integer,
  slot_limit   integer,
  report       jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.user_reports%rowtype;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  insert into public.user_reports (
    id, user_id, email, report_type, screen_label, description, expected,
    consent_inzage, route, page_title, user_agent, viewport, app_version,
    screenshot_path
  )
  values (
    coalesce(p_id, pg_catalog.gen_random_uuid()),
    v_user,
    -- Identiteit van de melder komt uit de database, niet uit een parameter.
    (select u.email from auth.users u where u.id = v_user),
    p_report_type,
    p_screen_label,
    p_description,
    p_expected,
    coalesce(p_consent_inzage, false),
    p_route,
    p_page_title,
    p_user_agent,
    p_viewport,
    p_app_version,
    p_screenshot_path
  )
  returning * into v_row;

  -- 0/0 = "geen rem". De vorm blijft staan voor de route; de betekenis is leeg.
  return query select true, 0, 0, pg_catalog.to_jsonb(v_row);
end;
$$;

-- `create or replace` laat bestaande rechten ongemoeid (alleen een NIEUWE functie
-- krijgt EXECUTE aan PUBLIC). Toch expliciet herhaald: het eindresultaat staat zo
-- in dit bestand zwart op wit, en het is idempotent. `anon` krijgt niets — melden
-- vereist een sessie. `service_role` krijgt niets — dat pad heeft geen
-- `auth.uid()` en zou hier alleen een exception oogsten.
revoke all on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) to authenticated;

comment on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) is
  'Voegt één melding toe namens de ingelogde gebruiker. De rem van 5 per rollend uur is per 20260918210000 VERVALLEN (ADR 0159): melden is onbegrensd, slot_allowed is altijd true en slot_used/slot_limit zijn 0 ("geen rem"). De return-vorm bleef staan zodat app/api/user-reports/route.ts ongewijzigd blijft werken; die route houdt zijn 429-tak als vangrail voor een eventuele correctiemigratie die de rem herstelt. De functie blijft wél het ENIGE insert-pad op user_reports (de eigen-rij INSERT-policy is sinds 20260806161500 opgeheven en komt niet terug): gebruiker en e-mailadres komen uit de sessie resp. auth.users en zijn geen parameters, zodat niemand op andermans naam kan melden. security definer omdat de aanroeper geen insert-recht op de tabel heeft.';

comment on table public.user_reports is
  'Meldingen van testgebruikers (bug/vraag/aanbeveling) vanuit de chat-header. Supabase-first: de melding wordt hier vastgelegd voordat de best-effort push naar de Notion Trifinity-queue plaatsvindt, zodat een falend extern koppelvlak nooit een melding kost. RLS: eigen-rij select, superadmin leest en triageert; sync-velden worden alleen via de service-role geschreven. INVOEGEN kan sinds 20260806161500 UITSLUITEND via public.reserve_user_report_slot() — die functie stelt melder en e-mailadres gezaghebbend vast; de eigen-rij INSERT-policy blijft opgeheven. De rem van 5 meldingen per rollend uur die daar oorspronkelijk in zat, is per 20260918210000 vervallen (ADR 0159) — melden is onbegrensd. Bewust een eigen tabel naast public.feedback — andere levenscyclus (verlaat het systeem) en eigen syncstate.';
