-- Grenzenpotten fase 2 — per-naam-uitsplitsing binnen één tegenpartij-sleutel.
--
-- WAT: welke schrijfwijzen ("SHELL 1234", "Shell Nederland", "SHELL #57") zitten
-- er achter de som die een tegenpartij-grenzenpot toont, binnen ÉÉN periodevenster?
-- De pane (B1) roept dit on-demand aan als de gebruiker op een periode klikt.
-- De standaardweergave van de pane doet nul extra fetches; alleen dit is on-demand.
--
-- ── WAAROM TOP-N + REST, EN GEEN PER-MAAND × PER-NAAM-VARIANT ───────────────
-- PostgREST kapt elk antwoord af op `max_rows` (=1000), óók bij een hogere
-- `.limit()` — een stil te laag getal, geen foutmelding. Precies die fout-klasse
-- trad in deze repo al twee keer op (20260719131916_perf_tx_month_aggregates en
-- de spaarquote-canon van 29-07-2026). Deze functie levert per aanroep
-- `min(N, aantal namen)` rijen met een harde bovengrens van 50, dus structureel
-- ver onder de cap. Een per-maand × per-naam-variant (13 mnd × 40 namen × 2
-- types > 1000) zou die cap wél kunnen halen en bestaat daarom niet.
-- De rest-bucket wordt in de API-route berekend (periodebedrag uit het rapport
-- minus de som van de top-N) — niet hier, want het periodebedrag is al canoniek
-- bekend uit tx_counterparty_month_aggregate en een tweede optelling in SQL zou
-- een tweede waarheid zijn.
--
-- ── TOEGANGSMODEL — GEMETEN TEGEN DE LIVE DATABASE OP 08-08-2026 ────────────
-- Niet overgenomen uit een migratiebestand; elk feit hieronder is gelezen uit
-- pg_class / pg_policy / pg_proc / pg_default_acl op de remote database.
--   * pg_class.relrowsecurity op public.transactions = true.
--   * pg_policy op public.transactions levert vier policies; de enige die telt
--     voor deze functie is de SELECT-policy "View own or shared transactions",
--     TO authenticated:
--         USING ((select auth.uid()) = user_id
--                OR (ownership = 'shared' AND household_id IS NOT NULL
--                    AND household_id = (select user_household_id())))
--     Deze functie is SECURITY INVOKER en erft die policy dus ONVERKORT: ze kan
--     per definitie geen naam tonen uit een rij die de gebruiker niet toch al
--     ziet. Geen amplificatie t.o.v. fase 1 (NFR-B1-04).
--   * `SET search_path = ''` + volledig gekwalificeerde namen, exact zoals
--     tx_counterparty_month_aggregate.
--
-- ── GRANTS: WAAROM HIER OOK EXPLICIET `FROM anon` WORDT INGETROKKEN ─────────
-- GEMETEN OP 08-08-2026 tegen pg_default_acl: in schema public staat een
-- ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
-- service_role (defaclobjtype 'f' → anon=X/postgres). Een nieuw aangemaakte
-- functie krijgt die grant dus AUTOMATISCH en EXPLICIET aan de rol `anon`.
-- `REVOKE ALL … FROM public` haalt alleen de PUBLIC-pseudorol weg en raakt die
-- expliciete anon-grant NIET. Gevolg, óók live gemeten: de fase-1-functies
-- tx_counterparty_month_aggregate en tx_counterparty_suggestions dragen vandaag
-- `anon=X/postgres` in hun proacl, terwijl hun migratie-comment stelt dat anon
-- bewust géén EXECUTE heeft. Dat is geen lek (de SELECT-policy op transactions
-- is `TO authenticated`, dus anon ziet nul rijen), maar het is wél een claim die
-- niet klopt. Deze functie geeft NAMEN terug en niet enkel sommen; daarom wordt
-- de anon-grant hier expliciet ingetrokken in plaats van erop te vertrouwen dat
-- REVOKE PUBLIC dat doet. De fase-1-functies worden in deze migratie NIET
-- aangepast — dat is een aparte afweging, apart gemeld.
--
-- ── HALF-OPEN DATUMVENSTER [p_from, p_to) ───────────────────────────────────
-- Exact dezelfde conventie als tx_counterparty_month_aggregate en
-- tx_counterparty_suggestions: `>= p_from AND < p_to`. Elke andere keuze laat
-- een periodegrens dubbel tellen of wegvallen zodra de aanroeper hetzelfde
-- venster in stukken knipt (de loader doet dat, chunking per kalenderjaar).
--
-- ── position() EN NIET LIKE ────────────────────────────────────────────────
-- Bij `LIKE '%'||p_key||'%'` zouden '%' en '_' in de sleutel wildcards zijn en
-- zou de SQL méér matchen dan de TS-uitleg (String.includes) toont: hetzelfde
-- scherm, twee waarheden. `position(… in …) > 0` is de letterlijke spiegel van
-- `.includes()` en daarmee wildcard-immuun.
--
-- Alles idempotent (DROP … IF EXISTS) zodat re-apply een no-op is.

