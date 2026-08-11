-- RLS initplan-wrap voor de drie huishoud-/beheer-helpers BUITEN de transactions-familie
-- + een blijvende hygiene-gate op dit patroon.
--
-- WAAROM (vervolg op ADR 0048 en zijn addendum van 2026-08-04):
-- ADR 0048 wikkelde auth.<fn>() in (select auth.<fn>()); het addendum (migratie
-- 20260804055846, taak T3.1) deed hetzelfde voor user_household_id() op transactions,
-- recurring_transactions en transaction_splits. DB-breed bleven de helpers daarbuiten
-- KAAL staan. Alle drie zijn STABLE SECURITY DEFINER:
--   user_household_id()        STABLE SECURITY DEFINER  search_path=public
--   user_owned_household_id()  STABLE SECURITY DEFINER  search_path=public
--   is_superadmin()            STABLE SECURITY DEFINER  search_path=public
-- (gemeten tegen pg_proc op de live database, 10-08-2026)
-- Postgres inlinet SECURITY DEFINER-functies nooit en constant-foldt STABLE niet, dus
-- zonder scalar-subquery-wrapper wordt de helper PER RIJ geevalueerd i.p.v. eenmaal per
-- query. Op assets/bank_accounts/budgets/... is dat elke rij waar de eigen-tak
-- (auth.uid() = user_id) niet al waar is; op budget_amounts zit de kale aanroep OOK in
-- with_check, dus per te SCHRIJVEN rij.
--
-- WAAROM DIT NIET VANZELF OPVALT:
-- de Supabase-advisor auth_rls_initplan herkent alleen auth.*/current_setting. Een kale
-- user_household_id() wordt per constructie nooit geflagd — auth_rls_initplan stond en
-- staat op 0. Alleen EXPLAIN maakt het zichtbaar. Daarom staat onderaan dit bestand een
-- eigen gate, zodat het patroon niet terugsluipt bij de volgende policy.
--
-- OMVANG (gemeten tegen pg_policies op de live database, 10-08-2026):
-- 34 policies verwijzen naar een van de drie helpers. 5 daarvan zijn al gewikkeld
-- (transactions, recurring_transactions, transaction_splits via T3.1; user_reports x2).
-- Deze migratie raakt de overige 29 policies / 36 kale aanroepen:
--   * 25 policies in schema public  — het aantal uit de Notion-kaart
--   *  4 policies op storage.objects (guide_help_admin_*, kale is_superadmin()) — die
--      vielen buiten de public-scope van de oorspronkelijke telling maar hebben exact
--      dezelfde kwaal.
--
-- SEMANTIEK IS IDENTIEK; alleen plannerkosten wijzigen (redenering uit ADR 0048-addendum):
--  * Elke helper levert per definitie een scalaire waarde, dus (select fn()) geeft exact
--    dezelfde waarde — inclusief NULL voor een gebruiker zonder huishouden. NULL = x
--    blijft NULL (niet-waar), dus de gedeelde tak blijft even dicht als voorheen.
--  * De helpers zijn STABLE: binnen een query kan de uitkomst niet wijzigen, dus een
--    enkele evaluatie geeft dezelfde rijenset als N evaluaties per rij.
--  * De helpers zijn read-only: geen neveneffecten die van het aantal aanroepen afhangen.
--  * Rolset (to authenticated), policynamen, cmd en de aanwezigheid/afwezigheid van een
--    with_check-tak blijven onaangeroerd. ALTER POLICY zonder WITH CHECK-clausule laat
--    with_check ongemoeid — bewust van belang bij "Owner can update household" (with_check
--    is daar NULL en moet NULL blijven) en bij "Update own or shared budgets" (waar de
--    qual wel en de with_check géén `household_id is not null`-tak draagt).
--  * Er wordt geen enkele tak toegevoegd, verwijderd of verbreed. DEEL C bewijst dat
--    machinaal: de genormaliseerde policy-expressie (wrapper weggestreept) moet ná deze
--    migratie byte-identiek zijn aan de md5 die vóór de migratie read-only is gemeten.
--
-- ANON: alle 29 policies staan op `to authenticated` (gemeten tegen pg_policies,
-- 10-08-2026) en `anon` heeft GEEN EXECUTE op de drie helpers (gemeten tegen pg_proc.proacl,
-- 10-08-2026: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}).
-- Anon evalueert deze policies dus nooit: 0 rijen zonder fout, vóór en ná. Precies die
-- combinatie — helper zonder anon-execute in een policy die anon wél evalueert — zou een
-- harde fout geven i.p.v. een lege set, en is de tweede helft van de gate in DEEL C.
--
-- Beheer/service-role blijft ongemoeid: die passeert RLS via de service-client (ADR 0006).

