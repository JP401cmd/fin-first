/**
 * Holdings-classificatie — pure afleiding uit de prijsfeed-metadata.
 *
 * Yahoo levert in dezelfde chart-response die `fetchPriceData` toch al doet twee
 * bruikbare velden mee: `meta.instrumentType` (EQUITY/ETF/MUTUALFUND/
 * CRYPTOCURRENCY) en `meta.exchangeName` (de beurscode, bv. AMS/NMS). Dit
 * bestand vertaalt die twee naar het canonieke vocabulaire van de portefeuille-
 * verdeling (`ASSET_CLASS_LABELS` / `GEOGRAPHY_LABELS` in
 * `lib/portfolio-allocation.ts`).
 *
 * Bewust I/O-vrij: geen netwerk, geen database, geen tijd. De afleiding is
 * daarmee volledig testbaar en — belangrijker — deterministisch: dezelfde
 * feed-response levert altijd dezelfde classificatie op, zodat een tweede
 * refresh niets verandert.
 *
 * Sector valt buiten scope: Yahoo's `quoteSummary?modules=assetProfile` geeft
 * zonder crumb-token een 401, dus die kolom blijft ongemoeid.
 */

/** Yahoo `instrumentType` → canonieke assetklasse-sleutel. */
const ASSET_CLASS_BY_INSTRUMENT_TYPE: Record<string, string> = {
  // Een los aandeel ÍS eigen vermogen — dit is de enige zekere mapping.
  EQUITY: 'aandelen',
  // BEWUST NIET 'aandelen': `instrumentType` beschrijft de VERPAKKING, niet de
  // inhoud. Een obligatie-ETF draagt óók instrumentType "ETF"; die onder
  // "Aandelen" scharen levert een fout getal op, geen grove benadering. Daarom
  // een eigen sleutel 'etf' (label 'ETF/fondsen' in ASSET_CLASS_LABELS).
  ETF: 'etf',
  MUTUALFUND: 'etf',
  CRYPTOCURRENCY: 'crypto',
}

/**
 * Legacy-assetklassen uit een ouder vocabulaire. Deze waarden staan nog in de
 * database, matchen geen sleutel in `ASSET_CLASS_LABELS` en renderen daardoor
 * als rauwe sleutel in de donut. Ze mogen — als expliciete, afgebakende
 * uitzondering op "nooit een bestaande waarde overschrijven" — genormaliseerd
 * worden: de betekenis is identiek, alleen de spelling is verouderd.
 */
const LEGACY_ASSET_CLASS_ALIASES: Record<string, string> = {
  equity: 'aandelen',
  bonds: 'obligaties',
}

/**
 * Beurscode → canonieke geografie-sleutel.
 *
 * LET OP: dit benadert de THUISMARKT van het aandeel (waar het noteert), niet
 * de omzetspreiding van het bedrijf. ASML noteert in Amsterdam maar verkoopt
 * wereldwijd; de kaart hieronder zegt "nederland" en dat is de bedoelde,
 * begrijpelijke benadering — geen uitspraak over waar de omzet vandaan komt.
 */
const GEOGRAPHY_BY_EXCHANGE: Record<string, string> = {
  // Nederland apart, want dat is een eigen categorie in GEOGRAPHY_LABELS.
  AMS: 'nederland',

  // Europa
  GER: 'europa',
  FRA: 'europa',
  STU: 'europa',
  BER: 'europa',
  DUS: 'europa',
  HAM: 'europa',
  MUN: 'europa',
  EBS: 'europa',
  VTX: 'europa',
  SWX: 'europa',
  PAR: 'europa',
  MIL: 'europa',
  LSE: 'europa',
  BRU: 'europa',
  MCE: 'europa',
  STO: 'europa',
  CPH: 'europa',
  OSL: 'europa',
  ICE: 'europa',
  HEL: 'europa',
  WSE: 'europa',
  VIE: 'europa',
  LIS: 'europa',
  ATH: 'europa',

  // Noord-Amerika
  NMS: 'noord_amerika',
  NYQ: 'noord_amerika',
  NGM: 'noord_amerika',
  NCM: 'noord_amerika',
  NAS: 'noord_amerika',
  PCX: 'noord_amerika',
  ASE: 'noord_amerika',
  BTS: 'noord_amerika',
  PNK: 'noord_amerika',
  OTC: 'noord_amerika',
  TOR: 'noord_amerika',
  TSX: 'noord_amerika',
  VAN: 'noord_amerika',
  CNQ: 'noord_amerika',
  NEO: 'noord_amerika',

  // Azië-Pacific
  HKG: 'azie',
  JPX: 'azie',
  TYO: 'azie',
  OSA: 'azie',
  TAI: 'azie',
  TWO: 'azie',
  KSC: 'azie',
  KOE: 'azie',
  ASX: 'azie',
  NZE: 'azie',
  SES: 'azie',
  SHH: 'azie',
  SHZ: 'azie',

  // Opkomende markten
  NSI: 'opkomend',
  BSE: 'opkomend',
  SAO: 'opkomend',
  BUE: 'opkomend',
  MEX: 'opkomend',
  JNB: 'opkomend',
  IST: 'opkomend',
  IDX: 'opkomend',
  SET: 'opkomend',
  KLS: 'opkomend',
  PHS: 'opkomend',
}

/** Trim + uppercase, of `null` als er niets bruikbaars staat. */
function normalizeCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toUpperCase() : null
}

/**
 * Leid de assetklasse af uit Yahoo's `instrumentType`.
 *
 * Geeft `null` bij een onbekend of ontbrekend type — onbekend is géén categorie.
 * Terugvallen op 'anders' zou een verzonnen classificatie in de donut zetten die
 * niet van een echte te onderscheiden is.
 */
