-- Grenzenpotten — SQL↔TS-parity op de transfer-uitsluiting van de naam-uitsplitsing.
--
-- ── WAT HIER FOUT WAS ───────────────────────────────────────────────────────
-- `tx_counterparty_name_breakdown` (migratie 20260808160000) telde ÁLLE
-- transactietypes mee, terwijl de rekenmotor (`computePeriodOutcome` in
-- lib/spend-limits/engine.ts, via `isCountable` → `isRealAggRow`) eigen-rekening-
-- overboekingen juist uitsluit. Op één en hetzelfde scherm stonden daardoor twee
-- optellingen naast elkaar: het canonieke periodebedrag zónder overboekingen, en
-- een per-naam-uitsplitsing mét. Bij een pot die toevallig overboekingen matcht
-- ("SHELL SPAARPOT") kon de som van de top-N daardoor HOGER uitvallen dan het
-- bedrag waar hij een uitsplitsing van heet te zijn — de route klemde de restpost
-- dan op 0 en de gebruiker zag een uitsplitsing die niet optelde.
--
-- Dit is geen randgeval-poetswerk maar de kern van het ontwerp: de uitsplitsing is
-- UITLEG bij het canonieke bedrag. Legt de uitleg een andere verzameling uit dan
-- het bedrag, dan is de uitleg onwaar.
--
-- ── HET PARITY-PAAR (documenteer beide helften bij elke wijziging) ───────────
--   SQL  : deze functie — `coalesce(t.transaction_type, '') NOT IN ('transfer','joint_transfer')`
--   TS   : `isRealAggRow` in lib/server-data/tx-aggregates.ts —
--          `!new Set(['transfer','joint_transfer']).has(row.transaction_type ?? '')`
-- Beide behandelen NULL als "wél meetellen" (coalesce → '' resp. `?? ''`), beide
-- kennen exact dezelfde twee typenamen. Dit is hetzelfde soort hand-geborgde
-- parity als `public.spend_limit_counterparty_key` ↔ `spendLimitCounterpartyKey()`:
-- er is geen geautomatiseerde test die beide talen naast elkaar uitvoert, dus wie
-- de ene helft aanraakt, raakt de andere aan. Zie ook het aandachtspunt in
-- lib/architecture/archimate-concerns.ts.
--
-- ── WAAROM CREATE OR REPLACE EN GEEN DROP + CREATE ──────────────────────────
-- Signatuur, kolomnamen en returntype blijven identiek; alleen het WHERE-predikaat
-- verandert. `CREATE OR REPLACE` behoudt daarbij de bestaande ACL, zodat er geen
-- venster ontstaat waarin de functie even zonder grants staat. De REVOKE/GRANT
-- hieronder worden tóch herhaald: op een verse database creëert deze migratie de
-- functie alsnog van nul, en dán zet `ALTER DEFAULT PRIVILEGES` in schema public
-- (gemeten 08-08-2026: `anon=X/postgres`) er automatisch een EXPLICIETE anon-grant
-- op. `REVOKE … FROM public` haalt alleen de PUBLIC-pseudorol weg en raakt die
-- expliciete grant NIET — vandaar de aparte `REVOKE … FROM anon`. Deze functie
-- geeft NAMEN terug, geen sommen; anon heeft er niets te zoeken.
--
-- Toegangsmodel verder ongewijzigd t.o.v. 20260808160000: SECURITY INVOKER (de
-- SELECT-policy van public.transactions geldt onverkort — geen amplificatie),
-- `SET search_path = ''` met volledig gekwalificeerde namen, half-open
-- datumvenster [p_from, p_to), `position()` in plaats van LIKE (wildcard-immuun),
-- harde rijbegrenzing op 50 (kan de PostgREST max_rows-cap niet raken).
--
-- Idempotent: re-apply is een no-op.

CREATE OR REPLACE FUNCTION public.tx_counterparty_name_breakdown(
  p_from     date,
  p_to       date,
  p_key      text,
  p_limit    integer DEFAULT 20,
  p_own_only boolean DEFAULT false
)
RETURNS TABLE (
  counterparty_name text,
  sum_positief      numeric,
  sum_negatief      numeric,
  count             bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    t.counterparty_name,
    coalesce(sum(t.amount) FILTER (WHERE t.amount > 0), 0)::numeric  AS sum_positief,
    coalesce(sum(t.amount) FILTER (WHERE t.amount < 0), 0)::numeric  AS sum_negatief,
    count(*)::bigint                                                 AS count
  FROM public.transactions t
  WHERE t.counterparty_name IS NOT NULL
    -- Amplificatie-rem: zonder deze guard is `position('' in x) > 0` ALTIJD waar
    -- en zou een lege sleutel de volledige zichtbare historie groeperen.
    AND coalesce(p_key, '') <> ''
    AND position(p_key in public.spend_limit_counterparty_key(t.counterparty_name)) > 0
    -- DE PARITY-REGEL. Eigen-rekening-overboekingen zijn geen uitgave; ze zouden
    -- de uitsplitsing opblazen t.o.v. het canonieke periodebedrag. Letterlijke
    -- spiegel van isRealAggRow() in lib/server-data/tx-aggregates.ts, inclusief de
    -- NULL-behandeling (NULL telt mee).
    AND coalesce(t.transaction_type, '') NOT IN ('transfer', 'joint_transfer')
    AND t.date >= p_from
    AND t.date <  p_to
    AND (NOT p_own_only OR t.user_id = (select auth.uid()))
  GROUP BY t.counterparty_name
  -- Meest negatief eerst = grootste uitgave bovenaan; de naam als tweede sleutel
  -- houdt de snede deterministisch, want de aanroeper berekent de rest-bucket als
  -- "canoniek periodebedrag minus de som van deze top-N".
  ORDER BY sum(t.amount) ASC, t.counterparty_name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
$$;

REVOKE ALL ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) FROM public;
REVOKE ALL ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) IS
  'Top-N schrijfwijzen binnen één genormaliseerde tegenpartij-sleutel over één periodevenster [p_from, p_to), gesorteerd op grootste uitgave (deterministische tiebreak op naam). Sluit (joint_)transfer-rijen uit — PARITY-CONTRACT met isRealAggRow() in lib/server-data/tx-aggregates.ts, zodat de uitsplitsing exact dezelfde verzameling beschrijft als het canonieke periodebedrag uit computePeriodOutcome(). Maximaal 50 rijen — kan niet op PostgREST max_rows afkappen. Rest-bucket wordt in de API-route berekend (periodebedrag uit het rapport minus de som van de top-N), niet hier. SECURITY INVOKER: de SELECT-policy van transactions (eigen + gedeelde huishoudrijen) geldt onverkort. EXECUTE alleen voor authenticated — anon is expliciet ingetrokken omdat deze functie namen teruggeeft, geen sommen. Tweede parity-contract: spendLimitCounterpartyKey() in lib/spend-limits/counterparty-key.ts.';