-- ══ DEEL A — initplan-wrap, schema public ════════════════════════════════════════

-- app_settings ────────────────────────────────────────────────────────────────────
alter policy "app_settings delete" on public.app_settings
  using (
    (position(((select auth.uid())::text) in key) > 0)
    or (select public.is_superadmin())
  );

-- Twee kale aanroepen in dezelfde tak (de NULL-test en de sleutel-prefix). Beide
-- gewikkeld; de EXISTS-subquery op profiles blijft ongemoeid (die is al een subquery en
-- valt buiten dit patroon).
alter policy "app_settings select" on public.app_settings
  using (
    (position(((select auth.uid())::text) in key) > 0)
    or (
      (key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'::text)
      and (key <> all (array[
        'anthropic_api_key'::text, 'openai_api_key'::text, 'mistral_api_key'::text,
        'truelayer_client_id'::text, 'truelayer_client_secret'::text,
        'notion_api_token'::text, 'notion_reports_data_source_id'::text
      ]))
      and (key !~~ 'notion\_%'::text)
    )
    or (
      ((select public.user_household_id()) is not null)
      and (key ~~ (('checkin_household_'::text || ((select public.user_household_id()))::text) || '\_%'::text))
    )
    or (exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'::text
    ))
  );

-- Eigenaar-OF-gedeelde SELECT-policies (identieke vorm op 8 tabellen) ──────────────
alter policy "Users can view own or shared assets" on public.assets
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "Users view own or shared bank_accounts" on public.bank_accounts
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared budgets" on public.budgets
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared debts" on public.debts
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared goals" on public.goals
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared life_events" on public.life_events
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared net worth snapshots" on public.net_worth_snapshots
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

alter policy "View own or shared valuations" on public.valuations
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  );

-- budget_amounts — FOR ALL, dus de wrap telt óók in het SCHRIJFPAD (with_check).
-- Qual en with_check zijn identiek en blijven identiek.
alter policy "Manage own or shared budget amounts" on public.budget_amounts
  using (
    (budget_id in (select budgets.id from public.budgets where budgets.user_id = (select auth.uid())))
    or (budget_id in (select budgets.id from public.budgets
        where budgets.ownership = 'shared'::text
          and budgets.household_id = (select public.user_household_id())))
  )
  with check (
    (budget_id in (select budgets.id from public.budgets where budgets.user_id = (select auth.uid())))
    or (budget_id in (select budgets.id from public.budgets
        where budgets.ownership = 'shared'::text
          and budgets.household_id = (select public.user_household_id())))
  );

alter policy "View own or shared budget rollovers" on public.budget_rollovers
  using (
    ((select auth.uid()) = user_id)
    or (budget_id in (select budgets.id from public.budgets
        where budgets.ownership = 'shared'::text
          and budgets.household_id = (select public.user_household_id())))
  );

-- LET OP de bewuste asymmetrie: de qual draagt `household_id is not null`, de with_check
-- niet. Die asymmetrie is het bestaande gedrag en wordt hier exact overgenomen.
alter policy "Update own or shared budgets" on public.budgets
  using (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id is not null)
        and (household_id = (select public.user_household_id())))
  )
  with check (
    ((select auth.uid()) = user_id)
    or ((ownership = 'shared'::text) and (household_id = (select public.user_household_id())))
  );

