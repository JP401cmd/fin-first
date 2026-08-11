-- 52-weeks koersbereik op investment_holdings.
--
-- WAAROM: de portefeuillepagina toont wat een positie waard is en wat ze deed
-- sinds aankoop, maar nergens waar die koers stáát in zijn eigen jaarbereik.
-- "Marvell € 208" zegt iets anders naast een jaarbereik van € 61–€ 330 dan naast
-- € 200–€ 215. Dat is het enige echt nieuwe signaal dat de koersbron nog droeg
-- en dat wij weggooiden.
--
-- GRATIS UIT DE BESTAANDE CALL: Yahoo's chart-respons draagt `fiftyTwoWeekHigh`
-- en `fiftyTwoWeekLow` mee in `meta` — dezelfde respons die `fetchPriceData`
-- toch al ophaalt voor de koers zelf. Geen extra verzoek, geen extra
-- rate-limit-druk, geen tweede bron die kan afwijken.
--
-- WAAROM KOLOMMEN EN GEEN AFLEIDING: het bereik is niet te reconstrueren uit
-- `investment_holding_prices` — die tabel bevat alleen de dagen die de cron
-- toevallig heeft opgehaald sinds de positie bestaat, niet het volledige jaar.
-- Zelf een min/max over een gaten-reeks rekenen zou een bereik opleveren dat
-- stelselmatig te smal is, en dat als feit presenteren.
--
-- NULLABLE, GEEN DEFAULT: niet elke positie noteert (turbo's, sprinters,
-- gedelistte namen dragen als "ticker" een brokeromschrijving). Voor die rijen
-- is "onbekend" het juiste antwoord; een 0 of een default zou een bereik
-- suggereren dat niemand gemeten heeft. De UI verbergt de regel bij NULL.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig) — GEMETEN TEGEN DE LIVE DATABASE OP
-- 11-08-2026, niet overgenomen uit een migratiebestand:
--   * pg_class.relrowsecurity op public.investment_holdings = true (RLS aan),
--     relforcerowsecurity = false.
--   * pg_policies levert precies vier policies, alle vier op rol
--     `authenticated` en alle vier eigen-rij:
--       investment_holdings_select_own  SELECT  USING  ((SELECT auth.uid()) = user_id)
--       investment_holdings_insert_own  INSERT  CHECK  ((SELECT auth.uid()) = user_id)
--       investment_holdings_update_own  UPDATE  USING+CHECK idem
--       investment_holdings_delete_own  DELETE  USING  ((SELECT auth.uid()) = user_id)
--     (De `(SELECT auth.uid())`-wrapper is de initplan-consolidatie uit ADR 0048.)
--   * Géén policy voor rol `anon` → anoniem levert 0 rijen, geen fout.
--   * Géén huishoud-gedeelde SELECT op deze tabel (anders dan op `assets`):
--     een partner ziet deze rijen niet.
-- Postgres-policies werken op RIJniveau, niet op kolomniveau, dus twee extra
-- kolommen erven exact bovenstaande afscherming. Een nieuwe policy zou hier
-- juist een tweede, afwijkende waarheid introduceren.
--
-- GEEN BACKFILL: de waarden komen uit de koersbron, niet uit bestaande data.
-- Ze vullen zich bij de eerstvolgende koersvernieuwing (handmatig of de
-- nachtelijke cron), langs hetzelfde pad als `current_price`. Een backfill zou
-- betekenen dat we hier 116 externe verzoeken in een migratie doen — precies
-- wat een migratie niet hoort te zijn.
--
-- TERUGWEG: `ALTER TABLE public.investment_holdings DROP COLUMN
-- fifty_two_week_high, DROP COLUMN fifty_two_week_low;` in een NIEUWE migratie.
-- Additief en nullable, dus tot die tijd is elke bestaande query ongewijzigd:
-- niets leest deze kolommen tenzij het er expliciet om vraagt.

ALTER TABLE public.investment_holdings
  ADD COLUMN IF NOT EXISTS fifty_two_week_high NUMERIC,
  ADD COLUMN IF NOT EXISTS fifty_two_week_low  NUMERIC;

COMMENT ON COLUMN public.investment_holdings.fifty_two_week_high IS
  'Hoogste koers over de laatste 52 weken, in de valuta van de positie (currency). Uit de koersbron; NULL als de positie niet noteert.';
COMMENT ON COLUMN public.investment_holdings.fifty_two_week_low IS
  'Laagste koers over de laatste 52 weken, in de valuta van de positie (currency). Uit de koersbron; NULL als de positie niet noteert.';
