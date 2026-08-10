-- Grenzenpotten — MEERDERE REGELS per pot + fijnere periodes (dag/week)
--
-- ── WAT VERANDERT ER, EN WAAROM KAN DAT NIET ZONDER MIGRATIE ────────────────
-- Fase 1 legde de regel PLAT IN DE POT-RIJ: één `budget_id` óf één
-- `counterparty_key`, afgedwongen door de CHECK `spend_limits_rule_shape`. Twee
-- wensen breken dat model tegelijk:
--
--   1. MEERDERE REGELS PER POT, elk met MEERDERE budgetten en/of MEERDERE
--      tegenpartijen. Combinatie-semantiek (vastgelegd met de eigenaar, 10-08-2026):
--        · binnen één dimensie  = OF   ("één van deze budgetten")
--        · tussen de dimensies  = EN   (budget X én tegenpartij Y)
--        · tussen regels        = UNIE (alles telt op tegen één grensbedrag)
--      Een platte rij kan hooguit één waarde per dimensie dragen; dit vraagt dus
--      een eigen regel-tabel.
--
--   2. DAG- EN WEEKGRENZEN. De bestaande aggregaten (`tx_month_aggregate`,
--      `tx_counterparty_month_aggregate`) groeperen per KALENDERMAAND. Uit een
--      maandsom is een dag- of weekbedrag per definitie niet af te leiden — geen
--      afronding, maar informatie die er niet is.
--
-- En er is een derde, minder zichtbare reden waarom een NIEUWE aggregaat-functie
-- onvermijdelijk is: de EN-combinatie zelf. `tx_month_aggregate` levert sommen
-- per budget, `tx_counterparty_month_aggregate` sommen per tegenpartij-sleutel.
-- "Budget X ÉN tegenpartij Y" is uit geen van beide te berekenen — de doorsnede
-- van twee sommen is geen som. Dat moet in SQL, op transactieniveau, in één
-- aggregaat dat niet op de PostgREST `max_rows`-cap kan afkappen.
--
-- ── WAT BEWUST BLIJFT ───────────────────────────────────────────────────────
--   * ON-THE-FLY, NIETS OPGESLAGEN (keuze A, ADR 0089). Er komt geen
--     periode-uitkomst-tabel bij; refunds, correcties en regelwijzigingen blijven
--     per definitie idempotent omdat er maar één waarheid is: de transacties.
--   * EIGEN RIJ, own-row RLS. Een grenzenpot is een persoonlijke gedragsnorm;
--     de regels erven exact hetzelfde toegangsmodel als de pot.
--   * SECURITY INVOKER op alle functies. Wát een pot telt is geen RLS-vraag: de
--     SELECT-policy op `transactions` (eigen + gedeelde huishoudrijen) geldt
--     onverkort. Nooit met de service-role aanroepen.
--   * PARITY met TypeScript op de tegenpartij-sleutel via
--     `public.spend_limit_counterparty_key()` — ongewijzigd hergebruikt.
--
-- ── WAT MET DE OUDE KOLOMMEN GEBEURT ────────────────────────────────────────
-- `spend_limits.rule_type / budget_id / include_child_budgets / counterparty_key
-- / counterparty_label` worden LEGACY. Ze worden niet gedropt (een DROP COLUMN
-- is onomkeerbaar en zou tijdens een rollende deploy oude servercode breken),
-- maar hun constraints worden gelost en er wordt niet meer naar geschreven. De
-- bestaande inhoud wordt eenmalig naar `spend_limit_rules` gebackfilled. Een
-- COMMENT markeert ze als afgedankt zodat een latere lezer niet alsnog gaat
-- consumeren wat niet meer bijgehouden wordt.
--
-- Alles idempotent (IF NOT EXISTS / DROP … IF EXISTS / NOT EXISTS-backfill)
-- zodat re-apply een no-op is.

