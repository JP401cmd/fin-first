-- Grenzenpotten — persoonlijke uitgavengrens per periode (fase 1)
--
-- Een "Grenzenpot" maakt zichtbaar hoeveel iemand uitgeeft BOVEN een zelfgekozen
-- grens, zonder dat daar een spaardoel aan hangt. Voorbeeld: maximaal €50 per
-- maand aan tankstations; alles daarboven is de overschrijding.
--
-- ── WAAROM `spend_limits` en niet `pots` ────────────────────────────────────
-- "Pot" is in deze codebase al bezet door een compleet ander concept:
-- `profiles.pot_rules` (+ lib/pot-rules.ts, app/api/pot-rules) beschrijft de
-- onttrekkings-/verdeelvolgorde over vermogensgroepen op /toekomst. Een tabel
-- `pots` ernaast is verwarrend voor zowel mens als grep. De naamneutrale
-- identifier is hier dus noodzaak, geen nettigheid: intern heet alles
-- spend_limit(s); "Grenzenpot" is UITSLUITEND een weergavenaam en leeft in één
-- copy-map in de frontend (lib/spend-limits/copy.ts). Zie ADR 0089.
--
-- ── TOEGANGSMODEL ───────────────────────────────────────────────────────────
--   * Eigen rij, vier policies, allemaal `auth.uid() = user_id`. Een grenzenpot
--     is een PERSOONLIJKE gedragsnorm ("ik geef te veel uit aan tankstations"),
--     geen huishoudelijke afspraak — het gedeelde equivalent (het huishoudbudget)
--     bestaat al. Gedeeld eigenaarschap zou een extra UPDATE-policy plus een
--     owner-immutable-trigger vergen (zie 20260611000000_household_budget_shared_write)
--     en wordt hier niet terugverdiend.
--   * Gedeeld eigenaarschap is óók niet nodig om huishouddata te TELLEN: de
--     bestaande SELECT-policy op `transactions` geeft een gebruiker zijn eigen
--     rijen plus de gedeelde huishoudrijen, en de aggregaat-RPC's hieronder zijn
--     SECURITY INVOKER. Wát de pot telt is dus geen RLS-vraag.
--   * FK → auth.users ON DELETE CASCADE conform de AVG-norm sinds
--     20260721140000_avg_ondelete_fk_erasure.sql.
--
-- ── BEWUST AFWEZIG IN DIT SCHEMA ────────────────────────────────────────────
--   * GEEN `timezone`-kolom. `transactions.date` is een Postgres `date` — er is
--     geen tijdstempel om te interpreteren, dus een tijdzone-instelling kan per
--     definitie geen enkel getal veranderen. De oorspronkelijke eis vervalt.
--   * GEEN `goal_amount` / `target_amount` / `minimum`. Een grenzenpot is
--     expliciet géén spaardoel; de enige norm is de uitgavengrens. Dat hoort in
--     het schema zichtbaar te zijn, niet alleen in de UI.
--   * GEEN `spend_limit_periods`-tabel. De uitkomst wordt on-the-fly uit de
--     transacties herrekend (keuze A, ADR 0089): daarmee zijn refunds,
--     chargebacks, correcties, dubbele boekingen en retroactieve herberekening
--     per definitie idempotent — er is maar één waarheid, de transacties.
--   * GEEN `display_alias`. De alias Grenzenpot/Schaamtepot is een
--     weergavevoorkeur, geen pot-eigenschap (fase 5).
--   * GEEN `perspective`-kolom. Fase 1 telt exact dezelfde transacties als het
--     overzicht: eigen + gedeelde huishoudboekingen, ongeschaald (ownOnly=false
--     op de RPC's). Een keuzekolom die maar één waarde kent is een leugen in het
--     schema; huishoud-/persoonlijk perspectief is fase 5.
--
-- Alles idempotent (IF NOT EXISTS / DROP … IF EXISTS) zodat re-apply een no-op is.

-- ── 1. Tabel ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.spend_limits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name                  TEXT NOT NULL,
  purpose               TEXT,

  -- Twee regeltypen, niet drie: "onderwerp/categorie" VALT SAMEN met "budget".
  -- Er is in dit datamodel geen canonieke categoriekolom en geen merchant
  -- category — de categorie ÍS `transactions.budget_id`.
  rule_type             TEXT NOT NULL
    CONSTRAINT spend_limits_rule_type_check
    CHECK (rule_type IN ('budget', 'counterparty')),

  budget_id             UUID REFERENCES public.budgets(id) ON DELETE CASCADE,
  include_child_budgets BOOLEAN NOT NULL DEFAULT true,

  -- Genormaliseerde zoeksleutel (zie public.spend_limit_counterparty_key).
  -- De CHECK is geen cosmetiek: de API leidt de sleutel serverzijdig af, maar
  -- own-row RLS staat toe dat een gebruiker deze kolom via PostgREST zélf
  -- schrijft. Zonder deze vorm-eis kan daar een '%' of '_' in belanden, en dat
  -- zijn LIKE-wildcards — de SQL zou dan meer matchen dan de TS-uitleg
  -- (`.includes()`) toont: hetzelfde scherm, twee waarheden. Cross-user is dat
  -- onmogelijk (de RPC is SECURITY INVOKER), maar een parity-breuk op je eigen
  -- data is precies wat dit ontwerp wil uitsluiten.
  counterparty_key      TEXT
    CONSTRAINT spend_limits_counterparty_key_shape
    CHECK (counterparty_key IS NULL OR counterparty_key ~ '^[0-9A-Z]+$'),
  -- Wat de gebruiker koos/typte — puur voor weergave en uitleg.
  counterparty_label    TEXT,

  limit_amount          NUMERIC NOT NULL
    CONSTRAINT spend_limits_limit_amount_check CHECK (limit_amount >= 0),

  -- 'month' is het enige type dat fase 1 uitrekent; kwartaal/jaar staan in de
  -- check omdat `resolvePeriodWindow` ze al kent en de API ze in fase 5 zonder
  -- migratie kan vrijgeven. De zod-schema's laten voorlopig alleen 'month' toe.
  period                TEXT NOT NULL DEFAULT 'month'
    CONSTRAINT spend_limits_period_check CHECK (period IN ('month', 'quarter', 'year')),

  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_archived           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- De regelvorm is exclusief: een budget-pot draagt geen tegenpartij-sleutel
  -- en omgekeerd. Zonder deze check kan een halfvolle rij ontstaan waarop de
  -- rekenmotor stilzwijgend niets matcht.
  CONSTRAINT spend_limits_rule_shape CHECK (
    (rule_type = 'budget'       AND budget_id IS NOT NULL AND counterparty_key IS NULL) OR
    (rule_type = 'counterparty' AND counterparty_key IS NOT NULL AND budget_id IS NULL)
  )
);

