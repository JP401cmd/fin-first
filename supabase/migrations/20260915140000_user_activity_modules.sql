-- App-gebruik per app-deel, zonder inhoud: één rij per gebruiker per actieve dag
-- per app-deel. ADR 0147 fase 2 ("waardestromen"), op de grens van ADR 0146
-- "Beheer ziet gebruik, geen inhoud".
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Twee afnemers:
--   1. De regel `dominante_stroom` in de vragenlijstverspreiding: in welke
--      waardestroom (door beheer benoemde bundel app-delen, lib/waardestromen.ts)
--      was DEZE gebruiker de afgelopen 30 dagen op de meeste dagen actief?
--      Compute-on-read in GET /api/questionnaires met de SESSIE-client van die
--      gebruiker (lib/questionnaires/gebruiker-context.ts).
--   2. Beheer: hoeveel verschillende gebruikers gebruikten elk app-deel in de
--      laatste 30 dagen — uitsluitend als telling via
--      `admin_module_activity_counts()` hieronder.
--
-- Het datamodel is dezelfde grens als `user_activity_days`, precies één niveau
-- fijner: gebruikers-id, kalenderdag, app-deel. Geen route, geen tijdstip binnen
-- de dag, geen aantal bezoeken, geen tijd-op-pagina, geen apparaat, geen inhoud.
--
-- WAAROM EEN GESLOTEN LIJST. `module` heeft een CHECK met exact de 11 sleutels
-- uit `ACTIVITY_MODULES` in lib/activity/modules.ts. Een vrije tekstkolom zou van
-- deze tabel met één clientwijziging (of één handgeschreven POST) een route-log
-- maken — `/overzicht/bezittingen/<uuid>`, zoektermen in querystrings — en dat is
-- precies wat ADR 0146 uitsluit. De database dwingt de grens af, niet alleen de
-- zod-enum in de route. Een nieuwe sleutel = een nieuwe migratie + die lijst, in
-- één PR.
--
-- De dag is de Nederlandse kalenderdag (`Europe/Amsterdam`), gelijk aan
-- `user_activity_days`, zodat "actief op dag X" in beide tabellen hetzelfde
-- betekent.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- PERSOONLIJK, geen huishouddeling. Drie eigen-rij policies, alle
-- `TO authenticated`, identiek aan `user_activity_days` (20260915121000):
--
--   INSERT  — `user_id = auth.uid()` én `day = vandaag (Amsterdam)`. Geen
--             backdaten, geen vooruitschrijven: een gebruiker kan alleen melden
--             "vandaag gebruikte ik dit app-deel". Hij kan zijn eigen dominante
--             stroom daarmee hooguit sturen door de app echt anders te gebruiken
--             — dat is geen winst, want de regel is een verspreidingsvoorkeur,
--             geen toegangsgrens (ADR 0147 besluit 1).
--   SELECT  — eigen rijen: de dominante-stroomberekening in GET
--             /api/questionnaires en de AVG-zelfexport (art. 15/20) via de
--             sessie-client.
--   DELETE  — eigen rijen, voor de sessie-wis (`deleteAllUserData`: reset en
--             volledige verwijdering). Zijn eigen historie wissen mag: het is
--             zijn persoonsgegeven, geen audit-log.
--
-- Geen UPDATE-policy én de UPDATE-grant ingetrokken: een gebruikt app-deel op
-- een dag is een feit; een poging geeft 42501 in plaats van een stille nul.
--
-- GEEN superadmin-tak. Bewust gemeten vóór spiegelen: de oudere
-- vragenlijsttabellen dragen nog een superadmin-tak van vóór ADR 0146; die wordt
-- hier niet gekopieerd. Beheer leest uitsluitend via de service-role (ADR 0006),
-- en dan alleen geaggregeerd via `admin_module_activity_counts()`. Een
-- RLS-leespad voor superadmins zou vanuit de browser per persoon laten zien welk
-- app-deel iemand op welke dag gebruikte — fijner dan ADR 0146 beheer toestaat.
--
-- ── Schrijfpad ────────────────────────────────────────────────────────────────
-- `POST /api/activity/module` (zod-enum op dezelfde 11 sleutels) doet met de
-- SESSIE-client
--   .from('user_activity_modules')
--   .upsert({ user_id, module }, { onConflict: 'user_id,day,module', ignoreDuplicates: true })
-- = `INSERT (user_id, module) … ON CONFLICT (user_id, day, module) DO NOTHING`,
-- `Prefer: return=minimal`. Voor DO NOTHING eist Postgres alleen de
-- INSERT-policy; de eigen-rij SELECT-policy dekt de nieuwe rij mocht PostgREST
-- toch iets teruggeven. `day` komt uit de kolom-default in hetzelfde statement —
-- dezelfde `now()` als de WITH CHECK — dus geen middernachtsrace.
-- Gevoed door een client-tracker per pathname-wissel (`moduleVanPad`, met een
-- sessionStorage-gate per dag+module zodat er niet bij elke navigatie een POST
-- gaat) en door het chatvenster zelf (`fin`, dat geen route heeft).
-- Geen ander pad schrijft deze tabel.
--
-- ── Retentie ──────────────────────────────────────────────────────────────────
-- 400 dagen op de kolom `day`, gepurged door de bestaande retentie-cron
-- (app/api/cron/retention, termijn in lib/retention.ts) — dezelfde termijn en
-- dezelfde cutoff-kolom als `user_activity_days`.
--
-- ── AVG ───────────────────────────────────────────────────────────────────────
-- Persoonsgegeven (user_id + gebruiksgedrag). Ingedeeld in lib/user-data-tables.ts
-- als SESSION_WIPE_TABLES (wis én zelfexport; er is een eigen-rij DELETE-policy)
-- en gewist in lib/seed-persona.ts#deleteAllUserData. FK op auth.users met
-- ON DELETE CASCADE: bij accountverwijdering blijft er niets achter. Het gebruik
-- ervan als targeting-meta is lichte profilering onder gerechtvaardigd belang
-- (ADR 0147, Gevolgen/AVG) en moet in /privacy genoemd worden — zie hieronder.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- NIET vóór de /privacy-aanpassing die de meting van app-gebruik per app-deel
-- noemt (Grenswachter-route). Dat is dezelfde poort als 20260915121000
-- (user_activity_days), en die staat op het moment van schrijven ook nog dicht.
-- De code is tolerant zolang de tabel ontbreekt: de tracker en de route slikken
-- fouten, en `dominante_stroom` leest dan `null` en matcht nooit (fail-closed —
-- liever een uitnodiging die later verschijnt dan één te veel). Andersom (tabel
-- vóór code) is technisch veilig: de tabel blijft dan leeg.
-- Deze migratie hangt NIET af van 20260915121000: geen FK, geen functie, geen
-- policy verwijst ernaar; ze kunnen in willekeurige volgorde worden uitgerold.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie met
--   drop function if exists public.admin_module_activity_counts();
--   drop table if exists public.user_activity_modules;
-- — pas nadat de schrijver (route + tracker + chatmelding), het retentieblok in
-- lib/retention.ts en de regels in lib/user-data-tables.ts /
-- lib/seed-persona.ts zijn verwijderd (anders faalt de retentie-cron of de
-- wisroutine op een ontbrekende relatie). Een regel `dominante_stroom` in een
-- bestaande vragenlijst matcht daarna nooit meer (fail-closed).
--
-- ── LEAK-CHECK ────────────────────────────────────────────────────────────────
-- BEWUSTE AFWIJKING van het huiscontract "anon: 0 rijen én géén fout", identiek
-- aan 20260915121000: anon heeft hier géén tabelgrant, dus het VERWACHTE resultaat
-- voor anon is 42501 (permission denied), geen lege set. Verwachtingen:
--   * anon select/insert                                   → 42501
--   * authenticated A leest rijen van B                    → 0 rijen, geen fout
--   * authenticated A insert met user_id = B               → 42501 (RLS WITH CHECK)
--   * authenticated A insert met day ≠ vandaag             → 42501 (RLS WITH CHECK)
--   * authenticated A insert met module = '/beheer'        → 23514 (CHECK)
--   * authenticated A update eigen rij                     → 42501 (geen grant)
--   * authenticated rpc admin_module_activity_counts()     → 42501 (geen EXECUTE)
--
-- ── Live gemeten vóór schrijven (15-09-2026, read-only via execute_sql) ───────
--   * `list_migrations`: laatst toegepast = 20260915131000 (questionnaire_invitations);
--     20260915120000 en 20260915130000 óók toegepast; 20260915121000 en
--     20260915122000 NIET toegepast.
--   * `to_regclass('public.user_activity_modules')` = NULL en
--     `to_regclass('public.user_activity_days')` = NULL: geen van beide bestaat.
--   * `pg_proc`: `public.admin_activity_counts` bestaat NIET live (121000 is niet
--     toegepast); het patroon van rolcheck + grants hieronder is daarom
--     overgenomen uit het repobestand 20260915121000, niet uit de database.
--     `public.admin_module_activity_counts` bestaat evenmin.
--   * `auth.role()` bestaat (pg_proc, schema auth).
--   * `pg_default_acl` (rol postgres, schema public): tabellen `arwdDxtm` en
--     functies `X` voor anon én authenticated. Nieuwe objecten zijn dus standaard
--     open; alles hieronder wordt expliciet ingetrokken.
--   * `server_version` = 17.6: het privilege MAINTAIN (`m`) bestaat en zit in die
--     default-ACL; het wordt hier daarom óók ingetrokken van authenticated
--     (`has_table_privilege('authenticated', 'public.questionnaire_invitations',
--     'MAINTAIN')` = true — de buurmigraties laten het staan).