DROP FUNCTION IF EXISTS public.tx_counterparty_name_breakdown(date, date, text, integer, boolean);

CREATE FUNCTION public.tx_counterparty_name_breakdown(
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
    -- Amplificatie-rem. Zonder deze guard is `position('' in x) > 0` ALTIJD waar
    -- en zou een lege sleutel de volledige zichtbare transactiehistorie over het
    -- venster groeperen. De sleutel komt uit spend_limits.counterparty_key, die
    -- de CHECK `^[0-9A-Z]+$` draagt en dus nooit leeg kán zijn — maar de RPC is
    -- met de publieke key rechtstreeks aanroepbaar, dus de guard staat hier en
    -- niet alleen in de route. Spiegel van `k.key <> ''` in de fase-1-RPC.
    AND coalesce(p_key, '') <> ''
    AND position(p_key in public.spend_limit_counterparty_key(t.counterparty_name)) > 0
    AND t.date >= p_from
    AND t.date <  p_to
    AND (NOT p_own_only OR t.user_id = (select auth.uid()))
  GROUP BY t.counterparty_name
  -- Meest negatief eerst = grootste uitgave bovenaan. De tweede sorteersleutel
  -- is geen cosmetiek: de aanroeper berekent de rest-bucket als "periodebedrag
  -- minus de som van deze top-N", dus bij gelijke bedragen moet de snede
  -- deterministisch zijn — anders verspringt bij elke aanroep wélke naam nog in
  -- de lijst valt en wélke in de rest. Zelfde stabiliteitsregel als het
  -- alfabetische label in tx_counterparty_suggestions.
  ORDER BY sum(t.amount) ASC, t.counterparty_name ASC
  -- Harde rijbegrenzing: nooit meer dan 50 rijen, ongeacht wat de client vraagt.
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
$$;

-- REVOKE PUBLIC haalt de pseudorol weg; REVOKE anon haalt de expliciete grant
-- weg die ALTER DEFAULT PRIVILEGES bij CREATE heeft gezet (zie kopcommentaar).
-- Beide zijn nodig; alleen de eerste laat anon EXECUTE staan.
REVOKE ALL ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) FROM public;
REVOKE ALL ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.tx_counterparty_name_breakdown(date, date, text, integer, boolean) IS
  'Top-N schrijfwijzen binnen één genormaliseerde tegenpartij-sleutel over één periodevenster [p_from, p_to), gesorteerd op grootste uitgave (deterministische tiebreak op naam). Maximaal 50 rijen — kan niet op PostgREST max_rows afkappen. Rest-bucket wordt in de API-route berekend (periodebedrag uit het rapport minus de som van de top-N), niet hier. SECURITY INVOKER: de SELECT-policy van transactions (eigen + gedeelde huishoudrijen) geldt onverkort. EXECUTE alleen voor authenticated — anon is expliciet ingetrokken omdat deze functie namen teruggeeft, geen sommen. Parity-contract met spendLimitCounterpartyKey() in lib/spend-limits/counterparty-key.ts.';

-- ── Documentatie-correctie op de fase-1-functie ─────────────────────────────
-- De uitgerolde migratie 20260808110000 wordt NOOIT geëditeerd (append-only).
-- Haar inline commentaar beweert dat het suggestie-label "de meest-voorkomende
-- schrijfwijze binnen de sleutel (mode)" is. GEMETEN TEGEN pg_get_functiondef OP
-- 08-08-2026 is de uitgerolde body `(array_agg(t.counterparty_name ORDER BY
-- t.counterparty_name))[1]` — dat is de ALFABETISCH EERSTE schrijfwijze, niet de
-- modus. Het gedrag blijft ongewijzigd (alfabetisch eerste is deterministisch en
-- voor een keuzelijst-label voldoende); alleen de beschrijving wordt waar
-- gemaakt, via een nieuwe COMMENT in plaats van een edit op een uitgerolde
-- migratie.
COMMENT ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) IS
  'Meest-uitgegeven tegenpartijen over [p_from, p_to), gegroepeerd op de genormaliseerde zoeksleutel — voedt de keuzelijst bij het instellen van een tegenpartij-grenzenpot. Aggregaat (geen rij-lus): kan niet op PostgREST max_rows afkappen. SECURITY INVOKER. LABEL: de alfabetisch eerste schrijfwijze binnen de sleutel, NIET de modus — het inline commentaar in migratie 20260808110000 zei dat onjuist. Gedrag ongewijzigd: alfabetisch eerste is deterministisch en voor een keuzelijst-label voldoende.';