export function deriveAssetClass(instrumentType: string | null): string | null {
  const key = normalizeCode(instrumentType)
  if (!key) return null
  return ASSET_CLASS_BY_INSTRUMENT_TYPE[key] ?? null
}

/**
 * Leid de geografie af uit de noteringsbeurs — ALLEEN voor losse aandelen.
 *
 * Voor een ETF of fonds geeft deze functie altijd `null`: de noteringsbeurs zegt
 * niets over waar het fonds belegt. VWRL noteert in Amsterdam en belegt
 * wereldwijd; die onder "Nederland" zetten is aantoonbaar onjuist en zou de
 * geografie-donut structureel naar het thuisland kantelen. Liever leeg dan fout.
 *
 * Onbekende beurscode → `null` (niet raden).
 */
export function deriveGeography(
  instrumentType: string | null,
  exchangeName: string | null,
): string | null {
  const type = normalizeCode(instrumentType)
  if (type !== 'EQUITY') return null

  const exchange = normalizeCode(exchangeName)
  if (!exchange) return null
  return GEOGRAPHY_BY_EXCHANGE[exchange] ?? null
}

/**
 * Normaliseer een verouderde assetklasse-sleutel naar het huidige vocabulaire.
 *
 * Geeft `null` wanneer er niets te normaliseren valt (leeg, of al een geldige
 * hedendaagse waarde) — de aanroeper laat de bestaande waarde dan met rust.
 */
export function normalizeLegacyAssetClass(existing: string | null | undefined): string | null {
  if (typeof existing !== 'string') return null
  const key = existing.trim().toLowerCase()
  if (key.length === 0) return null
  return LEGACY_ASSET_CLASS_ALIASES[key] ?? null
}

/** De velden die een koersvernieuwing aan de classificatie mag toevoegen. */
export interface ClassificationUpdate {
  asset_class?: string
  geography?: string
  /**
   * De noteringsbeurs, genormaliseerd (trim + uppercase). Anders dan
   * assetklasse/geografie wordt dit niet AFGELEID maar letterlijk overgenomen
   * uit `meta.exchangeName` — het is een feit uit de feed, geen interpretatie.
   * Volgt verder exact dezelfde regel: alleen invullen wanneer de kolom leeg is.
   */
  exchange?: string
}

/**
 * Bepaalt welke classificatie-velden een koersvernieuwing mag wegschrijven.
 *
 * DE ENIGE PLEK waar die beslissing valt. Er zijn twee koerspaden — de
 * handmatige `POST /api/holdings/refresh-prices` en de nachtelijke cron
 * daarnaast — en die deelden geen regel code. Zat de regel in één van beide,
 * dan hing het van de toevallige route af óf een positie geclassificeerd werd:
 * de donut liep alleen vol voor wie zelf op verversen drukte, en niet voor wie
 * de cron zijn werk liet doen. Precies het soort verschil dat niemand meldt,
 * omdat beide paden "werken".
 *
 * De regels, in volgorde:
 *   1. Een verouderde sleutel ('equity'/'bonds') wordt genormaliseerd. Dit is
 *      de ENIGE toegestane overschrijving — zelfde betekenis, oude spelling.
 *   2. Een lege kolom wordt gevuld met wat de verse feed-respons zegt.
 *   3. Een bestaande, hedendaagse waarde blijft staan. Een handmatige keuze van
 *      de gebruiker wint altijd van de feed.
 *   4. Levert de afleiding `null` (onbekend type of beurs), dan wordt de kolom
 *      niet meegeschreven — nooit iets met `null` overschrijven.
 *
 * Wat hier NIET thuishoort: koersgegevens. Het 52-weeks bereik hoort bij
 * `current_price`/`previous_close` en moet élke ronde ververst worden; deze
 * helper gaat juist over de velden die je maar ÉÉN keer invult.
 *
 * Puur en deterministisch: dezelfde respons + dezelfde bestaande waarden geven
 * altijd hetzelfde resultaat, dus een tweede refresh verandert niets meer
 * (idempotent).
 */
export function buildClassificationUpdate(
  feed: { instrumentType: string | null; exchangeName: string | null },
  existing: { asset_class?: unknown; geography?: unknown; exchange?: unknown },
): ClassificationUpdate {
  const update: ClassificationUpdate = {}

  const existingAssetClass =
    typeof existing.asset_class === 'string' ? existing.asset_class.trim() : ''
  const existingGeography =
    typeof existing.geography === 'string' ? existing.geography.trim() : ''
  const existingExchange =
    typeof existing.exchange === 'string' ? existing.exchange.trim() : ''

  const legacy = normalizeLegacyAssetClass(existingAssetClass)
  if (legacy) {
    update.asset_class = legacy
  } else if (existingAssetClass.length === 0) {
    const derived = deriveAssetClass(feed.instrumentType)
    if (derived) update.asset_class = derived
  }

  if (existingGeography.length === 0) {
    const derived = deriveGeography(feed.instrumentType, feed.exchangeName)
    if (derived) update.geography = derived
  }

  // De beurs zelf. Los van de geografie-afleiding hierboven: die weigert
  // bewust een uitspraak te doen voor een ETF, maar de beurscode is dan nog
  // steeds een feit ("VWRL noteert op AMS") en mag gewoon vastgelegd worden.
  if (existingExchange.length === 0) {
    const code = normalizeCode(feed.exchangeName)
    if (code) update.exchange = code
  }

  return update
}