create table if not exists public.user_activity_modules (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null default ((now() at time zone 'Europe/Amsterdam')::date),
  module     text        not null,
  -- Bewust GEEN created_at: dat zou het tijdstip van eerste gebruik die dag
  -- vastleggen, en "geen tijdstip binnen de dag" is precies de belofte. Niets
  -- leest hem; de retentie-purge loopt op `day` (security-review 15-09-2026).
  primary key (user_id, day, module),
  -- Exact ACTIVITY_MODULES uit lib/activity/modules.ts. Gesloten lijst: geen
  -- route-log via vrije tekst (zie kop).
  constraint user_activity_modules_module_check check (module in (
    'overzicht',
    'bezittingen',
    'schulden',
    'budget',
    'belasting',
    'toekomst',
    'rapportages',
    'berichten',
    'nieuws',
    'mijn',
    'fin'
  ))
);

comment on table public.user_activity_modules is
  'Eén rij per gebruiker per actieve Amsterdamse kalenderdag per app-deel (gesloten lijst, '
  'ADR 0147 fase 2). Gebruik zonder inhoud (ADR 0146). Eigen-rij INSERT (alleen vandaag), '
  'SELECT en DELETE; beheer leest alleen geaggregeerd via admin_module_activity_counts() '
  'met de service-role.';

