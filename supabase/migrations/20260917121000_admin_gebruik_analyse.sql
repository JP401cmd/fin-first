-- Geanonimiseerde gebruiksanalyse voor /beheer/gebruik: één RPC die uitsluitend
-- k-onderdrukte tellingen teruggeeft. ADR 0146 "Beheer ziet gebruik, geen
-- inhoud" en ADR 0147 (waardestromen). Contract: /beheer/gebruik fase 1
-- (eigenaarsbesluiten 17-09-2026, k = 5).
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- Beheer wil zien HOE de app gebruikt wordt — actief per week, per waardestroom,
-- terugkeerritme, doorstroom tussen stromen, welke app-delen samen op één dag
-- voorkomen, aanmeldcohorten en de eerste ervaring (onboarding, rondleiding,
-- welkomstgids) — zonder ooit bij één persoon uit te komen. Daarom:
--   * De functie geeft ALLEEN tellingen van verschillende gebruikers terug, nooit
--     een gebruikers-id, e-mailadres of losse kalenderdatum. Tijd staat er
--     uitsluitend in als ISO-weeklabel (`2026-W38`) of maand (`2026-09`).
--   * ÉÉN drempel `c_k` (= 5, gelijk aan GEBRUIK_K in
--     lib/beheer/gebruik-analyse/onderdrukking.ts; de loader assert `k`). Elke
--     telling gaat door `public.gebruik_k_cel(n, c_k)`: 0 → 0, 1..k-1 → null,
--     ≥ k → n. Een 0 wordt nooit onderdrukt (null betekent altijd "1 t/m 4").
--     Een mediaan komt alleen terug als ≥ k verschillende gebruikers een gat
--     bijdragen, anders null.
--   * Aanvullende (complementaire) onderdrukking — een partitie waarvan één cel
--     null is en het totaal bekend — doet de TS-laag (`onderdrukVerdeling`);
--     deze functie levert daarvoor altijd de volledige partities.
--   * Cohort-`dekking` volgt de KALENDER (valt de maand vóór, over of na de
--     eerste meetdag), niet de aantallen: een telling-gebaseerde dekking zou
--     "gemeten = aangemeld" verraden ook als beide cellen onderdrukt zijn.
--
-- Bronnen: profiles (segment, aanmelddag, onboarding, module_guide_state,
-- voorkeuren), auth.users (alleen e-maildomein voor het segment, binnen de
-- functie), user_activity_days, user_activity_modules, app_settings (alleen het
-- BESTAAN van een `checkin_snapshot_<uid>_`-sleutel). Bewust NIET gelezen: elke
-- chat_*-tabel, web_vitals, financiële tabellen.
--
-- Segment: DISJUNCT. `p_intern = false` = extern: sluit testaccounts
-- (`@test.trifinity.nl`), superadmins en demo-gebruikers uit. `p_intern = true`
-- = ALLEEN die interne accounts. Bewust geen unie "inclusief intern": twee
-- overlappende releases van dezelfde telling maken het externe deel exact
-- terugrekenbaar (unie − intern), en de interne accounts zijn van beheer zelf,
-- dus hun gedrag is bekend en stuurbaar (security-review 17-09-2026, Y1).
-- De venstergrootte is 30, 90 of 365 Amsterdamse kalenderdagen (vandaag incl.).
-- "Dominant" gebruikt vast de laatste 30 dagen (definitie lib/waardestromen.ts).
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- Exact als admin_module_activity_counts() (20260915140000):
--   * SECURITY DEFINER, `search_path = ''`, alles volledig gekwalificeerd.
--   * EXECUTE ingetrokken van public, anon en authenticated; alleen service_role.
--     Aanroep via lib/beheer/gebruik-analyse/loader.ts met getServiceClient(),
--     achter isSuperAdmin op de servercomponent /beheer/gebruik.
--   * Daarbovenop een rolcheck in de body: een JWT-rol die niet service_role is
--     → 42501. Geen JWT-context (`auth.role()` NULL = directe verbinding als
--     postgres) mag door.
--   * Invoer wordt gevalideerd (22023): p_dagen ∈ {30, 90, 365}; p_intern niet
--     null; p_config = { stromen: 1..6 × { id ^[a-z0-9-]{1,40}$ (uniek),
--     modules: niet-leeg ⊂ de 12 sleutels van de CHECK op
--     user_activity_modules, ritme_dagen: null | 1..365 }, dominant_min_dagen:
--     1..30 }. Onbekende extra velden worden genegeerd.
-- Helper `public.gebruik_k_cel(bigint, integer)` is IMMUTABLE, geen security
-- definer, leest niets; dezelfde revokes, en óók ingetrokken van service_role
-- (de default-ACL geeft die anders X; alleen de functie-eigenaar roept 'm aan,
-- binnen admin_gebruik_analyse). Hij
-- draagt geen eigen k: de drempel komt altijd uit `c_k`.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie:
--   drop function if exists public.admin_gebruik_analyse(integer, boolean, jsonb);
--   drop function if exists public.gebruik_k_cel(bigint, integer);
-- De loader vangt 42883/PGRST202 af en toont "niet uitgerold"; er hangt geen
-- data aan deze functies.
--
-- ── LEAK-CHECK (verwachtingen) ────────────────────────────────────────────────
--   * anon          rpc admin_gebruik_analyse(…)            → 42501 (geen EXECUTE)
--   * authenticated rpc admin_gebruik_analyse(…)            → 42501 (geen EXECUTE)
--   * anon/authenticated rpc gebruik_k_cel(…)               → 42501 (geen EXECUTE)
--   * service_role  rpc admin_gebruik_analyse(90,false,cfg) → ok, jsonb
--   * service_role  p_dagen = 7 / onbekende module / 7 stromen → 22023
--   * output bevat geen uuid, geen e-mail, geen `YYYY-MM-DD`
--
-- ── Live gemeten vóór schrijven (17-09-2026, read-only via execute_sql) ───────
--   * `list_migrations`: laatst toegepast = 20260916120000; alle repobestanden
--     t/m die versie geregistreerd; geen 20260917*.
--   * `user_activity_days` (kolommen user_id uuid, day date) en
--     `user_activity_modules` bestaan; eerste dag in beide = 2026-09-15.
--   * `pg_proc`: admin_module_activity_counts() bestaat met ACL
--     `{postgres=X/postgres,service_role=X/postgres}` — het patroon hieronder.
--     admin_gebruik_analyse en gebruik_k_cel bestaan niet.
--   * `auth.role()` = NULL in een directe verbinding.
--   * profiles: role text NOT NULL ('user'/'superadmin'), is_demo_user boolean
--     NOT NULL, created_at timestamptz (0 NULL), onboarding_completed boolean NOT
--     NULL, module_guide_state jsonb NOT NULL, weekly_briefing_email boolean NOT
--     NULL, home_screen text NOT NULL CHECK ∈ (overzicht, budget), display_mode
--     text NOT NULL CHECK ∈ (simple, full), onboarding_deferred_fields jsonb.
--   * module_guide_state-sleutels live: coachmark:overzicht-rondleiding (outcome
--     voltooid/overgeslagen), rondleiding:pending (object), welcome:guide (object
--     met status active/dismissed + completedStepIds).
--   * AFWIJKING t.o.v. contract, gemeten: `profiles.onboarding_deferred_fields`
--     is bij alle profielen een lege array; de onboarding schrijft uitgestelde
--     velden in `feature_preferences.deferred_onboarding_fields`
--     (app/api/onboarding/save-own-data/route.ts, 4 profielen live). "uitgesteld"
--     leest daarom de unie van beide.