-- ── 1. Regel-tabel ──────────────────────────────────────────────────────────
--
-- ── WAAROM ARRAYS EN GEEN KOPPELTABELLEN ────────────────────────────────────
-- De regel wordt ALTIJD IN ZIJN GEHEEL gelezen (de loader haalt alle regels van
-- alle potten van één gebruiker op) en ALTIJD IN ZIJN GEHEEL geschreven (het
-- formulier stuurt de complete configuratie terug). Er is geen enkele query die
-- "welke regels raken budget X" vraagt. Twee koppeltabellen zouden dus drie
-- joins en twee extra RLS-policiesets kosten voor precies nul leesvragen.
--
-- ── WAAROM DAN GEEN FOREIGN KEY OP DE BUDGET-IDS ────────────────────────────
-- Een `uuid[]` kan geen FK dragen. Dat is hier een AANVAARDE keuze, geen
-- omissie, om twee redenen:
--   * VEILIGHEID: een verzonnen of vreemd budget-id kan niets lekken. De
--     aggregaat-functie hieronder is SECURITY INVOKER en scant uitsluitend
--     transacties die de RLS-policy de aanroeper tóch al toont; een id dat niet
--     van jou is, matcht simpelweg nul rijen. De API-route toetst bovendien
--     eigenaarschap vóór het schrijven.
--   * GEDRAG: de oude `budget_id REFERENCES budgets(id) ON DELETE CASCADE` liet
--     een grenzenpot STIL VERDWIJNEN zodra iemand een budget opruimde. Zonder FK
--     blijft de pot bestaan en valt alleen die ene verwijzing weg — de loader
--     ziet dan een onbekende naam en het oppervlak zegt dat eerlijk. Dat is de
--     betere uitkomst, en hij volgt hier uit het model in plaats van uit een
--     extra trigger.

CREATE TABLE IF NOT EXISTS public.spend_limit_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_limit_id        UUID NOT NULL REFERENCES public.spend_limits(id) ON DELETE CASCADE,
  -- Eigen kolom en niet "via de pot": own-row RLS zonder subquery per rij.
  -- FK → auth.users ON DELETE CASCADE conform de AVG-norm sinds
  -- 20260721140000_avg_ondelete_fk_erasure.sql.
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Volgorde in het formulier. Puur weergave; de uitkomst van de pot is een
  -- unie en dus per definitie volgorde-onafhankelijk.
  sort_order            INTEGER NOT NULL DEFAULT 0,

  budget_ids            UUID[] NOT NULL DEFAULT '{}',
  include_child_budgets BOOLEAN NOT NULL DEFAULT true,

  -- Genormaliseerde zoeksleutels + de schrijfwijzen die de gebruiker koos. De
  -- twee arrays lopen PARALLEL (element i hoort bij element i) en worden
  -- uitsluitend samen geschreven door `spend_limit_replace_rules` hieronder.
  counterparty_keys     TEXT[] NOT NULL DEFAULT '{}',
  counterparty_labels   TEXT[] NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Een regel zonder enige dimensie matcht niets en zou stil nul tellen.
  CONSTRAINT spend_limit_rules_not_empty CHECK (
    cardinality(budget_ids) > 0 OR cardinality(counterparty_keys) > 0
  ),

  -- De twee tegenpartij-arrays zijn één geheel; ongelijke lengtes zouden een
  -- sleutel zonder uitleg (of andersom) opleveren.
  CONSTRAINT spend_limit_rules_counterparty_pairs CHECK (
    cardinality(counterparty_keys) = cardinality(counterparty_labels)
  ),

  -- Vormcheck op de sleutels, exact de reden van de scalaire variant op
  -- `spend_limits.counterparty_key`: own-row RLS staat toe dat een gebruiker
  -- deze kolom via PostgREST zélf schrijft. `array_to_string(…, '')` plakt alle
  -- elementen aan elkaar — blijft die concatenatie binnen [0-9A-Z], dan geldt
  -- dat per definitie ook voor elk element afzonderlijk. NULL-elementen worden
  -- door array_to_string overgeslagen en daarom apart uitgesloten.
  CONSTRAINT spend_limit_rules_counterparty_key_shape CHECK (
    array_to_string(counterparty_keys, '') ~ '^[0-9A-Z]*$'
    AND array_position(counterparty_keys, NULL) IS NULL
    AND array_position(counterparty_labels, NULL) IS NULL
    AND array_position(budget_ids, NULL) IS NULL
  ),

  -- Amplificatie-rem in het SCHEMA en niet alleen in de route: elke sleutel
  -- drijft in de aggregaat-functie een eigen deeltekst-vergelijking over het
  -- venster. Via de app zijn dit er een handvol; de tabel is met de publieke
  -- anon-key rechtstreeks beschrijfbaar onder own-row RLS.
  CONSTRAINT spend_limit_rules_size CHECK (
    cardinality(budget_ids) <= 200 AND cardinality(counterparty_keys) <= 50
  )
);