comment on column public.user_activity_modules.module is
  'App-deel, exact een sleutel uit ACTIVITY_MODULES (lib/activity/modules.ts). Nooit een route.';

-- De PK (user_id, day, module) dekt de eigen-rij lezing
-- (`user_id = me and day >= …`). Deze index dient de rest: het venster en de
-- groepering per module in admin_module_activity_counts() (index-only scan
-- mogelijk dankzij user_id als laatste kolom) én de retentie-purge op `day`.
-- Een losse (day)-index zou daarnaast redundant zijn.
create index if not exists user_activity_modules_day_module_idx
  on public.user_activity_modules (day, module, user_id);

alter table public.user_activity_modules enable row level security;

-- Least privilege op grant-niveau (zie "Live gemeten": default-ACL is open).
revoke all on table public.user_activity_modules from anon;
revoke update, truncate, references, trigger, maintain on table public.user_activity_modules from authenticated;

drop policy if exists "user_activity_modules own insert" on public.user_activity_modules;
create policy "user_activity_modules own insert" on public.user_activity_modules
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and day = ((now() at time zone 'Europe/Amsterdam')::date)
  );

drop policy if exists "user_activity_modules own select" on public.user_activity_modules;
create policy "user_activity_modules own select" on public.user_activity_modules
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_activity_modules own delete" on public.user_activity_modules;
create policy "user_activity_modules own delete" on public.user_activity_modules
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── admin_module_activity_counts() ────────────────────────────────────────────
-- Per app-deel: het aantal verschillende gebruikers dat dat deel gebruikte in de
-- laatste 30 Amsterdamse kalenderdagen (vandaag inbegrepen). Geeft geen enkel
-- gebruikers-id terug. Alleen app-delen met minstens één gebruiker komen terug;
-- de afnemer vult de ontbrekende sleutels uit ACTIVITY_MODULES aan met 0 (zo
-- staat de lijst niet nóg een keer in SQL).
--
-- SECURITY DEFINER met `search_path = ''` en volledig gekwalificeerde namen,
-- zelfde vorm als admin_activity_counts() in 20260915121000. De echte poort is de
-- grant: alleen service_role mag uitvoeren. Daarbovenop valideert de functie de
-- aanroeper: via PostgREST met een JWT-rol die geen service_role is → 42501.
-- Zonder JWT-context (`auth.role()` is NULL: directe databaseverbinding als
-- postgres, bv. de SQL-editor) is de aanroeper al bevoorrecht en mag hij door.
create or replace function public.admin_module_activity_counts()
returns table (module text, gebruikers integer)
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
    raise exception 'admin_module_activity_counts: alleen voor service_role'
      using errcode = '42501';
  end if;

  return query
  select
    m.module,
    (count(distinct m.user_id))::integer
  from public.user_activity_modules m
  where m.day >= v_vandaag - 29
  group by m.module
  order by m.module;
end;
$$;

comment on function public.admin_module_activity_counts() is
  'Aantal verschillende gebruikers per app-deel in de laatste 30 Amsterdamse kalenderdagen, '
  'uit user_activity_modules, zonder gebruikers-ids. Alleen service_role (ADR 0146/0147).';

revoke all on function public.admin_module_activity_counts() from public;
revoke all on function public.admin_module_activity_counts() from anon;
revoke all on function public.admin_module_activity_counts() from authenticated;
grant execute on function public.admin_module_activity_counts() to service_role;
