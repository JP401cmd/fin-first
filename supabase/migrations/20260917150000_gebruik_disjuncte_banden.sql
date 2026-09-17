-- Disjuncte banden in de gebruiksanalyse: `p_dagen` 30/90/365 betekent vanaf nu
-- een BAND (0–29, 30–89, 90–364 dagen geleden) in plaats van een geneste periode.
-- `create or replace` van admin_gebruik_analyse() en admin_gebruik_doorstroom();
-- signaturen, grants, revokes en comments ongewijzigd. ADR 0146/0147.
--
-- ── Aanleiding ────────────────────────────────────────────────────────────────
-- Security-review 17-09-2026 (geel 3): de periodes 30 ⊂ 90 ⊂ 365 nestten, dus
-- "telling(90) − telling(30)" gaf een kleine groep exact, ook als beide tellingen
-- elk ≥ k waren. De k-drempel beschermt één release, niet het verschil tussen
-- twee overlappende releases. Eigenaarsbesluit (17-09-2026): disjuncte banden.
--
-- ── Wat verandert ─────────────────────────────────────────────────────────────
--   | p_dagen | band                 | v_start       | v_eind       |
--   |---------|----------------------|---------------|--------------|
--   | 30      | laatste 30 dagen     | vandaag − 29  | vandaag      |
--   | 90      | 31–90 dagen geleden  | vandaag − 89  | vandaag − 30 |
--   | 365     | 91–365 dagen geleden | vandaag − 364 | vandaag − 90 |
-- Output krijgt `band: { van_dagen_geleden, tot_dagen_geleden }`; `venster_dagen`
-- blijft (30/90/365).
--
-- admin_gebruik_analyse():
--   * Elk vensterfilter loopt tot v_eind (dagen_venster, moddagen, weken,
--     nieuw_venster, weektrend, stromen, overlap, samen).
--   * De sleutel `doorstroom` (stroom→stroom-matrix over alle opeenvolgende
--     dagen, CTE's dagseq/dagstroom/overgangen) VERVALT uit de output
--     (security-review 17-09-2026: zijn nullen pinden cellen van de Sankey uit
--     admin_gebruik_doorstroom() vast; wat niet geleverd wordt, kan niet lekken).
--   * kerncijfers: `actief_vandaag`, `actief_7`, `actief_30` VERVALLEN (ook dat
--     waren geneste periodes). Nieuw `laatst_actief`: partitie van segment_totaal
--     op de laatste dag in user_activity_days (hele bewaartermijn,
--     bandonafhankelijk): vandaag · 1_6 · 7_29 · 30_89 · 90_plus · nooit — altijd
--     alle zes, vaste volgorde. Eén release, geen nesting.
--   * dominant: eigen CTE over de laatste 30 dagen, onafhankelijk van de band —
--     in elke band identiek (dus geen extra informatie per band).
--   * ritme: oorsprongsdag in de band, terugkeer mag na de band vallen (stroomdagen
--     over de hele bewaartermijn, `lead`).
--   * cohorten en eerste_ervaring: ongewijzigd (bandonafhankelijk).
-- admin_gebruik_doorstroom():
--   * dagnummering en `actief_venster` binnen de band; `band` in de output.
--
-- Ongewijzigd en bewust behouden: disjunct segment (extern óf intern), gesloten
-- `uitgesteld`-lijst, één `c_k = 5` via `gebruik_k_cel`, invoervalidatie (22023),
-- rolcheck (42501), SECURITY DEFINER + `search_path = ''`.
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- Ongewijzigd t.o.v. 20260917121000 / 20260917123000: EXECUTE alleen voor
-- service_role (hieronder opnieuw gezet), `gebruik_k_cel` alleen voor de eigenaar.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- Samen met de TS-laag (schema/loader/pagina): het zod-schema moet de nieuwe
-- `kerncijfers` (zonder actief_vandaag/7/30, met laatst_actief) en `band`
-- accepteren. Migratie vóór code breekt de oude parser op de ontbrekende velden
-- (de pagina toont dan een fout, er lekt niets); code vóór migratie idem andersom.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie die de functie-body's uit 20260917121000
-- (admin_gebruik_analyse, prosrc-md5 0fd2e254fe1657fbce408e48e673dc32) en
-- 20260917123000 (admin_gebruik_doorstroom, md5 bbe4cb7502d667f4a70b67971a7f20dd)
-- opnieuw `create or replace`t — pas nadat de TS-laag terug is. Let op: dat
-- herintroduceert de geneste periodes (geel 3).
--
-- ── LEAK-CHECK (verwachtingen) ────────────────────────────────────────────────
--   * anon / authenticated rpc op beide functies          → 42501
--   * service_role, p_dagen = 7                          → 22023
--   * output bevat geen uuid, geen '@', geen `YYYY-MM-DD`
--   * laatst_actief en dominant identiek in de drie banden
--   * dag-sets van de banden disjunct en samen exact [vandaag − 364, vandaag]
--
-- ── Live gemeten vóór schrijven (17-09-2026, read-only via execute_sql) ───────
--   * `pg_proc`: md5(prosrc) admin_gebruik_analyse = 0fd2e254fe1657fbce408e48e673dc32
--     en admin_gebruik_doorstroom = bbe4cb7502d667f4a70b67971a7f20dd — byte-gelijk
--     aan de body's in 20260917121000 en 20260917123000 (lokaal nagerekend), dus die
--     bestanden zijn de basis. ACL beide `{postgres=X/postgres,service_role=X/postgres}`;
--     gebruik_k_cel `{postgres=X/postgres}`.
--   * Migratiemap: 20260917130000 is bezet (parallelle sessie); 20260917150000 vrij.

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
  v_eind             date;
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
  -- Disjuncte banden (eigenaarsbesluit 17-09-2026): 30 = laatste 30 dagen,
  -- 90 = 31–90 dagen geleden, 365 = 91–365 dagen geleden. Nooit genest, dus
  -- geen "telling(90) − telling(30)"-verschil dat een kleine groep blootlegt.
  v_start := case p_dagen when 30 then v_vandaag - 29 when 90 then v_vandaag - 89 else v_vandaag - 364 end;
  v_eind  := case p_dagen when 30 then v_vandaag      when 90 then v_vandaag - 30 else v_vandaag - 90  end;
  -- Eerste meetdag over ALLE rijen (niet per segment): bepaalt alleen een
  -- weeklabel en de kalender-dekking van cohorten.
  select min(d.day) into v_meetdag from public.user_activity_days d;
  select min(m.day) into v_mod_meetdag from public.user_activity_modules m;

  -- ── Eén query, gedeelde CTE's ───────────────────────────────────────────────
  -- Alles met "venster" in de naam is de BAND [v_start, v_eind]. Bandonafhankelijk
  -- zijn: laatst_actief (hele bewaartermijn), dominant (vast de laatste 30
  -- dagen), de ritme-terugkeer (oorsprong in de band, terugkeer mag erna vallen),
  -- cohorten en eerste_ervaring.
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
    select d.user_id, d.day from dagen d where d.day between v_start and v_eind
  ),
  moddagen as (       -- app-delen van het segment in de band
    select distinct m.user_id, m.day, m.module
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    where m.day between v_start and v_eind
  ),
  stroomdagen as (
    select distinct st.idx, md.user_id, md.day
    from moddagen md
    join stromen st on md.module = any (st.modules)
  ),
  -- Weken uitsluitend opgebouwd uit dagen BINNEN de band: de eerste en laatste
  -- week zijn afgekapt, zodat Σ weektrend.nieuw = nieuw_venster.
  weken as (
    select
      to_char(g.d, 'IYYY-"W"IW') as week,
      min(g.d)::date as van,
      max(g.d)::date as tot
    from generate_series(v_start::timestamp, v_eind::timestamp, interval '1 day') as g(d)
    group by 1
  ),
  -- dominant: vast de laatste 30 dagen, ONAFHANKELIJK van de band
  -- (definitie lib/waardestromen.ts) — in elke band dezelfde uitvoer.
  dom_moddagen as (
    select distinct m.user_id, m.day, m.module
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    where m.day between v_vandaag - (c_dominant_dagen - 1) and v_vandaag
  ),
  dom_basis as (
    select distinct dm.user_id from dom_moddagen dm
  ),
  dom_dagen as (
    select st.idx, dm.user_id, count(distinct dm.day) as n
    from dom_moddagen dm
    join stromen st on dm.module = any (st.modules)
    group by st.idx, dm.user_id
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
  -- ritme: stroomdagen over de hele bewaartermijn, zodat de terugkeer na de
  -- band mag vallen; alleen oorsprongsdagen in de band tellen (filter hieronder).
  ritme_stroomdagen as (
    select distinct st.idx, m.user_id, m.day
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    join stromen st on m.module = any (st.modules)
  ),
  stroomgaten as (
    select
      rs.idx, rs.user_id, rs.day,
      lead(rs.day) over (partition by rs.idx, rs.user_id order by rs.day) - rs.day as gat
    from ritme_stroomdagen rs
  ),
  -- laatst actief: laatste dag in user_activity_days, hele bewaartermijn
  laatst as (
    select s.user_id,
      case
        when max(d.day) is null then 'nooit'
        when v_vandaag - max(d.day) <= 0 then 'vandaag'
        when v_vandaag - max(d.day) <= 6 then '1_6'
        when v_vandaag - max(d.day) <= 29 then '7_29'
        when v_vandaag - max(d.day) <= 89 then '30_89'
        else '90_plus'
      end as wanneer
    from segment s
    left join dagen d on d.user_id = s.user_id
    group by s.user_id
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
    'band', jsonb_build_object(
      'van_dagen_geleden', v_vandaag - v_eind,
      'tot_dagen_geleden', v_vandaag - v_start
    ),
    'gemeten_sinds_week', to_char(v_meetdag::timestamp, 'IYYY-"W"IW'),
    'modules_gemeten_sinds_week', to_char(v_mod_meetdag::timestamp, 'IYYY-"W"IW'),

    'kerncijfers', jsonb_build_object(
      'segment_totaal', public.gebruik_k_cel((select count(*) from segment), c_k),
      'actief_venster', public.gebruik_k_cel((select count(distinct dv.user_id) from dagen_venster dv), c_k),
      'nieuw_venster',  public.gebruik_k_cel((select count(*) from segment s where s.aanmelddag between v_start and v_eind), c_k),
      'laatst_actief', (
        select jsonb_agg(jsonb_build_object(
          'wanneer', w.wanneer,
          'gebruikers', public.gebruik_k_cel((select count(*) from laatst l where l.wanneer = w.wanneer), c_k)
        ) order by w.o)
        from unnest(array['vandaag', '1_6', '7_29', '30_89', '90_plus', 'nooit']) with ordinality as w(wanneer, o)
      )
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
          and g.day between v_start and v_eind
      ) r
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

create or replace function public.admin_gebruik_doorstroom(p_dagen integer, p_intern boolean, p_config jsonb)
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
  c_max_stap         constant integer := 4;
  v_rol              text := auth.role();
  v_vandaag          date := (pg_catalog.now() at time zone 'Europe/Amsterdam')::date;
  v_start            date;
  v_eind             date;
  v_aantal           integer;
  v_min_dom          integer;
  v_e                jsonb;
  v_uit              jsonb;
begin
  if v_rol is not null and v_rol <> 'service_role' then
    raise exception 'admin_gebruik_doorstroom: alleen voor service_role'
      using errcode = '42501';
  end if;

  -- ── Invoervalidatie (gelijk aan admin_gebruik_analyse) ──────────────────────
  if p_dagen is null or p_dagen not in (30, 90, 365) then
    raise exception 'admin_gebruik_doorstroom: p_dagen moet 30, 90 of 365 zijn'
      using errcode = '22023';
  end if;
  if p_intern is null then
    raise exception 'admin_gebruik_doorstroom: p_intern is verplicht'
      using errcode = '22023';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config -> 'stromen') is distinct from 'array' then
    raise exception 'admin_gebruik_doorstroom: p_config.stromen ontbreekt'
      using errcode = '22023';
  end if;

  v_aantal := jsonb_array_length(p_config -> 'stromen');
  if v_aantal < 1 or v_aantal > 6 then
    raise exception 'admin_gebruik_doorstroom: 1 tot 6 stromen'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_config -> 'dominant_min_dagen') is distinct from 'number'
     or not ((p_config ->> 'dominant_min_dagen') ~ '^[0-9]{1,2}$') then
    raise exception 'admin_gebruik_doorstroom: dominant_min_dagen moet een geheel getal zijn'
      using errcode = '22023';
  end if;
  v_min_dom := (p_config ->> 'dominant_min_dagen')::integer;
  if v_min_dom < 1 or v_min_dom > c_dominant_dagen then
    raise exception 'admin_gebruik_doorstroom: dominant_min_dagen buiten 1..30'
      using errcode = '22023';
  end if;

  for v_e in select t.value from jsonb_array_elements(p_config -> 'stromen') as t loop
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'admin_gebruik_doorstroom: stroom moet een object zijn'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'id') is distinct from 'string'
       or not ((v_e ->> 'id') ~ '^[a-z0-9-]{1,40}$') then
      raise exception 'admin_gebruik_doorstroom: ongeldige stroom-id'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'modules') is distinct from 'array'
       or jsonb_array_length(v_e -> 'modules') < 1 then
      raise exception 'admin_gebruik_doorstroom: stroom zonder modules'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_e -> 'modules') as m
      where jsonb_typeof(m.value) <> 'string'
         or not ((m.value #>> '{}') = any (c_modules))
    ) then
      raise exception 'admin_gebruik_doorstroom: onbekende module'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_e -> 'ritme_dagen') is not null
       and jsonb_typeof(v_e -> 'ritme_dagen') <> 'null' then
      if jsonb_typeof(v_e -> 'ritme_dagen') <> 'number'
         or not ((v_e ->> 'ritme_dagen') ~ '^[0-9]{1,3}$') then
        raise exception 'admin_gebruik_doorstroom: ritme_dagen moet een geheel getal of null zijn'
          using errcode = '22023';
      end if;
      if (v_e ->> 'ritme_dagen')::integer not between 1 and 365 then
        raise exception 'admin_gebruik_doorstroom: ritme_dagen buiten 1..365'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  if (select count(distinct t.value ->> 'id') from jsonb_array_elements(p_config -> 'stromen') as t) <> v_aantal then
    raise exception 'admin_gebruik_doorstroom: dubbele stroom-id'
      using errcode = '22023';
  end if;

  -- Disjuncte banden (eigenaarsbesluit 17-09-2026): 30 = laatste 30 dagen,
  -- 90 = 31–90 dagen geleden, 365 = 91–365 dagen geleden. Nooit genest, dus
  -- geen "telling(90) − telling(30)"-verschil dat een kleine groep blootlegt.
  v_start := case p_dagen when 30 then v_vandaag - 29 when 90 then v_vandaag - 89 else v_vandaag - 364 end;
  v_eind  := case p_dagen when 30 then v_vandaag      when 90 then v_vandaag - 30 else v_vandaag - 90  end;

  with
  stromen as (
    select t.o::integer as idx, t.e ->> 'id' as id,
      array(select jsonb_array_elements_text(t.e -> 'modules')) as modules
    from jsonb_array_elements(p_config -> 'stromen') with ordinality as t(e, o)
  ),
  -- Knooplabels in vaste volgorde: config, _meerdere, _geen (+ _stopt als naar).
  knopen as (
    select s.id as knoop, s.idx as volg from stromen s
    union all select '_meerdere', 1000
    union all select '_geen', 1001
  ),
  naar_knopen as (
    select k.knoop, k.volg from knopen k
    union all select '_stopt', 1002
  ),
  segment as (
    select p.id as user_id
    from public.profiles p
    left join auth.users u on u.id = p.id
    -- Disjunct, identiek aan admin_gebruik_analyse(): extern óf alleen intern.
    where p_intern = coalesce(
         coalesce(u.email, '') ilike '%@test.trifinity.nl'
         or p.role = 'superadmin'
         or p.is_demo_user is true,
         false
       )
  ),
  genummerd as (      -- actieve dagen in de band, per gebruiker genummerd binnen de band
    select d.user_id, d.day,
      row_number() over (partition by d.user_id order by d.day) as stap,
      count(*) over (partition by d.user_id) as aantal_dagen
    from public.user_activity_days d
    join segment s on s.user_id = d.user_id
    where d.day between v_start and v_eind
  ),
  gebruikers as (
    select distinct g.user_id, g.aantal_dagen from genummerd g
  ),
  stroomdagen as (
    select distinct st.idx, m.user_id, m.day
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    join stromen st on m.module = any (st.modules)
    where m.day between v_start and v_eind
  ),
  dagknoop as (
    select g.user_id, g.stap,
      case count(distinct sd.idx)
        when 0 then '_geen'
        when 1 then min(st.id)
        else '_meerdere'
      end as knoop
    from genummerd g
    left join stroomdagen sd on sd.user_id = g.user_id and sd.day = g.day
    left join stromen st on st.idx = sd.idx
    where g.stap <= c_max_stap
    group by g.user_id, g.stap
  ),
  overgang as (
    select a.stap as van_stap, a.knoop as van, coalesce(b.knoop, '_stopt') as naar, a.user_id
    from dagknoop a
    left join dagknoop b on b.user_id = a.user_id and b.stap = a.stap + 1
    where a.stap < c_max_stap
  )
  select jsonb_build_object(
    'k', c_k,
    'venster_dagen', p_dagen,
    'intern', p_intern,
    'band', jsonb_build_object(
      'van_dagen_geleden', v_vandaag - v_eind,
      'tot_dagen_geleden', v_vandaag - v_start
    ),
    'max_stap', c_max_stap,
    'actief_venster', public.gebruik_k_cel((select count(*) from gebruikers), c_k),
    'dagen_verdeling', (
      select jsonb_agg(jsonb_build_object(
        'aantal', a.i,
        'gebruikers', public.gebruik_k_cel((select count(*) from gebruikers g
                                            where least(g.aantal_dagen, 5) = a.i), c_k)
      ) order by a.i)
      from generate_series(1, 5) as a(i)
    ),
    'stappen', (
      select jsonb_agg(jsonb_build_object(
        'stap', st.i,
        'totaal', public.gebruik_k_cel((select count(*) from gebruikers g where g.aantal_dagen >= st.i), c_k),
        'knopen', (
          select jsonb_agg(jsonb_build_object(
            'knoop', k.knoop,
            'gebruikers', public.gebruik_k_cel((select count(*) from dagknoop dk
                                                where dk.stap = st.i and dk.knoop = k.knoop), c_k)
          ) order by k.volg)
          from knopen k
        )
      ) order by st.i)
      from generate_series(1, c_max_stap) as st(i)
    ),
    'overgangen', (
      select jsonb_agg(jsonb_build_object(
        'van_stap', v.i,
        'van', kv.knoop,
        'naar', kn.knoop,
        'gebruikers', public.gebruik_k_cel((select count(*) from overgang o
                                            where o.van_stap = v.i and o.van = kv.knoop and o.naar = kn.knoop), c_k)
      ) order by v.i, kv.volg, kn.volg)
      from generate_series(1, c_max_stap - 1) as v(i)
      cross join knopen kv
      cross join naar_knopen kn
    )
  )
  into v_uit;

  return v_uit;
end;
$$;

comment on function public.admin_gebruik_doorstroom(integer, boolean, jsonb) is
  'Doorstroom over de eerste 4 actieve dagen per gebruiker (Sankey) voor /beheer/gebruik: uitsluitend '
  'k-onderdrukte tellingen (k = 5; 0 → 0, 1..4 → null), vaste volgorde, geen ids/e-mail/datums. '
  'Disjunct segment als admin_gebruik_analyse(). Alleen service_role (ADR 0146/0147).';

revoke all on function public.admin_gebruik_doorstroom(integer, boolean, jsonb) from public;
revoke all on function public.admin_gebruik_doorstroom(integer, boolean, jsonb) from anon;
revoke all on function public.admin_gebruik_doorstroom(integer, boolean, jsonb) from authenticated;
grant execute on function public.admin_gebruik_doorstroom(integer, boolean, jsonb) to service_role;