COMMENT ON TABLE public.spend_limits IS
  'Grenzenpotten: een persoonlijke uitgavengrens per kalenderperiode, per budget of per tegenpartij. Bewust naamneutraal (pot is bezet door profiles.pot_rules). Geen spaardoel: het schema draagt met opzet geen doel-/minimumbedrag. De uitkomst per periode wordt NIET opgeslagen maar on-the-fly herrekend uit tx_month_aggregate / tx_counterparty_month_aggregate — zie ADR 0089.';
COMMENT ON COLUMN public.spend_limits.counterparty_key IS
  'Genormaliseerde tegenpartij-zoeksleutel, geproduceerd door public.spend_limit_counterparty_key(). Matching is normalised-contains: een transactie telt mee als de genormaliseerde counterparty_name deze sleutel als deeltekst bevat.';
COMMENT ON COLUMN public.spend_limits.period IS
  'Kalenderperiode. Fase 1 rekent uitsluitend month uit; quarter/year staan in de check-constraint zodat fase 5 geen migratie nodig heeft.';

-- ── 2. Index ────────────────────────────────────────────────────────────────

-- Enige leespad: "alle niet-gearchiveerde potten van deze gebruiker".
-- Dekt tevens de FK-kolom user_id.
CREATE INDEX IF NOT EXISTS spend_limits_user_active_idx
  ON public.spend_limits USING btree (user_id)
  WHERE NOT is_archived;

-- ── 3. RLS — vier eigen-rij-policies ────────────────────────────────────────

