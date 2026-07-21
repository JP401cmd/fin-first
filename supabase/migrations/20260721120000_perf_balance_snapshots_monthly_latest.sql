-- Perf/correctheid (FASE 2 · vervolg T2.2): latest-per-maand aggregaat over
-- balance_snapshots.
--
-- WAAROM: `lib/core-data-loader.ts` (categorie-sparklines op de Kern-kaart) haalde
-- ALLE balance_snapshots over de afgelopen 12 maanden ONGELIMITEERD op om er in JS
-- de laatste snapshot per (entity_id, kalendermaand) uit te reduceren. Twee
-- problemen:
--   1. EGRESS: opgehaald = entiteiten × snapshot-frequentie-in-venster (bij
--      dagelijkse snapshots ≈ ×365) terwijl alleen entiteiten × 12 nodig is —
--      tot ~30× te veel data.
--   2. STILLE AFKAP: net als de ruwe transactie-fetches (T2.2) kapt PostgREST elk
--      antwoord af op `max_rows` (config.toml = 1000). Een power-user met veel
--      entiteiten × dagelijkse snapshots kan >1000 rijen raken → sparklines STIL
--      afgekapt (latente correctheidsbug). Een latest-per-maand aggregaat levert
--      per definitie ≤ entiteiten × 12 rijen en kan niet afkappen.
--
-- TOEGANGSMODEL (leesfunctie over persoonlijke financiële data):
--   • SECURITY INVOKER (nooit DEFINER): draait met de rechten én de RLS van de
--     aanroeper. De bestaande SELECT-policy op `balance_snapshots`
--     ("Users can view own balance snapshots": user_id = auth.uid()) geldt
--     onverkort — de functie kan geen rij teruggeven die de aanroeper niet óók via
--     een gewone select zou zien. balance_snapshots kent (anders dan transactions)
--     GEEN household-share policy: eigen rijen only, identiek aan de vroegere
--     `.from('balance_snapshots')`-query.
--   • search_path = '' + volledig gekwalificeerde namen (Supabase-hardening).
--   • EXECUTE alleen voor authenticated + anon. De SELECT-policy is `to
--     authenticated`; anon matcht geen policy → 0 rijen, géén fout (conventie).
--     PUBLIC krijgt niets.
--
-- OUTPUT: één rij per (entity_id, kalendermaand 'YYYY-MM') met de balance +
-- net_worth_inclusion_pct van de LAATSTE snapshot in die maand (DISTINCT ON …
-- ORDER BY snapshot_date DESC). Byte-identiek aan wat de JS-reductie eruit haalde
-- (stap 1-2 in core-data-loader): meest recente snapshot per entiteit per maand.
-- De weging (× net_worth_inclusion_pct/100) en de per-categorie backward/forward-
-- fill blijven in JS.

drop function if exists public.balance_snapshots_monthly_latest(date);

create function public.balance_snapshots_monthly_latest(
  p_from date
)
returns table (
  entity_id uuid,
  entity_type text,
  entity_subtype text,
  month text,
  balance numeric,
  net_worth_inclusion_pct numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (bs.entity_id, date_trunc('month', bs.snapshot_date))
    bs.entity_id,
    bs.entity_type,
    bs.entity_subtype,
    to_char(bs.snapshot_date, 'YYYY-MM')          as month,
    bs.balance,
    bs.net_worth_inclusion_pct
  from public.balance_snapshots bs
  where bs.snapshot_date >= p_from
  order by
    bs.entity_id,
    date_trunc('month', bs.snapshot_date),
    bs.snapshot_date desc,
    bs.id desc
$$;

revoke all on function public.balance_snapshots_monthly_latest(date) from public;
grant execute on function public.balance_snapshots_monthly_latest(date) to authenticated, anon;

comment on function public.balance_snapshots_monthly_latest(date) is
  'FASE 2 (vervolg T2.2): latest-per-(entity_id, maand) snapshot over [p_from, ∞). SECURITY INVOKER — own-row RLS van balance_snapshots geldt (geen household-share). Vervangt de afkap-gevoelige + egress-zware ongelimiteerde 12-mnd balance_snapshots-fetch in core-data-loader (categorie-sparklines).';
