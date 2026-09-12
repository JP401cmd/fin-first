-- ADR 0139 (aanvulling) · de helper verdwijnt van het REST-oppervlak.
--
-- WAAROM
-- ──────────────────────────────────────────────────────────────────────────────
-- Migratie 20260912120000 zette `public.budget_excluded_account_ids(uuid[])` neer
-- als SECURITY DEFINER-helper van `public.tx_month_aggregate`. Die keuze klopt
-- nog steeds, maar ze had een bijwerking die als "begrensde, geaccepteerde rest"
-- in de ADR stond: alles in schema `public` krijgt van PostgREST automatisch een
-- RPC-eindpunt. De helper was daarmee UITGELOGD aanroepbaar.
--
-- Dat was geen theorie. Gemeten tegen de productie-API met de publishable key,
-- 12-09-2026:
--
--   POST /rest/v1/rpc/budget_excluded_account_ids  → 200, body []
--
-- Een uitgelogde beller kon dus voor een rekening-uuid dat hij al bezat vragen
-- of daarop "budgetteren uit" staat. De uitkomst is mager (geen attributen, en
-- niet te onderscheiden van "dit id bestaat niet"), maar het is een orakel dat
-- niemand nodig heeft — en de Supabase security-advisor vlagde het terecht als
-- de enige anon-aanroepbare definer-functie in dit project.
--
-- WAT ER NIET WERKT, EN WAAROM DIT DE VORM IS
-- ──────────────────────────────────────────────────────────────────────────────
-- De voor de hand liggende reflex — `revoke execute ... from anon` — breekt het
-- aggregaat. Gemeten, 12-09-2026: zonder dat recht geeft een anon-aanroep van
-- `tx_month_aggregate` een harde `42501 permission denied for function
-- budget_excluded_account_ids` in plaats van nul rijen. Dat is precies de
-- gedragsregressie die ADR 0048 en de leak-checkregel verbieden ("0 rijen, géén
-- fout"), en ze treft het reële geval van een sessie die tijdens het renderen
-- net verlopen is.
--
-- Ook een GUARD in het aggregaat lost dat niet op. Geprobeerd en weerlegd
-- (12-09-2026): met `case when cardinality(ids) = 0 then '{}'::uuid[] else
-- public.budget_excluded_account_ids(ids) end` en zonder anon-grant geeft een
-- anon-aanroep nog steeds 42501 — terwijl de `else`-tak aantoonbaar nooit werd
-- genomen (de anon-beller ziet geen transacties, dus de array is leeg). Reden:
-- Postgres toetst EXECUTE-rechten bij EXPRESSIE-INITIALISATIE (`ExecInitFunc`
-- doet de aclcheck voor élke FuncExpr in de boom), niet bij het nemen van de
-- tak. Geen enkele statische formulering kan die check dus uitstellen.
--
-- DE OPLOSSING SCHEIDT DE TWEE DINGEN DIE HIER DOOR ELKAAR LIEPEN: het RECHT om
-- de functie aan te roepen, en de BEREIKBAARHEID via HTTP. Het recht moet
-- blijven (anders 42501); het eindpunt moet weg. PostgREST doorzoekt in dit
-- project uitsluitend `public` — gemeten met dezelfde key op een functie in een
-- ander schema:
--
--   POST /rest/v1/rpc/armor   → 404 PGRST202
--   ("Searched for the function public.armor … no matches were found
--     in the schema cache"; `armor` woont in `extensions`)
--
-- Een helper buiten `public` heeft dus geen eindpunt, terwijl een in-database
-- aanroep vanuit het aggregaat gewoon werkt zolang de rollen `usage` op het
-- schema en `execute` op de functie houden.
--
-- HET NIEUWE SCHEMA `intern`
-- ──────────────────────────────────────────────────────────────────────────────
-- Er bestond nog geen intern schema (gemeten tegen `pg_namespace`, 12-09-2026:
-- alleen de Supabase-eigen schema's plus `public`). `intern` is vanaf nu de
-- plek voor helpers die de app nodig heeft maar die geen HTTP-eindpunt horen te
-- hebben. Twee eigenschappen die het schema meebrengt:
--
--   * Géén PostgREST-eindpunt, zolang de API-config alleen `public` exposeert.
--   * Géén Supabase-brede ALTER DEFAULT PRIVILEGES. In `public` krijgt een nieuwe
--     functie automatisch rechten voor anon/authenticated; hier geldt uitsluitend
--     wat expliciet in de migratie staat. Dat is strikter, en het maakt de
--     rechten van een helper leesbaar op de plek waar hij wordt aangemaakt.
--
-- WAT DEZE MIGRATIE NIET VERANDERT
-- ──────────────────────────────────────────────────────────────────────────────
-- Geen enkel getal. De regel van ADR 0139 is ongewijzigd (budgetteren-uit valt
-- buiten het aggregaat, de archief-bucket is vrijgesteld), de signatuur en de
-- returns-clausule van `tx_month_aggregate` blijven identiek, en het lichaam
-- verschilt uitsluitend in de schema-kwalificatie van de helper-aanroep. De
-- functie draait op `search_path = ''`, dus die kwalificatie moest sowieso
-- expliciet zijn — er is geen impliciete resolutie die stil kan meeverhuizen.
--
-- IDEMPOTENT: het verplaatsen zit in een guard (alleen als hij nog in `public`
-- staat), de rest is `if not exists` / `create or replace` / herhaalbare grants.

-- ── 1. Het schema ────────────────────────────────────────────────────────────
create schema if not exists intern;

comment on schema intern is
  'Interne helpers die de app in de database nodig heeft maar die GEEN HTTP-eindpunt horen te hebben. PostgREST exposeert alleen `public`, dus alles hier is onbereikbaar via /rest/v1/rpc — bewust, zie ADR 0139. Rechten staan hier altijd expliciet: anders dan in `public` gelden er geen Supabase-brede default privileges.';

-- `usage` is nodig naast `execute`: zonder schema-usage faalt de aanroep vanuit
-- het aggregaat alsnog, en juist bij de anon-rol zou dat de 42501 terugbrengen
-- die deze migratie wil vermijden.
grant usage on schema intern to anon, authenticated, service_role;

-- ── 2. De helper verhuist ────────────────────────────────────────────────────
-- `alter function ... set schema` verplaatst de rij in `pg_proc` mét zijn ACL en
-- zijn comment; er wordt dus niets opnieuw gedefinieerd en er is geen moment
-- waarop de functie twee keer bestaat of even weg is. De guard maakt de migratie
-- herhaalbaar: staat hij al in `intern`, dan is dit een no-op.
do $migratie$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'budget_excluded_account_ids'
  ) then
    execute 'alter function public.budget_excluded_account_ids(uuid[]) set schema intern';
  end if;
end
$migratie$;

-- Rechten opnieuw uitspreken op de nieuwe locatie. Ze reizen mee met de ACL, maar
-- dit bestand hoort de eindtoestand te beschrijven — en het is de plek waar een
-- latere lezer moet kunnen zien DAT anon dit recht bewust houdt.
--
-- ANON HOUDT EXECUTE, EN DAT IS GEEN SLORDIGHEID. `tx_month_aggregate` is
-- SECURITY INVOKER, dus het recht van de AANROEPER telt, en de permissiecheck
-- gebeurt bij planinitialisatie (zie de kop). Zonder dit recht krijgt een
-- render waarvan de sessie net verlopen is een 42501 in plaats van nul rijen.
-- Wat hier verdwijnt is uitsluitend het HTTP-eindpunt.
revoke all on function intern.budget_excluded_account_ids(uuid[]) from public;
grant execute on function intern.budget_excluded_account_ids(uuid[])
  to anon, authenticated, service_role;

comment on function intern.budget_excluded_account_ids(uuid[]) is
  'Geeft van de MEEGEGEVEN rekening-id''s terug welke "budgetteren uit" hebben: bank_accounts.is_active = false, of een gekoppeld cash-bezit met has_budget_tracking/is_active niet waar. De ARCHIEF-bucket (is_archive_bucket) is altijd vrijgesteld — bewaarde historie na een rekeningverwijdering is opruimen, geen budgetkeuze, en de bucket draagt is_active = false, dus die uitzondering moet vooraf staan. SECURITY DEFINER omdat de SELECT-policy op bank_accounts smaller is dan die op transactions — zo is de budget-status van een rekening leesbaar zonder de zichtbaarheid van de boeking te veranderen. Verruimt niets: geeft geen attributen terug, alleen een deelverzameling van de meegegeven uuid''s. Woont in `intern` en NIET in `public`, zodat PostgREST er geen RPC-eindpunt voor publiceert (ADR 0139); anon houdt bewust EXECUTE, anders geeft een verlopen sessie 42501 in plaats van nul rijen. Gebruikt door public.tx_month_aggregate.';

-- ── 3. Het aggregaat wijst naar de nieuwe locatie ────────────────────────────
-- MOET opnieuw aangemaakt worden: het lichaam van een SQL-functie is opgeslagen
-- tekst die bij uitvoering wordt geresolveerd. Zou dit achterwege blijven, dan
-- zocht het aggregaat na de verhuizing naar een `public.budget_excluded_account_ids`
-- die niet meer bestaat. Dat gebeurt in DEZELFDE transactie als de verhuizing,
-- dus er is geen moment waarop het aggregaat naar een dood adres wijst.
--
-- Enige verschil met 20260912120000: `intern.` in plaats van `public.` op één
-- regel. Signatuur, returns-clausule, filters en groepering zijn identiek.
create or replace function public.tx_month_aggregate(
  p_from date,
  p_to date,
  p_own_only boolean default false,
  p_user_id uuid default null,
  p_household_id uuid default null
)
returns table (
  month text,
  budget_id uuid,
  transaction_type text,
  sum_positief numeric,
  sum_negatief numeric,
  count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- STAP 1 — de zichtbare rijen. Ongewijzigd: dezelfde datumgrenzen, dezelfde
  -- ownOnly-tak, hetzelfde restrictieve scope-filter. De rijverzameling hangt
  -- uitsluitend aan de RLS van transactions.
  with zichtbaar as (
    select t.date, t.budget_id, t.transaction_type, t.amount, t.account_id
    from public.transactions t
    where t.date >= p_from
      and t.date <  p_to
      and (not p_own_only or t.user_id = (select auth.uid()))
      and (
        p_user_id is null
        or t.user_id = p_user_id
        or (
          t.ownership = 'shared'
          and t.household_id is not null
          and t.household_id = p_household_id
        )
      )
  ),
  -- STAP 2 — welke van de rekeningen die in DIE rijen voorkomen hebben
  -- budgetteren uit. De helper is SECURITY DEFINER en woont sinds deze migratie
  -- in `intern`, buiten het REST-oppervlak; hij krijgt alleen id's die uit
  -- hierboven zichtbare rijen komen en geeft alleen id's terug.
  uitgesloten as (
    select intern.budget_excluded_account_ids(
      array(select distinct z.account_id from zichtbaar z where z.account_id is not null)
    ) as ids
  )
  -- STAP 3 — aftrekken, niet joinen. Een rekening die de helper niet kent blijft
  -- staan: de faalrichting is "ongewijzigd", nooit "stil verdwenen".
  --
  -- De `account_id is null`-tak is DEFENSIEF: `transactions.account_id` is
  -- NOT NULL (gemeten 12-09-2026) en er zijn 0 rijen zonder rekening.
  select
    to_char(z.date, 'YYYY-MM')                                    as month,
    z.budget_id,
    z.transaction_type,
    coalesce(sum(z.amount) filter (where z.amount > 0), 0)::numeric as sum_positief,
    coalesce(sum(z.amount) filter (where z.amount < 0), 0)::numeric as sum_negatief,
    count(*)::bigint                                              as count
  from zichtbaar z
  cross join uitgesloten u
  where z.account_id is null
     or not (z.account_id = any(u.ids))
  group by 1, 2, 3
$$;

revoke all on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) from public;
grant execute on function public.tx_month_aggregate(date, date, boolean, uuid, uuid)
  to authenticated, anon, service_role;

comment on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) is
  'Maand-aggregaat (som pos/neg + count) per (maand, budget_id, transaction_type) over [p_from, p_to). SECURITY INVOKER — de RLS van transactions geldt onverkort. p_own_only=true beperkt tot eigen rijen (excl. gedeeld huishouden). p_user_id/p_household_id (ADR 0103) zijn een puur RESTRICTIEF extra AND-filter dat de policy "View own or shared transactions" spiegelt, zodat een service-role-aanroeper (snapshot-cron) per gebruiker kan afbakenen; voor een authenticated aanroeper met een vreemd id levert dat 0 rijen en geen fout — het is nooit een RLS-bypass. Sinds ADR 0139 vallen boekingen op een rekening met "budgetteren uit" buiten het aggregaat (intern.budget_excluded_account_ids); dat gebeurt door AFTREKKEN van een definer-bepaalde set, niet door een join op bank_accounts, zodat de zichtbaarheid van de boeking zelf niet verandert. De ARCHIEF-bucket is daarbij expliciet vrijgesteld: bewaarde historie na een rekeningverwijdering blijft de vensters voeden.';

-- De helper verdwijnt uit het geëxposeerde schema, dus PostgREST moet zijn
-- schema-cache herlezen — anders blijft het oude eindpunt tot de volgende
-- herlaadprikkel bestaan.
notify pgrst, 'reload schema';