-- Huishouden-tabellen ─────────────────────────────────────────────────────────────
alter policy "Members view own household budget proposals" on public.household_budget_model_proposals
  using (household_id = (select public.user_household_id()));

alter policy "Members can view household invitations" on public.household_invitations
  using (
    (household_id = (select public.user_household_id()))
    or (lower(invited_email) = lower(coalesce((select auth.email()), ''::text)))
  );

-- INSERT-policy: alleen with_check bestaat; qual blijft NULL.
alter policy "Owner can create invitations" on public.household_invitations
  with check (
    (invited_by = (select auth.uid()))
    and (household_id = (select public.user_owned_household_id()))
  );

alter policy "Members can leave or owner can remove" on public.household_members
  using (
    (user_id = (select auth.uid()))
    or (household_id = (select public.user_owned_household_id()))
  );

alter policy "Members can view household members" on public.household_members
  using (household_id = (select public.user_household_id()));

alter policy "household_members update" on public.household_members
  using (
    (household_id = (select public.user_owned_household_id()))
    or (user_id = (select auth.uid()))
  )
  with check (
    (household_id = (select public.user_owned_household_id()))
    or (user_id = (select auth.uid()))
  );

alter policy "Members can view own household" on public.households
  using (
    (id = (select public.user_household_id()))
    or (created_by = (select auth.uid()))
  );

-- with_check is hier NULL en moet NULL blijven: geen WITH CHECK-clausule meegeven.
-- Postgres gebruikt dan de USING-expressie ook als check — dat blijft zo, maar dan
-- gewikkeld.
alter policy "Owner can update household" on public.households
  using (id = (select public.user_owned_household_id()));

-- Beheer-policies met is_superadmin() ─────────────────────────────────────────────
alter policy "feedback superadmin select" on public.feedback
  using ((select public.is_superadmin()));

alter policy "feedback superadmin update" on public.feedback
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

alter policy "Superadmins can insert roadmap features" on public.roadmap_features
  with check ((select public.is_superadmin()));

alter policy "Superadmins can update roadmap features" on public.roadmap_features
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

-- ══ DEEL B — initplan-wrap, schema storage ═══════════════════════════════════════
--
-- Dezelfde kale is_superadmin() op de vier guide-help-policies (aangemaakt in
-- 20260717132328_security_fix_guide_help_storage_policies). Buiten de public-scope van
-- de oorspronkelijke telling, identieke kwaal. Bucket-filter en rolset onveranderd.

alter policy "guide_help_admin_select" on storage.objects
  using ((bucket_id = 'guide-help'::text) and (select public.is_superadmin()));

alter policy "guide_help_admin_insert" on storage.objects
  with check ((bucket_id = 'guide-help'::text) and (select public.is_superadmin()));

alter policy "guide_help_admin_update" on storage.objects
  using ((bucket_id = 'guide-help'::text) and (select public.is_superadmin()))
  with check ((bucket_id = 'guide-help'::text) and (select public.is_superadmin()));

alter policy "guide_help_admin_delete" on storage.objects
  using ((bucket_id = 'guide-help'::text) and (select public.is_superadmin()));

-- ══ DEEL C — blijvende gate + bewijs dat niets verruimd is ═══════════════════════
--
-- De Supabase-advisor kan dit patroon niet zien (hij kent alleen auth.*/current_setting),
-- dus krijgt het een eigen detector. Twee lenzen in één functie:
--
--  1. `kale_helper_aanroep`  — performance: helper zonder (select ...)-wrapper, dus per rij.
--  2. `anon_zonder_execute`  — veiligheid: een policy die de helper draagt én `anon`/`public`
--     in de rolset heeft terwijl anon geen EXECUTE op die helper heeft. Dat geeft anon een
--     harde fout i.p.v. stil 0 rijen — een rechtenregressie vermomd als afscherming
--     (de valkuil uit ADR 0048 en de gedeelde leak-check-conventie).
--
-- SECURITY INVOKER, niet DEFINER: de functie leest uitsluitend pg_catalog-views die toch al
-- publiek leesbaar zijn, dus er is geen enkele reden om rechten op te tillen. Wel volgens de
-- RPC-hardeningsnorm afgeschermd: geen EXECUTE voor public/anon/authenticated.