COMMENT ON TABLE public.spend_limit_rules IS
  'De regels van één grenzenpot. Combinatie-semantiek: binnen een dimensie OF (één van deze budgetten / één van deze tegenpartijen), tussen de dimensies EN (budget én tegenpartij), tussen regels UNIE tegen één grensbedrag. Wordt altijd in zijn geheel gelezen en geschreven; schrijven loopt via public.spend_limit_replace_rules() zodat de tegenpartij-sleutels serverzijdig uit de labels worden afgeleid.';
COMMENT ON COLUMN public.spend_limit_rules.budget_ids IS
  'Budget-ids waarop deze regel matcht (OF-lijst). Bewust GEEN foreign key: een uuid[] kan er geen dragen, een vreemd id kan niets lekken (de aggregaat-functie is SECURITY INVOKER), en het vermijdt de ON DELETE CASCADE die een grenzenpot vroeger stil liet verdwijnen bij het opruimen van een budget.';
COMMENT ON COLUMN public.spend_limit_rules.counterparty_keys IS
  'Genormaliseerde tegenpartij-zoeksleutels (OF-lijst), geproduceerd door public.spend_limit_counterparty_key(). Loopt parallel aan counterparty_labels. Matching is normalised-contains, exact zoals fase 1.';

-- Enige leespaden: "de regels van deze pot" (join vanuit de loader) en de
-- own-row RLS-check. Beide gedekt.
CREATE INDEX IF NOT EXISTS spend_limit_rules_limit_idx
  ON public.spend_limit_rules USING btree (spend_limit_id);
CREATE INDEX IF NOT EXISTS spend_limit_rules_user_idx
  ON public.spend_limit_rules USING btree (user_id);

-- ── 2. RLS — vier eigen-rij-policies, gespiegeld aan spend_limits ───────────

ALTER TABLE public.spend_limit_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spend_limit_rules own select" ON public.spend_limit_rules;
CREATE POLICY "spend_limit_rules own select" ON public.spend_limit_rules
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "spend_limit_rules own insert" ON public.spend_limit_rules;
CREATE POLICY "spend_limit_rules own insert" ON public.spend_limit_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- USING én WITH CHECK: zonder WITH CHECK kan een update de rij naar een andere
-- user_id schrijven (USING toetst alleen de OUDE rij).
DROP POLICY IF EXISTS "spend_limit_rules own update" ON public.spend_limit_rules;
CREATE POLICY "spend_limit_rules own update" ON public.spend_limit_rules
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "spend_limit_rules own delete" ON public.spend_limit_rules;
CREATE POLICY "spend_limit_rules own delete" ON public.spend_limit_rules
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 3. De pot-rij losmaken van de oude platte regelvorm ────────────────────
--
-- De drie constraints hieronder beschrijven allemaal het ÉÉN-REGEL-model en
-- zouden een pot met nul (of gemengde) legacy-kolommen blokkeren.

ALTER TABLE public.spend_limits DROP CONSTRAINT IF EXISTS spend_limits_rule_shape;
ALTER TABLE public.spend_limits DROP CONSTRAINT IF EXISTS spend_limits_rule_type_check;
ALTER TABLE public.spend_limits ALTER COLUMN rule_type DROP NOT NULL;

-- Dag en week erbij. Kwartaal en jaar blijven bestaan: bestaande potten die
-- daarop staan moeten ongewijzigd blijven werken (de eigenaar koos expliciet
-- "dag/week erbij, rest blijft", 10-08-2026).
ALTER TABLE public.spend_limits DROP CONSTRAINT IF EXISTS spend_limits_period_check;
ALTER TABLE public.spend_limits
  ADD CONSTRAINT spend_limits_period_check
  CHECK (period IN ('day', 'week', 'month', 'quarter', 'year'));

COMMENT ON COLUMN public.spend_limits.period IS
  'Kalenderperiode: day | week | month | quarter | year. Dag en week draaien op public.spend_limit_rule_aggregate met p_grain = day/week; maand, kwartaal en jaar op p_grain = month (alle drie vallen op kalendermaandgrenzen). Week = ISO-week, maandag als eerste dag.';
