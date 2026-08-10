/**
 * Yahoo-symbool-herkenning.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * `investment_holdings.ticker` is GEEN gegarandeerd beurssymbool. Bij
 * broker-imports (DEGIRO, eToro, Trading 212) landt daar in de praktijk vaak de
 * PRODUCTOMSCHRIJVING van de broker:
 *
 *   "AEX 485.9SPSOPENG"
 *   "BNP GOUD TURBO LONG SL 2671.9407 STR 2619.5497 R 10"
 *   "ADR ON BAIDU, INC. CLASS A"
 *
 * Die strings zijn nooit een Yahoo-symbool. Ze de v8 chart-API in duwen kost per
 * rij een netwerk-call + timeout en levert altijd niets op. Bij een account met
 * 109 posities is dat het verschil tussen een backfill die binnen de
 * `maxDuration` klaar is en een die eindeloos op 404's staat te wachten.
 *
 * Deze module beantwoordt één vraag: KAN Yahoo dit überhaupt oplossen? Het is
 * bewust een vorm-toets, geen bestaanstoets — of het symbool echt genoteerd is,
 * bepaalt Yahoo zelf.
 *
 * De toets is STRIKT (liever een echte ticker missen dan een omschrijving
 * doorlaten): de resolutie-route via ISIN/naam (`resolveYahooSymbol` in
 * `lib/price-feed.ts`) bestaat al voor de gevallen die hier afvallen.
 */

/**
 * Yahoo-symbolen zijn kort. Het langste realistische geval is een
 * fondssymbool met beurssuffix (`0P0000ABCD.F`) = 12 tekens. Alles daarboven is
 * in dit datasetje zonder uitzondering een omschrijving.
 */
const MAX_TICKER_LENGTH = 12

/**
 * Basis + optionele met `.`/`-` gescheiden delen. Deze vorm sluit meteen uit:
 * een leidende/afsluitende scheider (`.AS`, `MRVL.`), dubbele scheiders
 * (`MRVL..AS`), en — het belangrijkste — élke spatie of komma.
 */
const SYMBOL_PATTERN = /^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/

/**
 * ISIN-vorm: 2 landletters + 9 alfanumeriek + 1 controlecijfer, exact 12 tekens.
 *
 * Dit is de valstrik in een naïef patroon: `NL0011794037` bevat geen spatie, is
 * 12 tekens en is volledig alfanumeriek — hij glipt door élke charset-toets heen
 * terwijl de chart-API een ISIN niet kent (die gaat via de search-API in
 * `resolveYahooSymbol`). Brokers zetten de ISIN regelmatig in het ticker-veld,
 * dus deze uitzondering is niet theoretisch.
 */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/**
 * Normaliseer een ruwe ticker-waarde naar de vorm waarin we hem vergelijken.
 *
 * Trim + uppercase, want `fetchHistoricalPrices` doet exact hetzelfde vóór de
 * fetch. Door hier dezelfde normalisatie te doen is de dedup-sleutel op ticker
 * (één Yahoo-call per uniek symbool) consistent met wat er daadwerkelijk wordt
 * opgehaald: `adyen.as`, `ADYEN.AS ` en `ADYEN.AS` zijn één ticker, geen drie.
 *
 * @returns De genormaliseerde ticker, of `null` als er niets overblijft.
 */
export function normalizeTicker(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toUpperCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Kan Yahoo Finance dit als symbool opzoeken?
 *
 * `true` betekent: de vorm is die van een beurssymbool, het is zinvol om er een
 * chart-call aan te wagen. `false` betekent: dit is (vrijwel zeker) een
 * broker-omschrijving, een ISIN of leeg — niet ophalen.
 *
 * @example
 * isResolvableTicker('MRVL')                       // true
 * isResolvableTicker('ADYEN.AS')                   // true
 * isResolvableTicker('AEX 485.9SPSOPENG')          // false — spaties
 * isResolvableTicker('ADR ON BAIDU, INC. CLASS A') // false — te lang + komma
 * isResolvableTicker('NL0011794037')               // false — ISIN
 */
export function isResolvableTicker(raw: string | null | undefined): boolean {
  const ticker = normalizeTicker(raw)
  if (!ticker) return false

  // Lengte eerst: dit vangt de lange turbo-/ADR-omschrijvingen af vóór het regex-werk.
  if (ticker.length > MAX_TICKER_LENGTH) return false

  if (!SYMBOL_PATTERN.test(ticker)) return false

  // Minstens één letter. Zonder deze regel glippen prijsfragmenten uit
  // omschrijvingen door ("485.9", "2671.9407", "10") — die zijn qua charset
  // onberispelijk maar hebben geen enkele kans bij Yahoo.
  if (!/[A-Z]/.test(ticker)) return false

  if (ISIN_PATTERN.test(ticker)) return false

  return true
}