-- De uitvoerkolommen heten bewust NIET schemaname/tablename/policyname/cmd/roles: in een
-- LANGUAGE sql-functie zijn RETURNS TABLE-kolommen parameters, en die zouden botsen met de
-- gelijknamige kolommen van pg_policies ("column reference is ambiguous").
create or replace function public.rls_helper_policy_hygiene()
returns table (
  schema_naam text,
  tabel_naam text,
  policy_naam text,
  commando text,
  rollen text,
  kale_aanroepen integer,
  genormaliseerde_md5 text,
  overtreding text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pol as (
    select p.schemaname::text as s_naam,
           p.tablename::text  as t_naam,
           p.policyname::text as p_naam,
           p.cmd::text        as c_md,
           p.roles::text      as r_ollen,
           -- Schema-kwalificatie wegstrepen maakt de vergelijking ongevoelig voor de
           -- search_path waarmee pg_policies gedeparsed wordt (met search_path = '' rendert
           -- Postgres "public.budgets" waar hij anders "budgets" schrijft). Zonder deze
           -- stap zou de md5 van dezelfde policy per sessie kunnen verschillen.
           pg_catalog.regexp_replace(
             coalesce(p.qual, '') || '|' || coalesce(p.with_check, ''),
             'public\.', '', 'g') as raw
    from pg_catalog.pg_policies p
    where (coalesce(p.qual, '') || coalesce(p.with_check, ''))
          ~ '(user_household_id|is_superadmin|user_owned_household_id)\('
  ),
  norm as (
    select pol.*,
           -- de (select fn() as fn)-wrapper wegstrepen, zodat een gewikkelde en een kale
           -- policy met verder identieke logica exact dezelfde tekst opleveren.
           pg_catalog.regexp_replace(
             raw,
             '\(\s*SELECT\s+(user_household_id|is_superadmin|user_owned_household_id)\(\)\s+AS\s+[a-z_]+\)',
             '\1()', 'g') as expr
    from pol
  ),
  telling as (
    select norm.*,
           -- totaal aantal aanroepen (na normalisatie) minus de aanroepen die al gewikkeld
           -- stonden = het aantal kale aanroepen.
           pg_catalog.regexp_count(expr,
             '(user_household_id|is_superadmin|user_owned_household_id)\(\)')
           - pg_catalog.regexp_count(raw,
             '\(\s*SELECT\s+(user_household_id|is_superadmin|user_owned_household_id)\(\)\s+AS\s+[a-z_]+\)')
             as kale
    from norm
  ),
  -- Per policy: draagt de rolset anon of public, en ontbreekt anon EXECUTE op een van de
  -- helpers die deze policy daadwerkelijk aanroept? Bewust per aangeroepen helper getoetst
  -- en niet op één representant: de drie ACL's zijn vandaag gelijk, maar dat is een
  -- momentopname en geen garantie.
  anon_risico as (
    select t.s_naam, t.t_naam, t.p_naam,
           bool_or(
             pg_catalog.strpos(t.expr, h.naam || '()') > 0
             and not pg_catalog.has_function_privilege('anon', 'public.' || h.naam || '()', 'EXECUTE')
           ) as risico
    from telling t
    cross join (values ('user_household_id'), ('is_superadmin'), ('user_owned_household_id')) as h(naam)
    where 'anon'   = any (pg_catalog.string_to_array(pg_catalog.btrim(t.r_ollen, '{}'), ','))
       or 'public' = any (pg_catalog.string_to_array(pg_catalog.btrim(t.r_ollen, '{}'), ','))
    group by t.s_naam, t.t_naam, t.p_naam
  )
  select t.s_naam, t.t_naam, t.p_naam, t.c_md, t.r_ollen,
         t.kale::integer,
         pg_catalog.md5(t.expr),
         case
           when t.kale > 0 then 'kale_helper_aanroep'
           when coalesce(a.risico, false) then 'anon_zonder_execute'
           else null
         end
  from telling t
  left join anon_risico a
    on a.s_naam = t.s_naam and a.t_naam = t.t_naam and a.p_naam = t.p_naam;
$$;

comment on function public.rls_helper_policy_hygiene() is
  'Detecteert twee dingen die de Supabase-advisor structureel mist op policies die '
  'user_household_id()/user_owned_household_id()/is_superadmin() gebruiken: (1) een kale '
  'aanroep zonder (select ...)-wrapper, die per rij evalueert; (2) een policy waarvan de '
  'rolset anon/public bevat terwijl anon geen EXECUTE op de helper heeft, wat anon een '
  'harde fout geeft i.p.v. 0 rijen. Zie ADR 0048 + addendum. Beheer-only (service_role).';

revoke all on function public.rls_helper_policy_hygiene() from public;
revoke all on function public.rls_helper_policy_hygiene() from anon;
revoke all on function public.rls_helper_policy_hygiene() from authenticated;
grant execute on function public.rls_helper_policy_hygiene() to service_role;

-- ── Zelfcontrole: gate schoon + geen enkele policy verruimd ───────────────────────
--
-- De md5's hieronder zijn read-only gemeten tegen pg_policies op de live database op
-- 10-08-2026, VOOR deze migratie, met exact dezelfde normalisatie als hierboven. Omdat
-- de normalisatie de wrapper wegstreept, moet elke waarde ná de migratie ongewijzigd
-- zijn. Dat is het machinale bewijs dat er niets is toegevoegd, verwijderd of verbreed:
-- de enige toegestane wijziging is precies de wrapper.
--
-- De vijf policies die T3.1/eerder al wikkelde staan er bewust bij als CONTROLEGROEP —
-- die worden hier niet aangeraakt en moeten dus sowieso gelijk blijven. Dat ze vandaag
-- al dezelfde genormaliseerde md5 hebben als hun nog-kale zusters (bv.
-- recurring_transactions == assets == e0907df4...) is het empirische bewijs dat de
-- normalisatie de wrap-transformatie correct wegstreept.
do $$
declare
  verwacht constant text[][] := array[
    ['public','app_settings','app_settings delete','07a73fa1dfe9706a601a1124aacdd0ab'],
    ['public','app_settings','app_settings select','5fa405a6bb28fca73c677e2cb32b15cd'],
    ['public','assets','Users can view own or shared assets','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','bank_accounts','Users view own or shared bank_accounts','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','budget_amounts','Manage own or shared budget amounts','4106970b3265d82f59ecf3ba8f8a594f'],
    ['public','budget_rollovers','View own or shared budget rollovers','47dacb7ff1d3e37eecfec1efd962c30b'],
    ['public','budgets','Update own or shared budgets','fad52c57ca3e0d18c80232bb971ddff5'],
    ['public','budgets','View own or shared budgets','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','debts','View own or shared debts','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','feedback','feedback superadmin select','6f0b133a2212bb4c2b1c72c9c1aef17f'],
    ['public','feedback','feedback superadmin update','82069d07e2f22338495956451e906341'],
    ['public','goals','View own or shared goals','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','household_budget_model_proposals','Members view own household budget proposals','316e106a875dc667950d2b256f031526'],
    ['public','household_invitations','Members can view household invitations','8345197a41066262e82b7efd0fc5dcd1'],
    ['public','household_invitations','Owner can create invitations','4f832f409cc251988ab3fb3a2d721fdb'],
    ['public','household_members','Members can leave or owner can remove','bf5acd2156b69a653c0518af008e9442'],
    ['public','household_members','Members can view household members','316e106a875dc667950d2b256f031526'],
    ['public','household_members','household_members update','f5f637b48437d0424279b84c95ea3376'],
    ['public','households','Members can view own household','d8ea7f4b7c89466f6c2fc6f800f34a47'],
    ['public','households','Owner can update household','f73c16f1a827f490b59e28ee59edcae9'],
    ['public','life_events','View own or shared life_events','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','net_worth_snapshots','View own or shared net worth snapshots','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','recurring_transactions','View own or shared recurring transactions','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','roadmap_features','Superadmins can insert roadmap features','c43e260bf5b6b77ac0f21da66dcf1960'],
    ['public','roadmap_features','Superadmins can update roadmap features','82069d07e2f22338495956451e906341'],
    ['public','transaction_splits','View own or shared transaction splits','db8ba63a1a7e2daba3042b3196f4eb54'],
    ['public','transactions','View own or shared transactions','e0907df44e40a5e30b1edfec7d78b90c'],
    ['public','user_reports','user_reports select own or superadmin','29d6199f9a39ba7171208cb19e81b4c4'],
    ['public','user_reports','user_reports superadmin update','82069d07e2f22338495956451e906341'],
    ['public','valuations','View own or shared valuations','e0907df44e40a5e30b1edfec7d78b90c'],
    ['storage','objects','guide_help_admin_delete','1abe6183f963303cc5fa96d5521e60fb'],
    ['storage','objects','guide_help_admin_insert','c5399e7261c9cf596e14d6def1bd5e4a'],
    ['storage','objects','guide_help_admin_select','1abe6183f963303cc5fa96d5521e60fb'],
    ['storage','objects','guide_help_admin_update','e9f541cf36d7a5b239c7693eb0cdee9a']
  ];
  i integer;
  gevonden_md5 text;
  gevonden_rollen text;
  overtredingen text;
  aantal integer;
begin
  -- 1. Elke verwachte policy bestaat nog, staat nog op {authenticated}, en is
  --    genormaliseerd byte-identiek aan de meting van vóór de migratie.
  for i in 1 .. array_length(verwacht, 1) loop
    select h.genormaliseerde_md5, h.rollen
      into gevonden_md5, gevonden_rollen
    from public.rls_helper_policy_hygiene() h
    where h.schema_naam = verwacht[i][1]
      and h.tabel_naam  = verwacht[i][2]
      and h.policy_naam = verwacht[i][3];

    if gevonden_md5 is null then
      raise exception 'RLS-gate: policy % op %.% is verdwenen of verwijst niet meer naar een helper',
        verwacht[i][3], verwacht[i][1], verwacht[i][2];
    end if;
    if gevonden_md5 <> verwacht[i][4] then
      raise exception 'RLS-gate: policy % op %.% is inhoudelijk gewijzigd (md5 % != verwacht %) — de wrap mag NIETS anders veranderen',
        verwacht[i][3], verwacht[i][1], verwacht[i][2], gevonden_md5, verwacht[i][4];
    end if;
    if gevonden_rollen <> '{authenticated}' then
      raise exception 'RLS-gate: rolset van policy % op %.% is gewijzigd naar % (verwacht {authenticated})',
        verwacht[i][3], verwacht[i][1], verwacht[i][2], gevonden_rollen;
    end if;
  end loop;

  -- 2. Er zijn geen ANDERE policies met een helper bijgekomen die we niet gemeten hebben.
  select count(*) into aantal from public.rls_helper_policy_hygiene();
  if aantal <> array_length(verwacht, 1) then
    raise exception 'RLS-gate: % policies verwijzen naar een helper, verwacht % — onbekende policy erbij of eraf',
      aantal, array_length(verwacht, 1);
  end if;

  -- 3. De gate zelf moet schoon zijn: geen kale aanroep, geen anon-zonder-execute.
  select string_agg(format('%s.%s/%s: %s', h.schema_naam, h.tabel_naam, h.policy_naam, h.overtreding), '; ')
    into overtredingen
  from public.rls_helper_policy_hygiene() h
  where h.overtreding is not null;

  if overtredingen is not null then
    raise exception 'RLS-gate niet schoon na migratie: %', overtredingen;
  end if;

  raise notice 'RLS-gate schoon: % policies met helper, 0 kale aanroepen, 0 anon-risico, alle genormaliseerde expressies ongewijzigd.',
    aantal;
end;
$$;