COMMENT ON COLUMN public.spend_limits.rule_type IS
  'LEGACY (t/m 09-08-2026). De regels van een pot staan sinds 10-08-2026 in public.spend_limit_rules; deze kolom wordt niet meer geschreven en niet meer gelezen. Niet gedropt om een rollende deploy niet te breken. Het soort pot (budget / tegenpartij / gemengd) wordt afgeleid uit de regels.';
COMMENT ON COLUMN public.spend_limits.budget_id IS
  'LEGACY — zie rule_type. Vervangen door spend_limit_rules.budget_ids.';
COMMENT ON COLUMN public.spend_limits.counterparty_key IS
  'LEGACY — zie rule_type. Vervangen door spend_limit_rules.counterparty_keys.';

-- ── 4. Backfill — elke bestaande pot krijgt exact zijn huidige regel ────────
--
-- Idempotent via NOT EXISTS: potten die al een regel hebben worden overgeslagen,
-- dus re-apply is een no-op en een tweede run kan geen dubbele regel maken.
-- Draait als migratierol (RLS niet van toepassing), maar schrijft `user_id`
-- letterlijk over uit de pot-rij zodat de policies daarna kloppen.
INSERT INTO public.spend_limit_rules (
  spend_limit_id, user_id, sort_order,
  budget_ids, include_child_budgets, counterparty_keys, counterparty_labels
)
SELECT
  sl.id,
  sl.user_id,
  0,
  CASE WHEN sl.budget_id IS NOT NULL THEN ARRAY[sl.budget_id] ELSE '{}'::uuid[] END,
  coalesce(sl.include_child_budgets, true),
  CASE WHEN sl.counterparty_key IS NOT NULL THEN ARRAY[sl.counterparty_key] ELSE '{}'::text[] END,
  -- Label kan in theorie leeg zijn; dan is de sleutel zelf de eerlijkste tekst.
  CASE WHEN sl.counterparty_key IS NOT NULL
       THEN ARRAY[coalesce(nullif(sl.counterparty_label, ''), sl.counterparty_key)]
       ELSE '{}'::text[] END
FROM public.spend_limits sl
WHERE (sl.budget_id IS NOT NULL OR sl.counterparty_key IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.spend_limit_rules r WHERE r.spend_limit_id = sl.id
  );