create or replace function public.gebruik_k_cel(p_n bigint, p_k integer)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_n is null then null
    when p_n <= 0 then 0
    when p_n < p_k then null
    else p_n::integer
  end
$$;

comment on function public.gebruik_k_cel(bigint, integer) is
  'k-onderdrukking voor admin_gebruik_analyse(): 0 → 0, 1..k-1 → null, ≥k → n. Geen eigen drempel.';

revoke all on function public.gebruik_k_cel(bigint, integer) from public;
revoke all on function public.gebruik_k_cel(bigint, integer) from anon;
revoke all on function public.gebruik_k_cel(bigint, integer) from authenticated;
revoke all on function public.gebruik_k_cel(bigint, integer) from service_role;

create or replace function public.admin_gebruik_analyse(p_dagen integer, p_intern boolean, p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- De énige drempel. Gelijk aan GEBRUIK_K (TS); de loader assert `k`.
  c_k                constant integer := 5;
  -- Exact de CHECK user_activity_modules_module_check (20260917120000).
  c_modules          constant text[] := array[
    'overzicht', 'bezittingen', 'schulden', 'budget', 'belasting', 'toekomst',
    'rapportages', 'berichten', 'nieuws', 'mijn', 'fin', 'grip'
  ];
  c_dominant_dagen   constant integer := 30;
  v_rol              text := auth.role();
  v_vandaag          date := (pg_catalog.now() at time zone 'Europe/Amsterdam')::date;
  v_start            date;
  v_aantal           integer;
  v_min_dom          integer;
  v_e                jsonb;
  v_meetdag          date;
  v_mod_meetdag      date;
  v_uit              jsonb;
begin
  if v_rol is not null and v_rol <> 'service_role' then
    raise exception 'admin_gebruik_analyse: alleen voor service_role'
      using errcode = '42501';
  end if;

  -- ── Invoervalidatie ─────────────────────────────────────────────────────────
  if p_dagen is null or p_dagen not in (30, 90, 365) then
    raise exception 'admin_gebruik_analyse: p_dagen moet 30, 90 of 365 zijn'
      using errcode = '22023';
  end if;
  if p_intern is null then
    raise exception 'admin_gebruik_analyse: p_intern is verplicht'
      using errcode = '22023';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config -> 'stromen') is distinct from 'array' then
    raise exception 'admin_gebruik_analyse: p_config.stromen ontbreekt'
      using errcode = '22023';
  end if;

  v_aantal := jsonb_array_length(p_config -> 'stromen');
  if v_aantal < 1 or v_aantal > 6 then
    raise exception 'admin_gebruik_analyse: 1 tot 6 stromen'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_config -> 'dominant_min_dagen') is distinct from 'number'
     or not ((p_config ->> 'dominant_min_dagen') ~ '^[0-9]{1,2}$') then
    raise exception 'admin_gebruik_analyse: dominant_min_dagen moet een geheel getal zijn'
      using errcode = '22023';
  end if;
  v_min_dom := (p_config ->> 'dominant_min_dagen')::integer;
  if v_min_dom < 1 or v_min_dom > c_dominant_dagen then
    raise exception 'admin_gebruik_analyse: dominant_min_dagen buiten 1..30'
      using errcode = '22023';
  end if;

  for v_e in select t.value from jsonb_array_elements(p_config -> 'stromen') as t loop
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'admin_gebruik_analyse: stroom moet een object zijn'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'id') is distinct from 'string'
       or not ((v_e ->> 'id') ~ '^[a-z0-9-]{1,40}$') then
      raise exception 'admin_gebruik_analyse: ongeldige stroom-id'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'modules') is distinct from 'array'
       or jsonb_array_length(v_e -> 'modules') < 1 then
      raise exception 'admin_gebruik_analyse: stroom zonder modules'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_e -> 'modules') as m
      where jsonb_typeof(m.value) <> 'string'
         or not ((m.value #>> '{}') = any (c_modules))
    ) then
      raise exception 'admin_gebruik_analyse: onbekende module'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'ritme_dagen') is not null
       and jsonb_typeof(v_e -> 'ritme_dagen') <> 'null' then
      if jsonb_typeof(v_e -> 'ritme_dagen') <> 'number'
         or not ((v_e ->> 'ritme_dagen') ~ '^[0-9]{1,3}$') then
        raise exception 'admin_gebruik_analyse: ritme_dagen moet een geheel getal of null zijn'
          using errcode = '22023';
      end if;
      if (v_e ->> 'ritme_dagen')::integer not between 1 and 365 then
        raise exception 'admin_gebruik_analyse: ritme_dagen buiten 1..365'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  if (select count(distinct t.value ->> 'id') from jsonb_array_elements(p_config -> 'stromen') as t) <> v_aantal then
    raise exception 'admin_gebruik_analyse: dubbele stroom-id'
      using errcode = '22023';
  end if;

  -- ── Afgeleide grenzen ───────────────────────────────────────────────────────
  v_start := v_vandaag - p_dagen + 1;
  -- Eerste meetdag over ALLE rijen (niet per segment): bepaalt alleen een
  -- weeklabel en de kalender-dekking van cohorten.
  select min(d.day) into v_meetdag from public.user_activity_days d;
  select min(m.day) into v_mod_meetdag from public.user_activity_modules m;

  -- ── Eén query, gedeelde CTE's ───────────────────────────────────────────────
  -- p_dagen ≥ 30, dus het venster omvat altijd het vaste dominant-venster van 30
  -- dagen: `moddagen` hoeft niet verder terug dan v_start.
  with
  stromen as (
    select
      t.o::integer as idx,
      t.e ->> 'id' as id,
      array(select jsonb_array_elements_text(t.e -> 'modules')) as modules,
      case when jsonb_typeof(t.e -> 'ritme_dagen') = 'number'
           then (t.e ->> 'ritme_dagen')::integer end as ritme
    from jsonb_array_elements(p_config -> 'stromen') with ordinality as t(e, o)
  ),
  labels as (
    select s.idx, s.id, s.idx as volg from stromen s
    union all
    select 0, null::text, 1000
  ),
  segment as (
    select
      p.id as user_id,
      p.onboarding_completed,
      p.module_guide_state,
      p.onboarding_deferred_fields,
      p.feature_preferences,
      p.weekly_briefing_email,
      p.home_screen,
      p.display_mode,
      (p.created_at at time zone 'Europe/Amsterdam')::date as aanmelddag
    from public.profiles p
    left join auth.users u on u.id = p.id
    -- Disjunct (zie kop): extern óf alleen intern, nooit de unie.
    -- coalesce: een NULL-uitkomst (ontbrekende auth-rij of rol) mag een profiel
    -- niet uit béíde segmenten laten vallen — zo'n profiel telt als extern.
    where p_intern = coalesce(
         coalesce(u.email, '') ilike '%@test.trifinity.nl'
         or p.role = 'superadmin'
         or p.is_demo_user is true,
         false
       )
  ),
  dagen as (          -- actieve dagen van het segment, hele bewaartermijn
    select d.user_id, d.day
    from public.user_activity_days d
    join segment s on s.user_id = d.user_id
  ),
  dagen_venster as (
    select d.user_id, d.day from dagen d where d.day between v_start and v_vandaag
  ),
  moddagen as (       -- app-delen van het segment in het venster
    select distinct m.user_id, m.day, m.module
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    where m.day between v_start and v_vandaag
  ),
  stroomdagen as (
    select distinct st.idx, md.user_id, md.day
    from moddagen md
    join stromen st on md.module = any (st.modules)
  ),
  -- Weken uitsluitend opgebouwd uit dagen BINNEN het venster: de eerste (en
  -- huidige) week zijn afgekapt, zodat Σ weektrend.nieuw = nieuw_venster.
  weken as (
    select
      to_char(g.d, 'IYYY-"W"IW') as week,
      min(g.d)::date as van,
      max(g.d)::date as tot
    from generate_series(v_start::timestamp, v_vandaag::timestamp, interval '1 day') as g(d)
    group by 1
  ),
  -- dominant (vaste 30 dagen)
  dom_basis as (
    select distinct md.user_id from moddagen md where md.day >= v_vandaag - (c_dominant_dagen - 1)
  ),
  dom_dagen as (
    select sd.idx, sd.user_id, count(*) as n
    from stroomdagen sd
    where sd.day >= v_vandaag - (c_dominant_dagen - 1)
    group by sd.idx, sd.user_id
  ),
  dom_rang as (
    select
      dd.user_id, dd.idx, dd.n,
      rank() over (partition by dd.user_id order by dd.n desc) as r,
      count(*) over (partition by dd.user_id, dd.n) as gelijk
    from dom_dagen dd
  ),
  dom_winnaar as (
    select b.user_id, w.idx
    from dom_basis b
    left join dom_rang w
      on w.user_id = b.user_id and w.r = 1 and w.gelijk = 1 and w.n >= v_min_dom
  ),
  -- overlap
  overlap_basis as (
    select dv.user_id from dagen_venster dv
    union
    select md.user_id from moddagen md
  ),
  overlap_per as (
    select b.user_id, count(distinct sd.idx) as aantal
    from overlap_basis b
    left join stroomdagen sd on sd.user_id = b.user_id
    group by b.user_id
  ),
  -- ritme
  stroomgaten as (
    select
      sd.idx, sd.user_id, sd.day,
      lead(sd.day) over (partition by sd.idx, sd.user_id order by sd.day) - sd.day as gat
    from stroomdagen sd
  ),
  -- doorstroom: opeenvolgende actieve dagen (volgende actieve dag, niet per se
  -- de kalenderdag erna)
  dagseq as (
    select dv.user_id, dv.day,
           lead(dv.day) over (partition by dv.user_id order by dv.day) as volgende
    from dagen_venster dv
  ),
  dagstroom as (
    select dv.user_id, dv.day, coalesce(sd.idx, 0) as idx
    from dagen_venster dv
    left join stroomdagen sd on sd.user_id = dv.user_id and sd.day = dv.day
  ),
  overgangen as (
    select distinct a.idx as van, b.idx as naar, q.user_id
    from dagseq q
    join dagstroom a on a.user_id = q.user_id and a.day = q.day
    join dagstroom b on b.user_id = q.user_id and b.day = q.volgende
    where q.volgende is not null
  ),
  -- cohorten
  -- De laatste 12 aanmeldmaanden plus één rij "eerder" (van = -infinity, maand
  -- null) met alle oudere aanmelders — óók een eventuele NULL-created_at. Zo is
  -- Σ aangemeld = segment_totaal en Σ onboarding_afgerond =
  -- eerste_ervaring.onboarding_afgerond: sluitende partities voor de
  -- aanvullende onderdrukking in de TS-laag.
  maanden_12 as (
    select
      (date_trunc('month', v_vandaag::timestamp) - make_interval(months => g.i))::date as van,
      (date_trunc('month', v_vandaag::timestamp) - make_interval(months => g.i) + interval '1 month')::date - 1 as tot
    from generate_series(0, 11) as g(i)
  ),
  maanden as (
    select m.van, m.tot from maanden_12 m
    union all
    select '-infinity'::date, min(m.van) - 1 from maanden_12 m
  ),
  -- eerste ervaring
  ervaring as (
    select
      s.user_id,
      case
        when s.module_guide_state -> 'coachmark:overzicht-rondleiding' ->> 'outcome'
             in ('voltooid', 'overgeslagen', 'onderbroken')
          then s.module_guide_state -> 'coachmark:overzicht-rondleiding' ->> 'outcome'
        when s.module_guide_state ? 'rondleiding:pending' then 'tegoed'
        else 'geen'
      end as rondleiding,
      case
        when jsonb_typeof(s.module_guide_state -> 'welcome:guide') is distinct from 'object' then 'niet_gestart'
        when s.module_guide_state -> 'welcome:guide' ->> 'status' = 'dismissed' then 'afgesloten'
        else case
          (case when jsonb_typeof(s.module_guide_state -> 'welcome:guide' -> 'completedStepIds') = 'array'
                then least(jsonb_array_length(s.module_guide_state -> 'welcome:guide' -> 'completedStepIds'), 4)
                else 0 end)
          when 0 then '0_stappen'
          when 4 then '4_plus_stappen'
          else '1_3_stappen'
        end
      end as gids
    from segment s
  ),
  uitgesteld as (
    select distinct u.user_id, u.veld
    from (
      select s.user_id, v.veld
      from segment s
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(s.onboarding_deferred_fields) = 'array'
             then s.onboarding_deferred_fields else '[]'::jsonb end
      ) as v(veld)
      union all
      select s.user_id, v.veld
      from segment s
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(s.feature_preferences -> 'deferred_onboarding_fields') = 'array'
             then s.feature_preferences -> 'deferred_onboarding_fields' else '[]'::jsonb end
      ) as v(veld)
    ) u
    -- Gesloten lijst (DeferredField in lib/coach-suggestions.ts). De kolom is via
    -- de eigen-rij-profielpolicy vrij beschrijfbaar; een vrije string zou op de
    -- beheerpagina belanden (security-review 17-09-2026, G2).
    where u.veld in ('income', 'assets', 'spaardoel')
  )
  select jsonb_build_object(
    'k', c_k,
    'venster_dagen', p_dagen,
    'intern', p_intern,
    'gemeten_sinds_week', to_char(v_meetdag::timestamp, 'IYYY-"W"IW'),
    'modules_gemeten_sinds_week', to_char(v_mod_meetdag::timestamp, 'IYYY-"W"IW'),

    'kerncijfers', jsonb_build_object(
      'segment_totaal', public.gebruik_k_cel((select count(*) from segment), c_k),
      'actief_vandaag', public.gebruik_k_cel((select count(distinct d.user_id) from dagen d where d.day = v_vandaag), c_k),
      'actief_7',       public.gebruik_k_cel((select count(distinct d.user_id) from dagen d where d.day between v_vandaag - 6 and v_vandaag), c_k),
      'actief_30',      public.gebruik_k_cel((select count(distinct d.user_id) from dagen d where d.day between v_vandaag - 29 and v_vandaag), c_k),
      'actief_venster', public.gebruik_k_cel((select count(distinct dv.user_id) from dagen_venster dv), c_k),
      'nieuw_venster',  public.gebruik_k_cel((select count(*) from segment s where s.aanmelddag between v_start and v_vandaag), c_k)
    ),

    'weektrend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week', w.week,
        'actief', public.gebruik_k_cel((select count(distinct dv.user_id) from dagen_venster dv where dv.day between w.van and w.tot), c_k),
        'nieuw',  public.gebruik_k_cel((select count(*) from segment s where s.aanmelddag between w.van and w.tot), c_k)
      ) order by w.week), '[]'::jsonb)
      from weken w
    ),

    'stromen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id,
        'gebruikers', public.gebruik_k_cel((select count(distinct sd.user_id) from stroomdagen sd where sd.idx = st.idx), c_k),
        'weken', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'week', w.week,
            'actief', public.gebruik_k_cel((select count(distinct sd.user_id) from stroomdagen sd
                                            where sd.idx = st.idx and sd.day between w.van and w.tot), c_k)
          ) order by w.week), '[]'::jsonb)
          from weken w
        )
      ) order by st.idx), '[]'::jsonb)
      from stromen st
    ),

    'dominant', jsonb_build_object(
      'totaal', public.gebruik_k_cel((select count(*) from dom_basis), c_k),
      'verdeling', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'stroom', l.id,
          'gebruikers', public.gebruik_k_cel((select count(*) from dom_winnaar dw
                                              where coalesce(dw.idx, 0) = l.idx), c_k)
        ) order by l.volg), '[]'::jsonb)
        from labels l
      )
    ),

    'overlap', jsonb_build_object(
      'totaal', public.gebruik_k_cel((select count(*) from overlap_basis), c_k),
      'verdeling', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'aantal_stromen', g.i,
          'gebruikers', public.gebruik_k_cel((select count(*) from overlap_per op where op.aantal = g.i), c_k)
        ) order by g.i), '[]'::jsonb)
        from generate_series(0, v_aantal) as g(i)
      )
    ),

    'ritme', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id,
        'ritme_dagen', st.ritme,
        'geschikt', public.gebruik_k_cel(r.geschikt, c_k),
        'terug', case when st.ritme is null then null else public.gebruik_k_cel(r.terug, c_k) end,
        'niet_terug', case when st.ritme is null then null else public.gebruik_k_cel(r.geschikt - r.terug, c_k) end,
        'mediaan_dagen', case when r.gaten_gebruikers >= c_k then r.mediaan end,
        'gaten_gebruikers', public.gebruik_k_cel(r.gaten_gebruikers, c_k)
      ) order by st.idx), '[]'::jsonb)
      from stromen st
      cross join lateral (
        select
          case when st.ritme is null
               then count(distinct g.user_id)
               else count(distinct g.user_id) filter (where g.day <= v_vandaag - st.ritme)
          end as geschikt,
          count(distinct g.user_id) filter (
            where st.ritme is not null and g.day <= v_vandaag - st.ritme and g.gat <= st.ritme
          ) as terug,
          count(distinct g.user_id) filter (where g.gat is not null) as gaten_gebruikers,
          round((percentile_cont(0.5) within group (order by g.gat))::numeric, 1) as mediaan
        from stroomgaten g
        where g.idx = st.idx
      ) r
    ),

    'doorstroom', jsonb_build_object(
      'gebruikers_met_overgang', public.gebruik_k_cel((select count(distinct q.user_id) from dagseq q where q.volgende is not null), c_k),
      'overgangen', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'van', a.id,
          'naar', b.id,
          'gebruikers', public.gebruik_k_cel((select count(distinct o.user_id) from overgangen o
                                              where o.van = a.idx and o.naar = b.idx), c_k)
        ) order by a.volg, b.volg), '[]'::jsonb)
        from labels a cross join labels b
      )
    ),

    'samen', jsonb_build_object(
      'modules', (
        select jsonb_agg(jsonb_build_object(
          'module', cm.module,
          'gebruikers', public.gebruik_k_cel((select count(distinct md.user_id) from moddagen md where md.module = cm.module), c_k)
        ) order by cm.o)
        from unnest(c_modules) with ordinality as cm(module, o)
      ),
      'paren', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'a', p.a, 'b', p.b, 'gebruikers', public.gebruik_k_cel(p.n, c_k)
        ) order by p.a, p.b), '[]'::jsonb)
        from (
          select x.module collate "C" as a, y.module collate "C" as b, count(distinct x.user_id) as n
          from moddagen x
          join moddagen y
            on y.user_id = x.user_id and y.day = x.day
           and x.module collate "C" < y.module collate "C"
          group by 1, 2
        ) p
      )
    ),

    'cohorten', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'maand', case when m.van = '-infinity'::date then null else to_char(m.van::timestamp, 'YYYY-MM') end,
        'aangemeld', public.gebruik_k_cel(c.aangemeld, c_k),
        'onboarding_afgerond', public.gebruik_k_cel(c.afgerond, c_k),
        'dekking', case
          when v_meetdag is null or m.tot < v_meetdag then 'geen'
          when m.van >= v_meetdag then 'volledig'
          else 'deels'
        end,
        'gemeten', public.gebruik_k_cel(c.gemeten, c_k),
        'eerste_dag', public.gebruik_k_cel(c.eerste, c_k),
        'tweede_dag', public.gebruik_k_cel(c.tweede, c_k),
        'week2_5_noemer', public.gebruik_k_cel(c.w_noemer, c_k),
        'week2_5', public.gebruik_k_cel(c.w, c_k),
        'maand2_noemer', public.gebruik_k_cel(c.m_noemer, c_k),
        'maand2', public.gebruik_k_cel(c.m2, c_k)
      ) order by m.van), '[]'::jsonb)
      from maanden m
      cross join lateral (
        select
          count(*) as aangemeld,
          count(*) filter (where s.onboarding_completed) as afgerond,
          count(*) filter (where gm.gemeten) as gemeten,
          count(*) filter (where gm.gemeten and act.n >= 1) as eerste,
          count(*) filter (where gm.gemeten and act.n >= 2) as tweede,
          count(*) filter (where gm.gemeten and s.aanmelddag + 34 < v_vandaag) as w_noemer,
          count(*) filter (where gm.gemeten and s.aanmelddag + 34 < v_vandaag and act.w) as w,
          count(*) filter (where gm.gemeten and s.aanmelddag + 59 < v_vandaag) as m_noemer,
          count(*) filter (where gm.gemeten and s.aanmelddag + 59 < v_vandaag and act.m2) as m2
        from segment s
        cross join lateral (
          select (v_meetdag is not null and s.aanmelddag >= v_meetdag) as gemeten
        ) gm
        cross join lateral (
          select
            count(*) as n,
            coalesce(bool_or(d.day between s.aanmelddag + 7 and s.aanmelddag + 34), false) as w,
            coalesce(bool_or(d.day between s.aanmelddag + 30 and s.aanmelddag + 59), false) as m2
          from dagen d
          where d.user_id = s.user_id
        ) act
        where s.aanmelddag between m.van and m.tot
           or (m.van = '-infinity'::date and s.aanmelddag is null)
      ) c
    ),

    'eerste_ervaring', jsonb_build_object(
      'totaal', public.gebruik_k_cel((select count(*) from segment), c_k),
      'onboarding_afgerond', public.gebruik_k_cel((select count(*) from segment s where s.onboarding_completed), c_k),
      'rondleiding', (
        select jsonb_agg(jsonb_build_object(
          'uitkomst', u.uitkomst,
          'gebruikers', public.gebruik_k_cel((select count(*) from ervaring e where e.rondleiding = u.uitkomst), c_k)
        ) order by u.o)
        from unnest(array['voltooid', 'overgeslagen', 'onderbroken', 'tegoed', 'geen']) with ordinality as u(uitkomst, o)
      ),
      'gids', (
        select jsonb_agg(jsonb_build_object(
          'stand', gs.stand,
          'gebruikers', public.gebruik_k_cel((select count(*) from ervaring e where e.gids = gs.stand), c_k)
        ) order by gs.o)
        from unnest(array['niet_gestart', 'afgesloten', '0_stappen', '1_3_stappen', '4_plus_stappen']) with ordinality as gs(stand, o)
      ),
      'uitgesteld', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'veld', x.veld, 'gebruikers', public.gebruik_k_cel(x.n, c_k)
        ) order by x.veld), '[]'::jsonb)
        from (select ug.veld, count(distinct ug.user_id) as n from uitgesteld ug group by ug.veld) x
      ),
      'briefing_mail_aan', public.gebruik_k_cel((select count(*) from segment s where s.weekly_briefing_email), c_k),
      'checkin_minstens_een', public.gebruik_k_cel((
        select count(*) from segment s
        where exists (
          select 1 from public.app_settings a
          where starts_with(a.key, 'checkin_snapshot_' || s.user_id::text || '_')
        )
      ), c_k),
      'home_screen', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'waarde', x.waarde, 'gebruikers', public.gebruik_k_cel(x.n, c_k)
        ) order by x.waarde), '[]'::jsonb)
        from (select s.home_screen as waarde, count(*) as n from segment s group by s.home_screen) x
      ),
      'display_mode', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'waarde', x.waarde, 'gebruikers', public.gebruik_k_cel(x.n, c_k)
        ) order by x.waarde), '[]'::jsonb)
        from (select s.display_mode as waarde, count(*) as n from segment s group by s.display_mode) x
      )
    )
  )
  into v_uit;

  return v_uit;
end;
$$;

comment on function public.admin_gebruik_analyse(integer, boolean, jsonb) is
  'Geanonimiseerde gebruiksanalyse voor /beheer/gebruik: uitsluitend k-onderdrukte tellingen '
  '(k = 5; 0 → 0, 1..4 → null), weken als ISO-label, maanden als YYYY-MM, geen ids/e-mail/datums. '
  'Alleen service_role (ADR 0146/0147).';

revoke all on function public.admin_gebruik_analyse(integer, boolean, jsonb) from public;
revoke all on function public.admin_gebruik_analyse(integer, boolean, jsonb) from anon;
revoke all on function public.admin_gebruik_analyse(integer, boolean, jsonb) from authenticated;
grant execute on function public.admin_gebruik_analyse(integer, boolean, jsonb) to service_role;
