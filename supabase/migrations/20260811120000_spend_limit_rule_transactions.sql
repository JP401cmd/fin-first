-- Grenzenpotten — DE LOSSE TRANSACTIES achter één periode.
--
-- ── WAT DIT TOEVOEGT, EN WAAROM HET EEN EIGEN FUNCTIE IS ────────────────────
-- `public.spend_limit_rule_aggregate` (migratie 20260810120000) geeft BEWUST geen
-- rijen terug: hij is een aggregaat juist omdat een rij-lus over transacties op
-- de PostgREST `max_rows`-cap kan afkappen en dan STIL een te lage overschrijding
-- toont. Die functie blijft dus onaangeraakt — de sommen op het scherm komen
-- onverkort daarvandaan.
--
-- Deze functie beantwoordt een andere vraag: "laat me zien wélke boekingen in
-- deze periode meetelden". Dat is per definitie een LIJST, en dus expliciet
-- begrensd. De begrenzing is hier geen ongeluk maar het contract:
--   * de SQL klemt hard op 200 rijen (zie `p_limit`), ruim onder de cap van 1000,
--     zodat dit antwoord NOOIT stil op max_rows kan afkappen;
--   * "er zijn er meer dan we tonen" leidt de AANROEPER af uit het CANONIEKE
--     aantal (`computePeriodOutcome().matchedTransactionCount` over hetzelfde
--     regel-aggregaat) versus het aantal teruggegeven rijen — niet uit de vraag
--     of deze functie zijn eigen LIMIT raakte. Zo blijft er één telling die
--     leidend is, en levert het verschil gratis een parity-controle op.
--
-- ── SECURITY INVOKER, EN HIER NOG NADRUKKELIJKER DAN ELDERS ─────────────────
-- Deze functie geeft NAMEN én OMSCHRIJVINGEN van boekingen terug — het meest
-- persoonlijke materiaal in de app. `SECURITY DEFINER` zou de SELECT-policy van
-- `public.transactions` omzeilen en deze persoonlijke lijst in een cross-user
-- lezing veranderen. Dus INVOKER, en de policy geldt onverkort:
--   gemeten tegen `pg_policy` (11-08-2026): "View own or shared transactions",
--   FOR SELECT TO authenticated,
--   USING (auth.uid() = user_id
--          OR (ownership = 'shared' AND household_id IS NOT NULL
--              AND household_id = user_household_id()))
-- Eigen boekingen plus gedeelde huishoudboekingen, ongeschaald — exact dezelfde
-- verzameling die de pot telt (ADR 0089). Nooit met getServiceClient() aanroepen.
--
-- ── GRANTS STRIKTER DAN HET AGGREGAAT ───────────────────────────────────────
-- Hetzelfde patroon als `tx_counterparty_name_breakdown`: `REVOKE … FROM public`
-- haalt de pseudorol weg, `REVOKE … FROM anon` de EXPLICIETE grant die
-- `ALTER DEFAULT PRIVILEGES` in schema public bij CREATE zet. Beide zijn nodig.
-- anon heeft bij omschrijvingen helemaal niets te zoeken.
--
-- ── TRANSFER-PARITEIT (dezelfde fout-klasse als migratie 20260808170000) ─────
-- `computePeriodOutcome` (lib/spend-limits/engine.ts, via `isCountable` →
-- `isRealAggRow` in lib/server-data/tx-aggregates.ts) sluit eigen-rekening-
-- overboekingen uit. Zonder identiek filter zou deze lijst boekingen tonen die
-- in het bedrag ernaast helemaal niet zitten — een uitsplitsing die een ándere
-- verzameling beschrijft dan het geheel waar ze bij hoort. Dat is precies wat
-- 20260808170000 voor de naam-uitsplitsing moest repareren. Derde helft van
-- hetzelfde HAND-GEBORGDE parity-paar; wie de ene aanraakt, raakt de andere aan:
--   SQL : `coalesce(t.transaction_type, '') NOT IN ('transfer','joint_transfer')`
--   TS  : `isRealAggRow` — `!new Set(['transfer','joint_transfer']).has(type ?? '')`
-- Beide behandelen NULL als "wél meetellen".
--
-- ── ONTDUBBELEN VÓÓR DE LIMIET (de volgorde is de correctheid) ──────────────
-- Twee regels van dezelfde pot kunnen dezelfde transactie raken. De ontdubbeling
-- is daarom identiek aan die van het aggregaat: `DISTINCT ON (ru.pot, t.id)` met
-- `ORDER BY ru.pot, t.id, ru.idx` — elke transactie hoogstens één keer, toegerekend
-- aan de regel met de laagste index. Die DISTINCT ON zit in een SUBQUERY, met de
-- weergavesortering (`date DESC, id`) en de LIMIT eróverheen. Andersom zou de
-- limiet toeslaan vóór het ontdubbelen (je krijgt dan minder unieke boekingen dan
-- gevraagd, zonder dat iets dat zegt) en zou de volgorde die van de ontdubbeling
-- zijn — op transactie-id, dus willekeurig voor een lezer.
--
-- Over POTTEN heen wordt bewust NIET ontdubbeld: een uitgave mag in meer dan één
-- pot meetellen. Vandaar `p` in de invoer, net als bij het aggregaat.
--
-- ── AMPLIFICATIE-REMMEN: LETTERLIJK DIE VAN HET AGGREGAAT ───────────────────
-- ≤100 regels, ≤200 budgetten per regel, ≤50 sleutels per regel, en geen
-- dimensieloze regel (die zou op ÁLLE zichtbare transacties matchen). De RPC is
-- met de publieke anon-key rechtstreeks aanroepbaar door elke ingelogde
-- gebruiker, dus de grenzen staan hier en niet alleen in de route.
--
-- `position()` en niet LIKE: bij `LIKE '%'||key||'%'` zijn '%' en '_' wildcards en
-- zou de SQL méér matchen dan de TS-uitleg (`String.includes`) toont.
--
-- GEEN NIEUWE INDEX: de tegenpartij-match is een normalised-CONTAINS en daar kan
-- geen btree op. Het datumvenster + RLS begrenzen de scan via de bestaande
-- indexen op `transactions`. Zelfde afweging als het aggregaat.
--
-- Idempotent (DROP … IF EXISTS + CREATE): re-apply is een no-op.