ALTER TABLE public.spend_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spend_limits own select" ON public.spend_limits;
CREATE POLICY "spend_limits own select" ON public.spend_limits
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "spend_limits own insert" ON public.spend_limits;
CREATE POLICY "spend_limits own insert" ON public.spend_limits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- USING én WITH CHECK: zonder WITH CHECK zou een update de rij naar een andere
-- user_id kunnen schrijven (USING toetst alleen de OUDE rij).
DROP POLICY IF EXISTS "spend_limits own update" ON public.spend_limits;
CREATE POLICY "spend_limits own update" ON public.spend_limits
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "spend_limits own delete" ON public.spend_limits;
CREATE POLICY "spend_limits own delete" ON public.spend_limits
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 4. Tegenpartij-normalisatie ─────────────────────────────────────────────
--
-- PARITY-CONTRACT met TypeScript. Deze functie MOET exact hetzelfde doen als
-- `spendLimitCounterpartyKey()` in lib/spend-limits/counterparty-key.ts —
-- anders matcht de uitleg in de UI ("waarom telt dit mee?") niet met de som die
-- de database teruggeeft. De regel is daarom bewust minimaal en letterlijk te
-- spiegelen: strip alles wat geen ASCII-letter of -cijfer is, en zet om naar
-- hoofdletters.
--
-- WAAROM `COLLATE "C"`: in een collatie-bewuste bracket-expressie is de range
-- `A-Za-z` NIET gegarandeerd puur-ASCII — in een locale die aAbBcC… sorteert
-- kan 'é' binnen de range vallen en dus blijven staan, terwijl het JS-regexje
-- 'em wél strip. Dat is precies de stille drift die deze functie moet uitsluiten.
-- Onder de C-collatie zijn ranges pure codepoint-ranges en is het resultaat
-- locale-onafhankelijk — en daarmee eerlijk IMMUTABLE.
--
-- BEWUST NIET hergebruikt: lib/parsers/counterparty-normalize.ts. Die functie
-- strip PSP-prefixen, kassanummers en rechtsvormen — nuttig voor fuzzy
-- categorisatie, maar niet in SQL te spiegelen zonder een tweede waarheid te
-- maken. Voor een grens die de gebruiker zelf instelt weegt letterlijk
-- uitlegbaar zwaarder dan slim. Zie ADR 0089.

CREATE OR REPLACE FUNCTION public.spend_limit_counterparty_key(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT upper(regexp_replace(coalesce(p_raw, '') COLLATE "C", '[^0-9A-Za-z]', '', 'g'))
$$;

-- Hardening-patroon van 20260617000001_harden_purge_revoke_public: geen impliciete
-- PUBLIC-EXECUTE laten staan, ook niet op een functie die geen tabel raakt.
REVOKE ALL ON FUNCTION public.spend_limit_counterparty_key(text) FROM public;
GRANT EXECUTE ON FUNCTION public.spend_limit_counterparty_key(text) TO authenticated;

COMMENT ON FUNCTION public.spend_limit_counterparty_key(text) IS
  'Normaliseert een tegenpartij-tekst tot een zoeksleutel: strip alles buiten [0-9A-Za-z] (onder COLLATE "C", dus locale-onafhankelijk) en zet om naar hoofdletters. MOET byte-identiek blijven aan spendLimitCounterpartyKey() in lib/spend-limits/counterparty-key.ts.';

-- ── 5. Tegenpartij-maandaggregaat ───────────────────────────────────────────
--
-- WAAROM EEN AGGREGAAT EN GEEN RIJ-LUS: PostgREST kapt elk antwoord af op
-- `max_rows` (=1000), óók bij een hogere `.limit()`. Een tegenpartij-pot die de
-- transactierijen zelf zou optellen, zou voor tx-rijke gebruikers STIL een te
-- lage overschrijding tonen — een correctheidsbug, geen performanceprobleem.
-- Precies die fout-klasse is in deze repo al twee keer opgetreden (zie
-- 20260719131916_perf_tx_month_aggregates.sql en de spaarquote-canon van
-- 29-07-2026). Deze functie levert per (sleutel, maand, transaction_type)
-- exact één rij en kán dus niet afkappen.
--
-- Toegangsmodel identiek aan tx_month_aggregate: SECURITY INVOKER (de RLS van
-- `transactions` geldt onverkort — geen cross-user-lek mogelijk),
-- search_path = '' + volledig gekwalificeerde namen, EXECUTE voor
-- authenticated + anon (anon matcht geen SELECT-policy → 0 rijen, geen fout).
--
-- GEEN NIEUWE INDEX: de match is een normalised-CONTAINS, en daar kan geen
-- btree-index op. De scan wordt begrensd door het datumvenster + RLS via de
-- bestaande indexen `transactions(user_id, date DESC)` en
-- `transactions(household_id, date DESC) WHERE shared`. Een trigram-index zou
-- een extensie-afhankelijkheid toevoegen voor een handvol potten per gebruiker;
-- dat is niet terugverdiend. Bewust vastgelegd zodat de afweging niet stil is.

DROP FUNCTION IF EXISTS public.tx_counterparty_month_aggregate(date, date, text[], boolean);

CREATE FUNCTION public.tx_counterparty_month_aggregate(
  p_from date,
  p_to date,
  p_keys text[],
  p_own_only boolean DEFAULT false
)
RETURNS TABLE (
  counterparty_key text,
  month text,
  transaction_type text,
  sum_positief numeric,
  sum_negatief numeric,
  count bigint,
  matched_names text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    k.key                                                           AS counterparty_key,
    to_char(t.date, 'YYYY-MM')                                      AS month,
    t.transaction_type,
    coalesce(sum(t.amount) FILTER (WHERE t.amount > 0), 0)::numeric  AS sum_positief,
    coalesce(sum(t.amount) FILTER (WHERE t.amount < 0), 0)::numeric  AS sum_negatief,
    count(*)::bigint                                                AS count,
    array_agg(DISTINCT t.counterparty_name)                          AS matched_names
  FROM unnest(p_keys) AS k(key)
  JOIN public.transactions t
    ON t.counterparty_name IS NOT NULL
   AND k.key <> ''
   -- `position(… in …) > 0` en NIET `LIKE '%'||key||'%'`: bij LIKE zijn '%' en
   -- '_' in de sleutel wildcards, waardoor de SQL méér zou matchen dan de
   -- TS-uitleg (`String.includes`) toont. Dit is de letterlijke spiegel van
   -- `.includes()` en daarmee wildcard-immuun.
   AND position(k.key in public.spend_limit_counterparty_key(t.counterparty_name)) > 0
  WHERE t.date >= p_from
    AND t.date <  p_to
    -- Amplificatie-rem: elke sleutel drijft een eigen scan over het venster.
    -- Via de app zijn dat er een handvol, maar de RPC is met de publieke
    -- anon-key rechtstreeks aanroepbaar — zonder bovengrens kan één request met
    -- duizenden sleutels de gedeelde database belasten.
    AND cardinality(p_keys) <= 100
    AND (NOT p_own_only OR t.user_id = (select auth.uid()))
  GROUP BY 1, 2, 3
$$;

-- Alleen `authenticated`, bewust NIET ook `anon` zoals tx_month_aggregate doet:
-- die functie voedt loaders die ook op een half-ingelogd pad kunnen draaien,
-- deze twee worden uitsluitend vanuit ingelogde routes aangeroepen. Anon zou
-- sowieso nul rijen zien (de SELECT-policy op transactions is `to authenticated`),
-- dus dit kost niets en scheelt oppervlak.
REVOKE ALL ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) TO authenticated;

COMMENT ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) IS
  'Maandaggregaat per genormaliseerde tegenpartij-zoeksleutel over [p_from, p_to). Één rij per (sleutel, maand, transaction_type) — kan dus niet op PostgREST max_rows afkappen. matched_names toont welke tegenpartij-namen daadwerkelijk matchten (uitleg in de UI). SECURITY INVOKER: de RLS van transactions geldt.';

