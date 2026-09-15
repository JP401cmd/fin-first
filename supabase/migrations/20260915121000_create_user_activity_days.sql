-- App-gebruik zonder inhoud: één rij per gebruiker per actieve dag.
-- Eigenaarsbesluit 14/15-09-2026, ADR 0146 "Beheer ziet gebruik, geen inhoud".
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Beheer mag weten DAT en HOE VAAK de app gebruikt wordt (DAU/WAU/MAU, actieve
-- dagen per gebruiker), niet WAT iemand erin vastlegt. Deze tabel is het hele
-- datamodel daarvoor: een gebruikers-id en een kalenderdag. Geen route, geen
-- tijdstip binnen de dag, geen apparaat, geen bedrag, geen tekst. Wat hier niet
-- in staat, kan beheer via deze weg ook niet zien.
--
-- De dag is de Nederlandse kalenderdag (`Europe/Amsterdam`), niet de UTC-dag:
-- een bezoek om 00:30 's nachts hoort bij de dag die de gebruiker zelf beleeft.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- PERSOONLIJK, geen huishouddeling. Drie eigen-rij policies, alle
-- `TO authenticated`:
--
--   INSERT  — `user_id = auth.uid()` én `day = vandaag (Amsterdam)`. De tweede
--             voorwaarde verbiedt backdaten en vooruitschrijven: een gebruiker
--             kan zijn eigen actieve dagen niet opblazen of verplaatsen, alleen
--             "vandaag was ik er" melden.
--   SELECT  — eigen rijen, voor de AVG-zelfexport (art. 15/20) via de
--             sessie-client in app/api/account/export.
--   DELETE  — eigen rijen, voor de sessie-wis (`deleteAllUserData`, reset en
--             volledige verwijdering). Dat een gebruiker zijn eigen historie kan
--             wissen is bedoeld: het is zijn persoonsgegeven, geen audit-log.
--
-- Geen UPDATE-policy: een actieve dag is een feit, er is niets te wijzigen.
-- De table-grant UPDATE wordt daarnaast ingetrokken, zodat een poging een 42501
-- geeft in plaats van een stille nul.
--
-- GEEN superadmin-policy. Beheer leest uitsluitend via de service-role
-- (ADR 0006), en dan alleen geaggregeerd via `admin_activity_counts()`
-- hieronder. Een RLS-tak voor superadmins zou precies het soort
-- browser-leespad openen dat ADR 0146 op `app_settings` sluit.
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
-- `POST /api/sync/daily-open` (de bestaande eerste-open-van-de-dag-aanroep, via
-- lib/activity/record-activity-day.ts) doet met de SESSIE-client
--   .from('user_activity_days')
--   .upsert({ user_id }, { onConflict: 'user_id,day', ignoreDuplicates: true })
-- Dat wordt `INSERT (user_id) … ON CONFLICT (user_id, day) DO NOTHING` met
-- `Prefer: return=minimal`. Postgres eist voor ON CONFLICT DO NOTHING alleen de
-- INSERT-policy (de SELECT-policy is pas nodig bij DO UPDATE of RETURNING); en
-- mocht PostgREST toch iets teruggeven, dan dekt de eigen-rij SELECT-policy de
-- nieuw ingevoegde rij. `day` komt uit de kolom-default en valt in hetzelfde
-- statement — dus op dezelfde `now()` — als de WITH CHECK: geen middernachtsrace.
--
-- ── Retentie ──────────────────────────────────────────────────────────────────
-- 400 dagen, gepurged door de bestaande retentie-cron (app/api/cron/retention,
-- termijn in lib/retention.ts). Ruim een jaar, zodat een jaar-op-jaar-vergelijking
-- van MAU mogelijk blijft; langer is niet nodig.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Ingedeeld in lib/user-data-tables.ts (SESSION_WIPE_TABLES → wis én export) en
-- gewist in lib/seed-persona.ts#deleteAllUserData. FK op auth.users met
-- ON DELETE CASCADE: bij verwijdering van het account blijft er niets achter.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Nieuwe tabel + nieuwe functie, niets bestaands geraakt: mag vóór de code.
-- Andersom is ook veilig: de schrijver slikt fouten in en de beheerview toont
-- "nog niet gemeten" zolang de relatie ontbreekt.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie met `drop function public.admin_activity_counts();` en
-- `drop table public.user_activity_days;` — pas nadat de schrijver, de
-- beheerview en de regels in lib/user-data-tables.ts / lib/seed-persona.ts /
-- lib/retention.ts zijn verwijderd (anders faalt de retentie-cron op die tabel).