-- ── 5. Het regel-aggregaat ─────────────────────────────────────────────────
--
-- ── WAAROM ÉÉN FUNCTIE VOOR ALLE REGELS VAN ALLE POTTEN ────────────────────
-- De aanroeper geeft alle regels in één keer mee (`p_rules`, met een stabiele
-- `i` per regel) en krijgt de sommen per regel terug. Zo hangt het aantal
-- database-calls aan de LENGTE VAN HET VENSTER, niet aan het aantal potten —
-- exact het patroon dat de loader in fase 5 al hanteerde.
--
-- ── WAAROM DIT NIET OP MAX_ROWS KAN AFKAPPEN (de fout-klasse die telt) ──────
-- PostgREST kapt elk antwoord af op `max_rows` (=1000), óók bij een hogere
-- `.limit()`. Een rij-lus over transacties zou voor tx-rijke gebruikers STIL een
-- te lage overschrijding tonen; die fout-klasse trad in deze repo al twee keer
-- op (20260719131916_perf_tx_month_aggregates en de spaarquote-canon van
-- 29-07-2026). Deze functie levert één rij per
-- (regel × bucket × transactietype × budget), en het budget in die sleutel
-- bestaat ALLEEN bij maand-korrel op een budget-only regel — precies de vorm die
-- `tx_month_aggregate` vandaag al heeft, maar dan vooraf gefilterd op de
-- budgetten van de regel en dus strikt kleiner. De aanroeper knipt het venster
-- daarnaast in stukken en draagt een kanarie voor het geval een stuk tóch op de
-- cap terugkomt.
--
-- ── DE DRIE KORRELS ────────────────────────────────────────────────────────
--   day   → bucket_start = de dag zelf
--   week  → bucket_start = de MAANDAG van de ISO-week (extract(isodow) = 1..7)
--   month → bucket_start = de eerste van de maand
-- De aanroeper kiest de korrel die bij de periodesoort hoort; maand, kwartaal en
-- jaar delen de maand-korrel omdat ze alle drie op kalendermaandgrenzen vallen.
-- Een bucket kan daardoor NOOIT over een periodegrens heen liggen — de reden dat
-- de motor kan volstaan met "ligt bucket_start binnen [since, until]" en er geen
-- tweede datumrekening in SQL nodig is.
--
-- ── DE COMBINATIE-SEMANTIEK, LETTERLIJK ────────────────────────────────────
--   budgetten leeg      → deze dimensie legt geen beperking op
--   budgetten gevuld    → t.budget_id moet in de lijst zitten            (OF)
--   sleutels leeg       → deze dimensie legt geen beperking op
--   sleutels gevuld     → minstens één sleutel zit in de genormaliseerde
--                         tegenpartijnaam                                (OF)
--   beide gevuld        → beide voorwaarden gelden                       (EN)
--
-- ── EN DE UNIE TUSSEN REGELS: HIER, NIET IN DE LOADER ──────────────────────
-- Twee regels van dezelfde pot kunnen dezelfde transactie raken ("budget
-- Boodschappen" én "tegenpartij Gorillas"). Zou deze functie per regel
-- aggregeren en de aanroeper die sommen optellen, dan telde die transactie
-- DUBBEL — een stil te hoge overschrijding, precies de fout-klasse die dit
-- ontwerp overal elders uitsluit. Elke transactie wordt daarom binnen zijn POT
-- aan precies ÉÉN regel toegerekend: die met de laagste `i` (DISTINCT ON).
-- Gevolg, en bewust zo:
--   * de som over alle regels van een pot IS de ontdubbelde pot-som;
--   * de per-regel-uitsplitsing leest als "wat ving deze regel als eerste",
--     een welgedefinieerde toerekening in plaats van een dubbeltelling.
-- `p` (de potindex) hoort daarom in de invoer: zonder die groepering zou de
-- ontdubbeling over potten heen lopen en zou een transactie die in twee POTTEN
-- meetelt uit de tweede verdwijnen — en dát mag juist wél (potten sluiten
-- elkaar niet uit, ADR 0089 / D38).
--
-- ── position() EN NIET LIKE ────────────────────────────────────────────────
-- Bij `LIKE '%'||key||'%'` zijn '%' en '_' in de sleutel wildcards en zou de SQL
-- méér matchen dan de TS-uitleg (`String.includes`) toont: hetzelfde scherm,
-- twee waarheden. `position(… in …) > 0` is de letterlijke spiegel.
--
-- GEEN NIEUWE INDEX: de tegenpartij-match is een normalised-CONTAINS en daar kan
-- geen btree op. De scan wordt begrensd door het datumvenster + RLS via de
-- bestaande indexen `transactions(user_id, date DESC)` en
-- `transactions(household_id, date DESC) WHERE shared`. Zelfde afweging als
-- fase 1, hier bewust herhaald zodat ze niet stil is.

DROP FUNCTION IF EXISTS public.spend_limit_rule_aggregate(jsonb, date, date, text);

CREATE FUNCTION public.spend_limit_rule_aggregate(
  p_rules jsonb,
  p_from  date,
  p_to    date,
  p_grain text DEFAULT 'month'
)
RETURNS TABLE (
  rule_index       integer,
  bucket_start     date,
  budget_id        uuid,
  transaction_type text,
  sum_positief     numeric,
  sum_negatief     numeric,
  count            bigint,
  matched_names    text[]
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
      -- Amplificatie-remmen. De app blijft hier ruim onder; de RPC is met de
      -- publieke anon-key rechtstreeks aanroepbaar, dus de grenzen staan hier
      -- en niet alleen in de route.
      AND jsonb_array_length(coalesce(p_rules, '[]'::jsonb)) <= 100
      AND cardinality(coalesce(r.b, '{}'::uuid[])) <= 200
      AND cardinality(coalesce(r.k, '{}'::text[])) <= 50
      -- Een regel zonder dimensies zou op ALLE zichtbare transacties matchen.
      AND (cardinality(coalesce(r.b, '{}'::uuid[])) > 0
        OR cardinality(coalesce(r.k, '{}'::text[])) > 0)
  ),
  -- Ontdubbeling BINNEN de pot: elke transactie hoogstens één keer, toegerekend
  -- aan de regel met de laagste index. Zie het kopcommentaar — dit is de plek
  -- waar de unie-semantiek woont.
  treffers AS (
    SELECT DISTINCT ON (ru.pot, t.id)
      ru.idx,
      ru.keys,
      t.id,
      t.date,
      t.amount,
      t.transaction_type,
      t.budget_id,
      t.counterparty_name
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
    ORDER BY ru.pot, t.id, ru.idx
  )
  SELECT
    m.idx                                                             AS rule_index,
    CASE
      WHEN p_grain = 'day'  THEN m.date
      WHEN p_grain = 'week' THEN m.date - (extract(isodow FROM m.date)::integer - 1)
      ELSE date_trunc('month', m.date::timestamp)::date
    END                                                               AS bucket_start,
    -- De budget-uitsplitsing bestaat alleen waar ze goedkoop én zinvol is: op
    -- maand-korrel voor een regel zonder tegenpartij-dimensie. Bij dag-korrel
    -- zou (31 dagen × budgetten × types) de rijcap kunnen halen, en bij een
    -- gemengde regel zegt "welk budget" niets over waaróm de transactie meetelt.
    CASE
      WHEN p_grain = 'month' AND cardinality(m.keys) = 0 THEN m.budget_id
      ELSE NULL
    END                                                               AS budget_id,
    m.transaction_type,
    coalesce(sum(m.amount) FILTER (WHERE m.amount > 0), 0)::numeric    AS sum_positief,
    coalesce(sum(m.amount) FILTER (WHERE m.amount < 0), 0)::numeric    AS sum_negatief,
    count(*)::bigint                                                   AS count,
    -- Alleen bij een regel mét tegenpartij-dimensie: dáár is "welke namen
    -- telden mee" de uitleg. Bij een budget-regel zou het de rijen opblazen met
    -- iets wat het oppervlak niet toont.
    array_agg(DISTINCT m.counterparty_name)
      FILTER (WHERE cardinality(m.keys) > 0 AND m.counterparty_name IS NOT NULL)
                                                                       AS matched_names
  FROM treffers m
  GROUP BY 1, 2, 3, 4
$$;

-- REVOKE PUBLIC haalt de pseudorol weg; REVOKE anon haalt de expliciete grant
-- weg die ALTER DEFAULT PRIVILEGES bij CREATE zet (zie de uitleg in
-- 20260808160000_create_tx_counterparty_name_breakdown.sql). Beide zijn nodig:
-- deze functie geeft tegenpartij-NAMEN terug, niet enkel sommen.
REVOKE ALL ON FUNCTION public.spend_limit_rule_aggregate(jsonb, date, date, text) FROM public;
REVOKE ALL ON FUNCTION public.spend_limit_rule_aggregate(jsonb, date, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.spend_limit_rule_aggregate(jsonb, date, date, text) TO authenticated;

COMMENT ON FUNCTION public.spend_limit_rule_aggregate(jsonb, date, date, text) IS
  'Sommen per grenzenpot-REGEL over [p_from, p_to), gebucketeerd op dag, ISO-week (maandag) of maand. p_rules = [{"p":<potindex>,"i":<regelindex>,"b":[budget-uuid,…],"k":["SLEUTEL",…]}]. Binnen een dimensie OF, tussen de dimensies EN, tussen de regels van dezelfde pot UNIE: elke transactie wordt per pot aan precies één regel toegerekend (de laagste i), zodat optellen over de regels van een pot de ontdubbelde pot-som geeft. Over POTTEN heen wordt bewust niet ontdubbeld — een uitgave mag in meer dan één pot meetellen. Aggregaat, geen rij-lus: kan niet op PostgREST max_rows afkappen. budget_id is alleen gevuld bij maand-korrel op een regel zonder tegenpartij-dimensie (voedt de per-budget-uitsplitsing). SECURITY INVOKER: de SELECT-policy van transactions (eigen + gedeelde huishoudrijen) geldt onverkort.';

-- ── 6. Atomair de regels van één pot vervangen ─────────────────────────────
--
-- ── WAAROM EEN FUNCTIE EN GEEN DELETE + INSERT VANUIT DE ROUTE ─────────────
-- Elke PostgREST-call is zijn eigen transactie. Een route die eerst verwijdert
-- en dan invoegt, laat bij een mislukte tweede stap een pot ZONDER regels
-- achter — die telt stil nul en ziet er in de UI uit als "je geeft niets uit".
-- Deze functie draait beide statements in één transactie.
--
-- ── WAAROM DE SLEUTELS HIER WORDEN AFGELEID EN NIET MEEGESTUURD ────────────
-- De client stuurt uitsluitend LABELS (wat de gebruiker koos of typte); de
-- sleutel komt uit `public.spend_limit_counterparty_key()`. Zo kan een client
-- geen sleutel meesturen die afwijkt van zijn eigen label, en zit de sleutel per
-- definitie in het formaat dat de aggregaat-functie én de CHECK verwachten.
-- Labels die na normalisatie niets overhouden ("!!!") vallen weg — mét hun
-- label, zodat de twee arrays parallel blijven. Houdt een regel daardoor geen
-- enkele dimensie over, dan slaat de CHECK `spend_limit_rules_not_empty` toe en
-- faalt de hele call: liever een zichtbare fout dan een pot die stil nul telt.
--
-- SECURITY INVOKER: de own-row policies op beide tabellen gelden onverkort. De
-- eigenaarschapscheck hieronder is dus dubbelop — de vangrail die een gemiste
-- policy als expliciete fout zichtbaar maakt in plaats van als stille no-op.

DROP FUNCTION IF EXISTS public.spend_limit_replace_rules(uuid, jsonb);

CREATE FUNCTION public.spend_limit_replace_rules(
  p_limit_id uuid,
  p_rules    jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := (select auth.uid());
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.spend_limits WHERE id = p_limit_id AND user_id = v_uid;
  IF NOT FOUND THEN
    -- "Bestaat niet" en "is van iemand anders" geven hetzelfde antwoord, zodat
    -- er geen existence-oracle over andermans pot-ids ontstaat.
    RAISE EXCEPTION 'Onbekende grenzenpot' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.spend_limit_rules WHERE spend_limit_id = p_limit_id;

  INSERT INTO public.spend_limit_rules (
    spend_limit_id, user_id, sort_order,
    budget_ids, include_child_budgets, counterparty_keys, counterparty_labels
  )
  SELECT
    p_limit_id,
    v_uid,
    coalesce(r.sort_order, 0),
    coalesce(r.budget_ids, '{}'::uuid[]),
    coalesce(r.include_child_budgets, true),
    -- Twee subquery's over dezelfde bron met dezelfde filter en dezelfde
    -- ORDER BY op de ordinaliteit: de arrays blijven gegarandeerd parallel.
    (SELECT coalesce(array_agg(public.spend_limit_counterparty_key(l.v) ORDER BY l.n), '{}'::text[])
       FROM unnest(coalesce(r.counterparty_labels, '{}'::text[])) WITH ORDINALITY AS l(v, n)
      WHERE public.spend_limit_counterparty_key(l.v) <> ''),
    (SELECT coalesce(array_agg(l.v ORDER BY l.n), '{}'::text[])
       FROM unnest(coalesce(r.counterparty_labels, '{}'::text[])) WITH ORDINALITY AS l(v, n)
      WHERE public.spend_limit_counterparty_key(l.v) <> '')
  FROM jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb))
    AS r(sort_order integer, budget_ids uuid[], include_child_budgets boolean, counterparty_labels text[]);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_limit_replace_rules(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.spend_limit_replace_rules(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.spend_limit_replace_rules(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.spend_limit_replace_rules(uuid, jsonb) IS
  'Vervangt in één transactie alle regels van één grenzenpot. p_rules = [{"sort_order":0,"budget_ids":[…],"include_child_budgets":true,"counterparty_labels":["Shell",…]}]. De genormaliseerde zoeksleutels worden hier serverzijdig uit de labels afgeleid (public.spend_limit_counterparty_key) — de client stuurt ze nooit mee. SECURITY INVOKER: own-row RLS op beide tabellen geldt; de expliciete eigenaarscheck is de vangrail die een gemiste policy als fout zichtbaar maakt.';
