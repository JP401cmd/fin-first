-- Doorstroom per actieve dag als Sankey-bron voor /beheer/gebruik: één RPC die
-- uitsluitend k-onderdrukte tellingen teruggeeft. ADR 0146 "Beheer ziet gebruik,
-- geen inhoud" en ADR 0147 (waardestromen). Aanvulling op
-- admin_gebruik_analyse() (20260917121000), eigenaarsverzoek 17-09-2026.
--
-- ── Doel ──────────────────────────────────────────────────────────────────────
-- De eigenaar wil zien hoe gebruikers door hun eerste actieve dagen stromen: op
-- welke waardestroom landt iemand op zijn 1e, 2e, 3e, 4e actieve dag in het
-- venster, en waar gaat hij daarna heen (of stopt hij)?
--   * Per gebruiker worden zijn actieve dagen in het venster (user_activity_days)
--     genummerd 1, 2, 3 … op datum. Stap = dat volgnummer, NIET een kalenderdag:
--     er staat geen datum in de output.
--   * Knoop van een gebruiker-dag = de verzameling stromen die hij die dag raakte
--     (user_activity_modules × p_config): 0 → '_geen', precies 1 → die stroom-id,
--     ≥ 2 → '_meerdere'. Een underscore kan nooit een stroom-id zijn
--     (^[a-z0-9-]{1,40}$), dus de labels botsen niet.
--   * Output (vaste volgorde: config-volgorde, dan _meerdere, _geen, _stopt —
--     nooit op grootte, want een sortering op grootte verraadt de rangorde van
--     onderdrukte cellen):
--       actief_venster, dagen_verdeling (1, 2, 3, 4, 5 = "5 of meer"),
--       stappen 1..4 (totaal = gebruikers met ≥ stap dagen, alle S+2 knopen),
--       overgangen van_stap 1..3 als volledige matrix
--       (S+2 van-knopen) × (S+2 naar-knopen + '_stopt').
--     '_stopt' = gebruiker had precies van_stap actieve dagen.
--   * Sluitende partities (voor de aanvullende onderdrukking in de TS-laag):
--       Σ dagen_verdeling = actief_venster; Σ knopen(stap) = totaal(stap);
--       Σ rij(van_stap, van) = knoop(van_stap, van);
--       Σ kolom(van_stap, naar ≠ _stopt) = knoop(van_stap + 1, naar);
--       Σ kolom(van_stap, _stopt) = dagen_verdeling[aantal = van_stap].
--   * ÉÉN drempel `c_k` (= 5, gelijk aan GEBRUIK_K). Elke telling gaat door de
--     bestaande `public.gebruik_k_cel(n, c_k)`: 0 → 0, 1..4 → null, ≥ 5 → n.
--
-- Bronnen: profiles + auth.users (alleen voor het segment, binnen de functie),
-- user_activity_days, user_activity_modules. Bewust NIET gelezen: chat_*,
-- web_vitals, financiële tabellen, app_settings.
--
-- Segment: EXACT als admin_gebruik_analyse() — DISJUNCT. `p_intern = false` =
-- extern (zonder @test.trifinity.nl, superadmins en demo-gebruikers);
-- `p_intern = true` = alleen die interne accounts; een NULL-uitkomst telt als
-- extern (security-review 17-09-2026, Y1).
--
-- ── Toegangsmodel ─────────────────────────────────────────────────────────────
-- Exact als admin_gebruik_analyse() (20260917121000):
--   * SECURITY DEFINER, `search_path = ''`, alles volledig gekwalificeerd.
--   * EXECUTE ingetrokken van public, anon en authenticated; alleen service_role
--     (loader met getServiceClient(), achter isSuperAdmin op /beheer/gebruik).
--   * Rolcheck in de body: JWT-rol ≠ service_role → 42501; geen JWT-context
--     (directe verbinding als postgres) mag door.
--   * Dezelfde invoervalidatie (22023) als admin_gebruik_analyse(), inclusief
--     `ritme_dagen` en `dominant_min_dagen` — die worden hier niet gebruikt,
--     maar de loader stuurt één en dezelfde config naar beide functies en een
--     config die de ene weigert hoort de andere ook te weigeren.
--   * `gebruik_k_cel` wordt hergebruikt; die is alleen voor de eigenaar
--     uitvoerbaar en de definer-functie roept 'm als eigenaar aan.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie:
--   drop function if exists public.admin_gebruik_doorstroom(integer, boolean, jsonb);
-- Geen data, geen afhankelijken in de database. NIET `gebruik_k_cel` meedroppen:
-- admin_gebruik_analyse() gebruikt die ook.
--
-- ── LEAK-CHECK (verwachtingen) ────────────────────────────────────────────────
--   * anon          rpc admin_gebruik_doorstroom(…)            → 42501 (geen EXECUTE)
--   * authenticated rpc admin_gebruik_doorstroom(…)            → 42501 (geen EXECUTE)
--   * JWT-rol authenticated zonder rolwissel (bodycheck)       → 42501
--   * service_role  rpc admin_gebruik_doorstroom(90,false,cfg) → ok, jsonb
--   * service_role  p_dagen = 7 / onbekende module / 7 stromen / dubbele id → 22023
--   * output bevat geen uuid, geen '@', geen `YYYY-MM-DD`
--
-- ── Live gemeten vóór schrijven (17-09-2026, read-only via execute_sql) ───────
--   * `schema_migrations` vanaf 20260916: 20260916120000, 20260917120000,
--     20260917121000 — A en B zijn live; 20260917123000 is vrij.
--   * `pg_proc`: admin_gebruik_analyse(integer,boolean,jsonb) bestaat met ACL
--     `{postgres=X/postgres,service_role=X/postgres}`, en de live definitie
--     bevat het disjuncte predicaat `p_intern = coalesce(…)`.
--   * `pg_proc`: gebruik_k_cel(bigint,integer) bestaat met ACL
--     `{postgres=X/postgres}` (ook ingetrokken van service_role).
--   * `pg_proc`: admin_gebruik_doorstroom bestaat niet.
--   * Schemafeiten van profiles/user_activity_* zijn dezelfde als gemeten in de
--     kop van 20260917121000 (zelfde dag).

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

  v_start := v_vandaag - p_dagen + 1;

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
  genummerd as (      -- actieve dagen in het venster, per gebruiker genummerd
    select d.user_id, d.day,
      row_number() over (partition by d.user_id order by d.day) as stap,
      count(*) over (partition by d.user_id) as aantal_dagen
    from public.user_activity_days d
    join segment s on s.user_id = d.user_id
    where d.day between v_start and v_vandaag
  ),
  gebruikers as (
    select distinct g.user_id, g.aantal_dagen from genummerd g
  ),
  stroomdagen as (
    select distinct st.idx, m.user_id, m.day
    from public.user_activity_modules m
    join segment s on s.user_id = m.user_id
    join stromen st on m.module = any (st.modules)
    where m.day between v_start and v_vandaag
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