DROP FUNCTION IF EXISTS public.spend_limit_rule_transactions(jsonb, date, date, integer);

CREATE FUNCTION public.spend_limit_rule_transactions(
  p_rules jsonb,
  p_from  date,
  p_to    date,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id                uuid,
  date              date,
  counterparty_name text,
  description       text,
  amount            numeric,
  budget_id         uuid,
  rule_index        integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH regels AS (
    SELECT
      r.p                                     AS pot,
      r.i                                     AS idx,
      coalesce(r.b, '{}'::uuid[])             AS budget_ids,
      coalesce(r.k, '{}'::text[])             AS keys
    FROM jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb))
      AS r(p integer, i integer, b uuid[], k text[])
    WHERE r.i IS NOT NULL
      AND r.p IS NOT NULL
      AND jsonb_array_length(coalesce(p_rules, '[]'::jsonb)) <= 100
      AND cardinality(coalesce(r.b, '{}'::uuid[])) <= 200
      AND cardinality(coalesce(r.k, '{}'::text[])) <= 50
      AND (cardinality(coalesce(r.b, '{}'::uuid[])) > 0
        OR cardinality(coalesce(r.k, '{}'::text[])) > 0)
  ),
  treffers AS (
    SELECT DISTINCT ON (ru.pot, t.id)
      ru.idx AS rule_index,
      t.id,
      t.date,
      t.counterparty_name,
      t.description,
      t.amount,
      t.budget_id
    FROM regels ru
    JOIN public.transactions t
      ON (cardinality(ru.budget_ids) = 0 OR t.budget_id = ANY (ru.budget_ids))
     AND (cardinality(ru.keys) = 0 OR EXISTS (
           SELECT 1
           FROM unnest(ru.keys) AS kk
           WHERE kk <> ''
             AND position(kk IN public.spend_limit_counterparty_key(t.counterparty_name)) > 0
         ))
    WHERE t.date >= p_from
      AND t.date <  p_to
      -- DE PARITY-REGEL, zie de kop. Staat vóór de ontdubbeling: een overboeking
      -- mag ook geen plek in de lijst opsouperen.
      AND coalesce(t.transaction_type, '') NOT IN ('transfer', 'joint_transfer')
    ORDER BY ru.pot, t.id, ru.idx
  )
  SELECT
    m.id,
    m.date,
    m.counterparty_name,
    m.description,
    m.amount,
    m.budget_id,
    m.rule_index
  FROM treffers m
  -- Nieuwste eerst; `id` als tweede sleutel houdt de snede deterministisch, zodat
  -- twee keer dezelfde vraag twee keer dezelfde lijst geeft.
  ORDER BY m.date DESC, m.id
  -- Hard geklemd in SQL, niet alleen in de route (spiegelt de 50-klem van
  -- tx_counterparty_name_breakdown). `greatest(1, …)` vangt een negatieve of
  -- nul-waarde af: LIMIT met een negatief getal is een harde fout.
  LIMIT greatest(1, least(coalesce(p_limit, 200), 200))
$$;

REVOKE ALL ON FUNCTION public.spend_limit_rule_transactions(jsonb, date, date, integer) FROM public;
REVOKE ALL ON FUNCTION public.spend_limit_rule_transactions(jsonb, date, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.spend_limit_rule_transactions(jsonb, date, date, integer) TO authenticated;

COMMENT ON FUNCTION public.spend_limit_rule_transactions(jsonb, date, date, integer) IS
  'De losse TRANSACTIES die binnen [p_from, p_to) door de regels van een grenzenpot worden geraakt — de rij-tegenhanger van public.spend_limit_rule_aggregate, met exact dezelfde regelvorm (p_rules = [{"p":<potindex>,"i":<regelindex>,"b":[budget-uuid,…],"k":["SLEUTEL",…]}]), dezelfde combinatie-semantiek (binnen een dimensie OF, tussen de dimensies EN) en dezelfde ontdubbeling per pot (DISTINCT ON op de laagste regelindex) — die hier BEWUST vóór de LIMIT staat. Sluit (joint_)transfer-rijen uit: PARITY-CONTRACT met isRealAggRow() in lib/server-data/tx-aggregates.ts, zodat de lijst exact dezelfde verzameling beschrijft als het canonieke periodebedrag uit computePeriodOutcome(). Maximaal 200 rijen — kan niet op de PostgREST max_rows-cap afkappen; of er MEER zijn dan getoond leidt de aanroeper af uit matchedTransactionCount van de motor, niet uit deze LIMIT. SECURITY INVOKER — dwingend, want deze functie geeft tegenpartijnamen én omschrijvingen terug: de SELECT-policy van transactions (eigen + gedeelde huishoudrijen) geldt onverkort. EXECUTE alleen voor authenticated; anon expliciet ingetrokken.';