-- ── 6. Tegenpartij-suggesties voor de keuzelijst ────────────────────────────
--
-- Voedt de picker bij het instellen van een tegenpartij-pot: de meest-uitgegeven
-- tegenpartijen van de gebruiker, met hun genormaliseerde sleutel. Óók dit is
-- een aggregaat en geen rij-lus, om exact dezelfde afkap-reden.
-- Het label is de meest-voorkomende schrijfwijze binnen de sleutel (mode);
-- bij gelijkspel wint alfabetisch de eerste, zodat de uitkomst stabiel is.

DROP FUNCTION IF EXISTS public.tx_counterparty_suggestions(date, date, integer, boolean);

CREATE FUNCTION public.tx_counterparty_suggestions(
  p_from date,
  p_to date,
  p_limit integer DEFAULT 40,
  p_own_only boolean DEFAULT false
)
RETURNS TABLE (
  counterparty_key text,
  label text,
  total_uitgegeven numeric,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    public.spend_limit_counterparty_key(t.counterparty_name)          AS counterparty_key,
    (array_agg(t.counterparty_name ORDER BY t.counterparty_name))[1]  AS label,
    abs(coalesce(sum(t.amount) FILTER (WHERE t.amount < 0), 0))::numeric AS total_uitgegeven,
    count(*)::bigint                                                  AS count
  FROM public.transactions t
  WHERE t.date >= p_from
    AND t.date <  p_to
    AND t.counterparty_name IS NOT NULL
    AND public.spend_limit_counterparty_key(t.counterparty_name) <> ''
    AND (NOT p_own_only OR t.user_id = (select auth.uid()))
  GROUP BY 1
  HAVING coalesce(sum(t.amount) FILTER (WHERE t.amount < 0), 0) < 0
  ORDER BY 3 DESC
  LIMIT greatest(1, least(coalesce(p_limit, 40), 200))
$$;

REVOKE ALL ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) IS
  'Meest-uitgegeven tegenpartijen over [p_from, p_to), gegroepeerd op de genormaliseerde zoeksleutel — voedt de keuzelijst bij het instellen van een tegenpartij-grenzenpot. Aggregaat (geen rij-lus): kan niet op PostgREST max_rows afkappen. SECURITY INVOKER.';
