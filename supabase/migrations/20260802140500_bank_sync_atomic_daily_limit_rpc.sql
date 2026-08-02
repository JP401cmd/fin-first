-- Atomaire dagteller voor de bank-synchronisatie (restrisico SC-26).
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- `POST /api/bank-connect/sync` bewaakte de rem van 10 synchronisaties per dag
-- per rekening met drie losse stappen in applicatiecode:
--
--   1. SELECT  bank_connection_accounts  → `daily_requests`
--   2. if (daily_requests >= 10) → 429
--   3. UPDATE  set daily_requests = <gelezen waarde> + 1
--
-- Dat is een klassieke TOCTOU. Twee gelijktijdige syncs (twee tabbladen, een
-- dubbelklik, een herhaald verzoek na een timeout) lezen in stap 1 dezelfde
-- waarde, concluderen in stap 2 allebei dat er ruimte is, en schrijven in stap 3
-- allebei `n + 1` — de tweede overschrijft de eerste. Netto: twee syncs, teller
-- +1. De limiet was daarmee geen limiet maar een suggestie.
--
-- ── Waarom dat duur is ────────────────────────────────────────────────────────
-- Onze 10/dag is niet de strengste rem in de keten: daarachter zit de
-- bank-eigen verzoeklimiet. Rabobank antwoordde `provider_request_limit_exceeded`
-- (429) al na een handvol historische ophaalvragen en blokkeert de rekening dan
-- voor langere tijd. Sinds de eerste ophaal in blokken werkt kost ÉÉN sync tot
-- vijf provider-verzoeken (zie 20260729182316_bank_sync_log_provider_requests),
-- dus elke sync die stil langs de teller glipt is niet één verzoek te veel maar
-- vijf. Onze teller is precies de bescherming die dat moet voorkomen.
--
-- ── De oplossing: één statement, geen venster ─────────────────────────────────
-- Lezen, controleren en ophogen gebeuren nu in ÉÉN `UPDATE … WHERE … RETURNING`
-- binnen deze functie. Postgres neemt daarvoor een rijvergrendeling op de
-- betrokken rij; een tweede sessie die dezelfde rij wil bijwerken WACHT tot de
-- eerste commit en her-evalueert daarna (READ COMMITTED/EvalPlanQual) zowel de
-- `where`-voorwaarde als de `set`-expressie tegen de NIEUWE rijversie. De
-- limietcontrole zit in die `where`, dus de tweede sessie ziet de opgehoogde
-- stand en werkt 0 rijen bij → geweigerd. Er is geen moment tussen "gelezen" en
-- "geschreven" waarin een ander verzoek zich ertussen kan wringen.
--
-- Waarom een functie en niet de kale UPDATE vanuit de route: we moeten drie
-- uitkomsten kunnen onderscheiden (bestaat niet/niet van jou · limiet bereikt ·
-- toegestaan), en een 0-rijen-UPDATE alleen kan die drie niet uit elkaar houden.
-- Het onderscheid bepaalt 404 vs. 429, en 429 moet de actuele stand meegeven.
--
-- ── De dagrolgrens: Europe/Amsterdam, niet UTC ────────────────────────────────
-- De route berekende de dagsleutel met `new Date().toISOString().split('T')[0]`,
-- dus in UTC. Voor een gebruiker in Nederland rolde de teller daardoor niet om
-- middernacht maar om 02:00 (zomertijd) respectievelijk 01:00 (wintertijd) —
-- precies het soort verrassing waar niemand op rekent ("ik heb vandaag nog niets
-- gesynchroniseerd en toch staat de teller op 7"). De dagsleutel wordt hier
-- daarom in de database bepaald, in `Europe/Amsterdam`, en is daarmee ook
-- ongevoelig voor de tijdzone van de Vercel-lambda die toevallig het verzoek
-- afhandelt.
--
-- Eenmalig randgeval bij uitrol: bestaande rijen dragen nog een UTC-dagsleutel.
-- Tussen 00:00 en 02:00 Nederlandse tijd verschilt die één dag van de nieuwe
-- sleutel, waardoor de teller daar één keer vroeg terugvalt naar 0. Dat is de
-- coulante kant van de vergissing en duurt hooguit één nacht; de omgekeerde
-- (iemand onterecht blokkeren) kan niet gebeuren.
--
-- `rate_limit_reset_date` blijft bewust `text`: PostgREST levert een `date` óók
-- als 'YYYY-MM-DD'-string, dus een typewissel zou niets toevoegen maar wel een
-- `alter column … type` op een productietabel vragen. De betekenis van de kolom
-- verandert (UTC-dag → Amsterdam-dag) en staat daarom in de kolom-comment.
--
-- ── Het niveau waarop geteld wordt: per rekening ──────────────────────────────
-- Geverifieerd, want "de limiet werkt niet zoals gedocumenteerd" begint meestal
-- hier. De teller staat op `bank_connection_accounts`, één rij per gekoppelde
-- bankrekening — niet per gebruiker en niet per `bank_connections`-rij (die
-- draagt de toestemming en kan meerdere rekeningen omvatten). Twee indexen uit
-- 20260729234928 houden dat niveau ook echt op zijn plek:
--   · `bank_connection_accounts_one_active_per_bank_account` — hooguit één
--     ACTIEVE koppelrij per TriFinity-rekening, en de sync-route filtert op
--     `is_active`; er kan dus geen tweede teller naast staan voor dezelfde
--     rekening.
--   · `bank_connection_accounts_one_per_external` — één rij per (gebruiker,
--     externe rekening), zodat een herautorisatie de bestaande rij hergebruikt
--     in plaats van met een verse teller op 0 te beginnen.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- `security definer` + `set search_path = ''` (stijl gespiegeld van
-- `guard_bank_connection_target_account`, 20260729222134): de functie moet de
-- rij gezaghebbend kunnen bijwerken en mag niet via search_path te misleiden
-- zijn. Omdat RLS daarmee opzij gaat, valideert de functie de aanroeper ZELF:
-- elke query filtert expliciet op `user_id = auth.uid()`, en zonder sessie
-- (`auth.uid() is null`) weigert ze meteen. Een gebruiker kan dus alleen zijn
-- eigen teller ophogen, en krijgt op andermans id hetzelfde antwoord als op een
-- niet-bestaand id (`slot_found = false`) — geen existentie-orakel.
--
-- De limiet is met opzet GEEN parameter. Zou hij dat zijn, dan kan iedere
-- ingelogde gebruiker de functie rechtstreeks via PostgREST aanroepen met
-- `p_limit = 999999` en de rem opheffen — de rem beschermt ons tegen de bank,
-- dus hij hoort niet in handen van de aanroeper. De waarde wordt teruggegeven
-- (`slot_limit`) zodat route en UI hem kunnen tonen zonder hem te herhalen.
--
-- `revoke … from public` staat er expliciet bij: functies krijgen bij creatie
-- EXECUTE aan PUBLIC en rolspecifiek revoken is dan een no-op (les uit
-- 20260729222421). `service_role` krijgt geen grant — dat pad heeft geen
-- `auth.uid()` en zou hier alleen maar een exception oogsten; systeemschrijven
-- op deze tabel loopt niet via de rem.
create or replace function public.reserve_bank_sync_slot(
  p_connection_account_id uuid
)
returns table (
  slot_found          boolean,
  slot_allowed        boolean,
  slot_daily_requests integer,
  slot_limit          integer,
  slot_day_key        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- De rem zelf. Bewust hier en niet in de signatuur: zie de kop.
  v_limit   constant integer := 10;
  v_user    uuid    := auth.uid();
  v_day_key text    := to_char((now() at time zone 'Europe/Amsterdam')::date, 'YYYY-MM-DD');
  v_count   integer;
  v_rows    integer;
begin
  if v_user is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- HET hart van deze migratie. Controle en ophoging staan in hetzelfde
  -- statement, dus er bestaat geen tussenliggende toestand die een gelijktijdig
  -- verzoek kan lezen. De dagrol zit in dezelfde `case`: is de opgeslagen
  -- dagsleutel niet de huidige, dan is dit het eerste verzoek van vandaag en
  -- start de teller op 1 — ongeacht wat er gisteren stond.
  update public.bank_connection_accounts as a
     set daily_requests = case
                            when a.rate_limit_reset_date is distinct from v_day_key then 1
                            else a.daily_requests + 1
                          end,
         rate_limit_reset_date = v_day_key,
         updated_at = now()
   where a.id = p_connection_account_id
     and a.user_id = v_user
     and a.is_active
     and (
           -- Nieuwe dag = altijd ruimte; anders alleen onder de limiet.
           a.rate_limit_reset_date is distinct from v_day_key
           or a.daily_requests < v_limit
         )
  returning a.daily_requests into v_count;

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    return query select true, true, v_count, v_limit, v_day_key;
    return;
  end if;

  -- Nul rijen bijgewerkt. Twee mogelijke redenen, en het verschil bepaalt of de
  -- route 404 of 429 antwoordt. Dezelfde filters als hierboven, minus de
  -- limietvoorwaarde: vindt deze query wél een rij, dan was de limiet de reden.
  select case
           when a.rate_limit_reset_date is distinct from v_day_key then 0
           else a.daily_requests
         end
    into v_count
  from public.bank_connection_accounts as a
  where a.id = p_connection_account_id
    and a.user_id = v_user
    and a.is_active;

  if not found then
    return query select false, false, 0, v_limit, v_day_key;
  else
    return query select true, false, v_count, v_limit, v_day_key;
  end if;
end;
$$;

revoke all on function public.reserve_bank_sync_slot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_bank_sync_slot(uuid) to authenticated;

comment on function public.reserve_bank_sync_slot(uuid) is
  'Reserveert atomair één sync-tik op de dagteller van een gekoppelde bankrekening (10 per dag per rekening, dagsleutel in Europe/Amsterdam). Vervangt de read-then-write in app/api/bank-connect/sync: controle en ophoging zitten in één UPDATE ... WHERE ... RETURNING, zodat twee gelijktijdige syncs samen nooit meer dan de limiet doorlaten. security definer met eigen aanroepervalidatie op auth.uid(); de limiet is geen parameter zodat een directe PostgREST-aanroep hem niet kan oprekken. Geeft (slot_found, slot_allowed, slot_daily_requests, slot_limit, slot_day_key) terug.';

comment on column public.bank_connection_accounts.daily_requests is
  'Aantal synchronisaties vandaag op DEZE gekoppelde rekening (rem: 10 per dag per rekening, tegen de veel strengere bank-eigen verzoeklimiet). Alleen ophogen via public.reserve_bank_sync_slot() — die doet controle en ophoging in één statement; de vroegere read-then-write in de sync-route was een TOCTOU waardoor twee gelijktijdige syncs samen maar +1 telden. Staat los van bank_sync_log.provider_requests, dat het echte aantal HTTP-verzoeken aan de bank meet (één sync = tot vijf verzoeken).';

comment on column public.bank_connection_accounts.rate_limit_reset_date is
  'Dagsleutel (YYYY-MM-DD) waarvoor daily_requests geldt; is hij niet gelijk aan vandaag, dan start de teller opnieuw. Sinds deze migratie in Europe/Amsterdam bepaald door public.reserve_bank_sync_slot() en niet meer in UTC door de route — met een UTC-sleutel rolde de teller voor een Nederlandse gebruiker pas om 01:00/02:00 in plaats van om middernacht. Blijft text (PostgREST levert een date net zo goed als YYYY-MM-DD-string); enige schrijver is de RPC.';