create table if not exists public.user_activity_days (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null default ((now() at time zone 'Europe/Amsterdam')::date),
  primary key (user_id, day)
);

comment on table public.user_activity_days is
  'Eén rij per gebruiker per actieve Amsterdamse kalenderdag. Gebruik zonder inhoud '
  '(ADR 0146). Eigen-rij INSERT (alleen vandaag), SELECT en DELETE; beheer leest '
  'alleen geaggregeerd via admin_activity_counts() met de service-role.';

-- De PK (user_id, day) dekt lookups per gebruiker; de tellingen filteren op dag.
create index if not exists user_activity_days_day_idx
  on public.user_activity_days (day);

alter table public.user_activity_days enable row level security;

-- Least privilege op grant-niveau. Supabase geeft nieuwe tabellen standaard ALL
-- aan anon en authenticated (gemeten via pg_default_acl, 15-09-2026). Anon
-- heeft hier niets te zoeken; authenticated houdt precies wat de policies
-- toestaan.
--
-- LEAK-CHECK — BEWUSTE AFWIJKING van het huiscontract "anon: 0 rijen én géén
-- fout": omdat anon hier géén tabel-grant heeft, is het VERWACHTE resultaat
-- voor anon een 42501 (permission denied), geen lege set. Dat is geen
-- rolset-regressie maar least privilege. Een leak-test op deze tabel hoort
-- 42501 te asserten.
revoke all on table public.user_activity_days from anon;
revoke update, truncate, references, trigger on table public.user_activity_days from authenticated;

drop policy if exists "user_activity_days own insert" on public.user_activity_days;
create policy "user_activity_days own insert" on public.user_activity_days
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and day = ((now() at time zone 'Europe/Amsterdam')::date)
  );

drop policy if exists "user_activity_days own select" on public.user_activity_days;
create policy "user_activity_days own select" on public.user_activity_days
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_activity_days own delete" on public.user_activity_days;
create policy "user_activity_days own delete" on public.user_activity_days
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── admin_activity_counts() ───────────────────────────────────────────────────
-- DAU / WAU / MAU als drie getallen: aantal verschillende gebruikers met een
-- actieve dag op vandaag, in de laatste 7 en in de laatste 30 Amsterdamse
-- kalenderdagen (vandaag inbegrepen). Geeft geen enkel gebruikers-id terug.
--
-- SECURITY DEFINER met `search_path = ''` en volledig gekwalificeerde namen.
-- De echte poort is de grant: alleen service_role mag uitvoeren. Daarbovenop
-- valideert de functie de aanroeper zelf: komt de aanroep via PostgREST met een
-- JWT-rol die geen service_role is, dan 42501. Zonder JWT-context
-- (`auth.role()` is NULL: een directe databaseverbinding als postgres, bv. de
-- SQL-editor) is de aanroeper al bevoorrecht en wordt hij doorgelaten.
create or replace function public.admin_activity_counts()
returns table (dau integer, wau integer, mau integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol     text := auth.role();
  v_vandaag date := (pg_catalog.now() at time zone 'Europe/Amsterdam')::date;
begin
  if v_rol is not null and v_rol <> 'service_role' then
    raise exception 'admin_activity_counts: alleen voor service_role'
      using errcode = '42501';
  end if;

  return query
  select
    (count(distinct a.user_id) filter (where a.day = v_vandaag))::integer,
    (count(distinct a.user_id) filter (where a.day >= v_vandaag - 6))::integer,
    (count(distinct a.user_id))::integer
  from public.user_activity_days a
  where a.day >= v_vandaag - 29;
end;
$$;

comment on function public.admin_activity_counts() is
  'DAU/WAU/MAU (Amsterdamse kalenderdagen) uit user_activity_days, zonder gebruikers-ids. '
  'Alleen service_role (ADR 0146).';

revoke all on function public.admin_activity_counts() from public;
revoke all on function public.admin_activity_counts() from anon;
revoke all on function public.admin_activity_counts() from authenticated;
grant execute on function public.admin_activity_counts() to service_role;
