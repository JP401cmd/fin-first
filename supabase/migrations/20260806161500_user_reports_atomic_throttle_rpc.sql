-- Atomaire uurteller voor meldingen van testgebruikers (derde vindplaats van ADR 0076).
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- `POST /api/user-reports` bewaakte de rem van 5 meldingen per uur per gebruiker
-- met twee losse stappen in applicatiecode:
--
--   1. SELECT count(*) FROM user_reports WHERE user_id = … AND created_at >= nu-1u
--   2. if (count >= 5) → 429   … en verderop pas: INSERT
--
-- Dezelfde TOCTOU als bij de bank-synchronisatie (20260802140500) en de
-- AI-rekenhulp (20260803090000). N gelijktijdige verzoeken lezen in stap 1
-- allemaal dezelfde stand — bij een verse gebruiker allemaal 0 — concluderen
-- allemaal dat er ruimte is, en voegen allemaal in. De rem was daarmee geen rem
-- maar een suggestie. Het venster is hier bovendien RUIM: tussen de telling en
-- de insert zitten het uitpakken van een multipart-body van maximaal 4 MB, de
-- zod-validatie én een storage-upload.
--
-- ── En een tweede, groter gat: de rem zat alleen in de route ──────────────────
-- De telling stond in TypeScript, maar de INSERT stond open via de policy
-- `user_reports own insert` (eigen `user_id`). Elke ingelogde gebruiker kon dus
-- rechtstreeks via PostgREST invoegen en de rem VOLLEDIG overslaan — niet in een
-- race, gewoon door de route niet te gebruiken. Race-vrij maken van een limiet
-- die je ernaast kunt omzeilen is halve winst; daarom sluit deze migratie ook
-- het directe insert-pad. Na deze migratie is `public.reserve_user_report_slot`
-- de ENIGE manier waarop een gebruiker een melding kan aanmaken, en de rem staat
-- ín dat pad.
--
-- ── Waarom hier GEEN `insert … on conflict do update … where`-teller ──────────
-- De twee eerdere vindplaatsen hingen aan een tellerRIJ (per rekening per dag,
-- per gebruiker per week). Daar levert `on conflict do update … where` de
-- atomiciteit: de tweede sessie botst op de unieke index, wacht op de commit van
-- de eerste, en her-evalueert de `where` tegen de nieuwe rijversie.
--
-- Die truc werkt hier NIET. De rem is een telling over een ROLLEND VENSTER van
-- rijen ("hoeveel meldingen in het laatste uur"), niet een getal in een kolom.
-- Er is geen rij om op te botsen, en `insert … select … where (select count(*) …)
-- < 5` is onder READ COMMITTED aantoonbaar NIET atomair: een INSERT neemt geen
-- vergrendeling die een andere sessie doet wachten, en niet-gecommitte rijen
-- tellen niet mee in elkaars snapshot. Twee gelijktijdige verzoeken zien dan
-- allebei 4 en voegen allebei in — exact de fout die we opruimen. Een teller-
-- tabel erbij verzinnen zou de semantiek stilletjes veranderen van een rollend
-- uur naar een vast uurvak (om 13:59 vijf melden en om 14:01 nog eens vijf).
--
-- De oplossing die het rollende venster WEL intact laat, is een
-- transactiegebonden advisory lock op de gebruiker. Die serialiseert de
-- telling+insert per gebruiker: de tweede sessie wacht tot de eerste commit en
-- telt daarna de zojuist ingevoegde rij gewoon mee. De lock is per gebruiker
-- (niet per tabel), dus twee verschillende melders hinderen elkaar nooit; hij
-- wordt automatisch vrijgegeven bij commit óf rollback, dus een klappende
-- transactie kan geen lock laten staan.
--
-- Sleutel: de tweeledige vorm `(hashtext('user_reports_throttle'), hashtext(uuid))`
-- — het eerste getal is een greppabele naamruimte zodat deze lock nooit botst
-- met een toekomstige advisory lock elders in de codebase. Dit is de eerste
-- advisory lock in dit project (gemeten: geen enkele andere vindplaats,
-- 06-08-2026); de naamruimte-conventie begint hier.
--
-- ── De limiet woont hier, niet in TypeScript ──────────────────────────────────
-- 5 is met opzet GEEN parameter: de functie staat via PostgREST open voor elke
-- ingelogde gebruiker, en met de limiet als argument kan iedereen de rem zelf
-- ophogen (`p_limit => 999999`). Zelfde redenering als bij
-- `reserve_bank_sync_slot` en `reserve_ai_calculator_slot`. De waarde komt wél
-- terug in de uitkomst (`slot_limit`), zodat route en logging hem kunnen tonen
-- zonder hem te herhalen; `THROTTLE_MAX_PER_HOUR` vervalt daarmee in de route.
--
-- ── Toegangsmodel: `security definer`, bewust ─────────────────────────────────
-- Gespiegeld van `reserve_bank_sync_slot`, en hier onvermijdelijk: de policy
-- `user_reports own insert` verdwijnt in deze migratie, dus de aanroeper HEEFT
-- geen insert-recht meer op de tabel. De functie moet de rij dus gezaghebbend
-- kunnen schrijven. (Bij de AI-rekenhulp kon `security invoker` juist wél, omdat
-- de own-row policy daar exact de benodigde toegang gaf — dat gaat hier per
-- definitie niet meer op.)
--
-- Omdat RLS daarmee opzij gaat, valideert de functie de aanroeper ZELF:
--   * `user_id` komt uit `auth.uid()` en is GEEN parameter — niemand kan op
--     andermans naam melden, ook niet per ongeluk vanuit onze eigen code.
--   * zonder sessie (`auth.uid() is null`) weigert ze meteen.
--   * de telling filtert expliciet op `user_id = v_user`.
--   * `email` komt uit `auth.users` en niet uit een parameter: het is de
--     identiteit van de melder, dus die hoort de database vast te stellen. Zo
--     kan een directe PostgREST-aanroep er ook geen ander adres in zetten.
-- `set search_path = ''`, alles volledig gekwalificeerd — niet te misleiden.
--
-- De CHECK-constraints op de tabel (`report_type`, `notion_sync_status`) blijven
-- de inhoudelijke vangrail voor een directe aanroep; de zod-validatie in de
-- route is een gebruikersvriendelijke voorpost, geen beveiligingsgrens. Dat was
-- vóór deze migratie niet anders — met dit verschil dat de rem nu wél sluit.
--
-- `revoke … from public` staat er expliciet bij: functies krijgen bij creatie
-- EXECUTE aan PUBLIC en rolspecifiek revoken is dan een no-op (les uit
-- 20260729222421). `anon` krijgt niets — melden vereist een sessie.
-- `service_role` krijgt niets: dat pad heeft geen `auth.uid()` en zou hier
-- alleen een exception oogsten; systeemschrijven op deze tabel (de Notion-sync)
-- gaat rechtstreeks en niet via de rem.
--
-- ── UITROLVOLGORDE ────────────────────────────────────────────────────────────
-- Deze migratie is NIET puur additief: ze verwijdert de policy
-- `user_reports own insert`. Normaal zou dat een gesplitste uitrol vragen
-- (RPC toevoegen → code deployen → policy droppen), omdat oude code die
-- rechtstreeks invoegt er anders op stukloopt.
--
-- Dat is hier niet nodig, en dat is expliciet geverifieerd: de hele
-- meldingenfunctie is ONGERELEASED — `app/api/user-reports/`, `lib/user-reports/`
-- en `app/api/cron/user-reports-notion-sync/` staan alle drie nog als untracked
-- in git (gemeten 06-08-2026), dus er draait geen enkele productieversie die het
-- directe insert-pad gebruikt. Er is geen oude code om te beschermen.
--
-- Zou deze tabel ooit wél een live schrijver buiten de RPC krijgen, dan is de
-- volgorde hierboven weer verplicht.

