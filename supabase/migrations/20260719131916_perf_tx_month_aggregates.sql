-- Perf/correctheid (FASE 2 · Task 2.2): maand-aggregaat over transacties.
--
-- WAAROM: de server-loaders (dashboard/horizon/lever) haalden DUIZENDEN ruwe
-- transactie-rijen op om er in JS SUM/GROUP-BY op te doen. PostgREST kapt elk
-- antwoord af op `max_rows` (config.toml = 1000) — óók als de client een hogere
-- `.limit()` vraagt. Voor gebruikers met >1000 transacties per venster werden de
-- 12-/6-maands sommen (inkomen-extrapolatie, spaarquote, dagtarief) daardoor
-- STIL te laag: een correctheidsbug, niet enkel performance. Een aggregaat levert
-- per definitie enkele rijen (12 maanden × budgetten × types) en kan niet afkappen.
--
-- TOEGANGSMODEL (dit is een leesfunctie over persoonlijke financiële data):
--   • SECURITY INVOKER (nooit DEFINER): de functie draait met de rechten én de
--     RLS van de aanroeper. De bestaande SELECT-policy op `transactions`
--     ("View own or shared transactions": eigen rijen OF gedeelde huishoud-rijen)
--     geldt onverkort — de functie kan per definitie geen rij teruggeven die de
--     aanroeper niet óók via een gewone select zou zien. Geen cross-user-lek
--     mogelijk (huishouden-leaktest + anon-test in het rapport).
--   • p_own_only=true beperkt extra tot `user_id = auth.uid()` (eigen rijen,
--     ZONDER gedeelde huishoud-rijen) — spiegelt de lever-scores-loader die
--     bewust `.eq('user_id', ...)` deed. Default false = RLS-breed (eigen +
--     gedeeld), identiek aan dashboard/horizon die op RLS leunden.
--   • search_path = '' + volledig gekwalificeerde namen (Supabase-hardening).
--   • EXECUTE alleen voor authenticated + anon. anon draait de functie ook onder
--     RLS: de SELECT-policy is `to authenticated`, dus anon matcht geen policy →
--     0 rijen, géén fout (conventie). PUBLIC krijgt niets.
--
-- OUTPUT: één rij per (maand YYYY-MM, budget_id, transaction_type) met de som van
-- de positieve en de negatieve bedragen (numeric = exact) + de telling. De
-- loaders reduceren die rijen terug tot exact dezelfde getallen als voorheen
-- (transfer-filter blijft in JS via transaction_type, per loader verschillend).

drop function if exists public.tx_month_aggregate(date, date, boolean);

create function public.tx_month_aggregate(
  p_from date,
  p_to date,
  p_own_only boolean default false
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
  select
    to_char(t.date, 'YYYY-MM')                                    as month,
    t.budget_id,
    t.transaction_type,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::numeric as sum_positief,
    coalesce(sum(t.amount) filter (where t.amount < 0), 0)::numeric as sum_negatief,
    count(*)::bigint                                              as count
  from public.transactions t
  where t.date >= p_from
    and t.date <  p_to
    and (not p_own_only or t.user_id = (select auth.uid()))
  group by 1, 2, 3
$$;

revoke all on function public.tx_month_aggregate(date, date, boolean) from public;
grant execute on function public.tx_month_aggregate(date, date, boolean) to authenticated, anon;

comment on function public.tx_month_aggregate(date, date, boolean) is
  'FASE 2 T2.2: maand-aggregaat (som pos/neg + count) per (maand, budget_id, transaction_type) over [p_from, p_to). SECURITY INVOKER — RLS van transactions geldt. p_own_only=true beperkt tot eigen rijen (excl. gedeeld huishouden). Vervangt afkap-gevoelige ruwe 12-/6-mnd fetches.';