-- ── 1. Het directe insert-pad sluiten ────────────────────────────────────────
-- Vanaf hier kan een gebruiker uitsluitend nog invoegen via de RPC hieronder,
-- die de rem afdwingt. De SELECT-policy (eigen rijen of superadmin) en de
-- superadmin-UPDATE blijven ongemoeid; er was en is geen DELETE-policy.
drop policy if exists "user_reports own insert" on public.user_reports;

comment on table public.user_reports is
  'Meldingen van testgebruikers (bug/vraag/aanbeveling) vanuit de chat-header. Supabase-first: de melding wordt hier vastgelegd voordat de best-effort push naar de Notion Trifinity-queue plaatsvindt, zodat een falend extern koppelvlak nooit een melding kost. RLS: eigen-rij select (die select draagt de throttle-telling), superadmin leest en triageert; sync-velden worden alleen via de service-role geschreven. INVOEGEN kan sinds 20260806161500 UITSLUITEND via public.reserve_user_report_slot() — de eigen-rij INSERT-policy is opgeheven omdat de rem van 5 meldingen per uur anders simpelweg via PostgREST te omzeilen was. Bewust een eigen tabel naast public.feedback — andere levenscyclus (verlaat het systeem) en eigen syncstate.';

-- ── 2. Reserveren + invoegen — atomair ───────────────────────────────────────
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
  -- De rem zelf. Bewust hier en niet in de signatuur: zie de kop.
  v_limit constant integer := 5;
  v_user  uuid := auth.uid();
  v_since timestamptz := now() - interval '1 hour';
  v_count integer;
  v_row   public.user_reports%rowtype;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- HET hart van deze migratie. Serialiseert telling+insert PER GEBRUIKER voor
  -- de rest van deze transactie. Een tweede gelijktijdig verzoek van dezelfde
  -- melder wacht hier tot het eerste gecommit is en telt de nieuwe rij daarna
  -- gewoon mee; verzoeken van andere melders lopen ongehinderd door. De lock
  -- valt vanzelf weg bij commit of rollback.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('user_reports_throttle'),
    pg_catalog.hashtext(v_user::text)
  );

  select count(*)
    into v_count
  from public.user_reports r
  where r.user_id = v_user
    and r.created_at >= v_since;

  if v_count >= v_limit then
    return query select false, v_count, v_limit, null::jsonb;
    return;
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

  -- `v_count` is de stand VÓÓR deze melding; +1 is wat de melder nu verbruikt
  -- heeft. Zo betekent slot_used hetzelfde in beide takken: "zoveel van de
  -- limiet is nu op".
  return query select true, v_count + 1, v_limit, pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) to authenticated;

comment on function public.reserve_user_report_slot(
  uuid, text, text, text, text, boolean, text, text, text, text, text, text
) is
  'Voegt atomair één melding toe binnen de rem van 5 per rollend uur per gebruiker. Vervangt de count-dan-insert in app/api/user-reports: telling en insert staan onder één transactiegebonden advisory lock op de melder, zodat N gelijktijdige verzoeken samen nooit meer dan de limiet doorlaten (de on-conflict-truc van reserve_bank_sync_slot/reserve_ai_calculator_slot werkt hier niet — de rem is een telling over een rollend venster, niet een teller in een kolom). Gebruiker en e-mailadres komen uit de sessie resp. auth.users, niet uit parameters; de limiet is geen parameter zodat een directe PostgREST-aanroep hem niet kan oprekken. security definer, want de eigen-rij INSERT-policy is opgeheven om het omzeilpad te sluiten. Geeft (slot_allowed, slot_used, slot_limit, report) terug, waarbij report de volledige ingevoegde rij als jsonb is (null bij weigering).';
