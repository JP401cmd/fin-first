/**
 * CSV parsers for broker portfolio/transaction exports.
 *
 * - DEGIRO, Saxo Bank, ING Beleggen — semicolon-delimited, Dutch number
 *   formatting (comma as decimal separator, dot as thousands separator).
 * - Trading 212, eToro — comma-delimited, English number formatting (dot
 *   as decimal separator, comma as thousands separator).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrokerType = 'degiro' | 'saxo' | 'ing_beleggen' | 'trading212' | 'etoro'

export type HoldingRowType = 'buy' | 'sell' | 'dividend' | 'position'

export interface ParsedHoldingRow {
  name: string
  ticker: string | null
  isin: string | null
  units: number
  price_per_unit: number
  total_amount: number
  date: string | null
  type: HoldingRowType
  fees: number
  currency: string
  exchange: string | null
  /**
   * Het id dat de broker zelf aan deze transactie hangt — DEGIRO's Order ID,
   * Trading 212's `ID`, eToro's `Position ID`. Voedt de dedup-sleutel
   * (`lib/holdings-import-key.ts`) waarmee een overlappende upload zijn dubbele
   * rijen kwijtraakt. Null voor positie-rijen en voor exports zonder id; de
   * sleutel valt dan terug op de inhoud van de rij.
   */
  externalId: string | null
  /** Original CSV row preserved as key-value pairs for debugging / auditing. */
  raw: Record<string, string>
}

/**
 * Wat een uploadbestand inhoudelijk IS.
 *
 * Het onderscheid is geen detail maar bepaalt hoe de import mag rekenen:
 * - `positions`    — een momentopname van de hele portefeuille. Wat er niet in
 *                    staat, bezit je niet meer; vervangen mag.
 * - `transactions` — een handelshistorie over een gekozen periode. Die is per
 *                    definitie ONVOLLEDIG, dus ontbrekende posities als verkocht
 *                    markeren zou bezit wegpoetsen dat er gewoon nog is.
 */
export type BrokerContentKind = 'positions' | 'transactions' | 'mixed' | 'unknown'

export interface BrokerParseResult {
  broker: BrokerType
  rows: ParsedHoldingRow[]
  /** Non-fatal parsing warnings (e.g. unrecognised rows, missing fields). */
  errors: string[]
  /** Number of rows that were skipped entirely. */
  skipped: number
  /** Positie-momentopname of transactiehistorie — afgeleid uit de gelezen rijen. */
  contentKind: BrokerContentKind
}

/**
 * Leid af wat het bestand inhoudelijk is uit de daadwerkelijk gelezen rijen.
 *
 * Bewust op de rijen en niet op de header: dit werkt voor élke broker, ook waar
 * geen sub-formaat-detectie op kolomnamen bestaat. Een positie-export levert
 * uitsluitend `position`-rijen; een transactie-export uitsluitend koop/verkoop/
 * dividend.
 */
export function deriveContentKind(rows: ParsedHoldingRow[]): BrokerContentKind {
  if (rows.length === 0) return 'unknown'
  const positions = rows.filter((r) => r.type === 'position').length
  if (positions === rows.length) return 'positions'
  if (positions === 0) return 'transactions'
  return 'mixed'
}

// ---------------------------------------------------------------------------
// Broker presets (UI-facing metadata)
// ---------------------------------------------------------------------------

/**
 * Eén concreet exportbestand dat een broker kan opleveren.
 *
 * `supported: false` is bewust onderdeel van de lijst: een broker levert vaak
 * méér exports dan wij kunnen lezen (DEGIRO's Rekeningoverzicht is het
 * klassieke misgrijp), en de gebruiker vooraf vertellen wélk bestand níet werkt
 * scheelt een mislukte upload. De parser weigert Account.csv al met een
 * specifieke melding — dit is dezelfde waarheid, maar dan vooraf zichtbaar.
 */
export type BrokerExport = {
  /** Bestands-/exportnaam zoals de gebruiker die bij de broker ziet. */
  label: string
  /** Waar je hem exporteert en wat erin zit. */
  detail: string
  /** false = wij herkennen dit bestand maar kunnen het niet als holdings importeren. */
  supported: boolean
  /**
   * Wat dit bestand inhoudelijk is. Bepaalt de importmodus: een
   * positie-momentopname mag de bezitting vervangen, een transactiehistorie
   * vult alleen aan. `unknown` voor exports die we sowieso weigeren.
   */
  kind: BrokerContentKind
}

export type BrokerPreset = {
  id: BrokerType
  label: string
  description: string
  exampleHeader: string
  /** Alle exports die deze broker oplevert — inclusief de niet-ondersteunde. */
  exports: BrokerExport[]
  /** Optionele voetnoot onder de exportlijst (formaatvarianten, valuta, alternatief). */
  note?: string
}

export const BROKER_PRESETS: BrokerPreset[] = [
  {
    id: 'degiro',
    label: 'DEGIRO',
    // Steer the user to the right export: only Portfolio (Posities) and
    // Transactie (Transacties) are supported. The Rekeningoverzicht
    // (Account.csv) holds cash-mutations, not positions, so it cannot be
    // imported as holdings — say so explicitly to prevent the wrong upload.
    description:
      'Portfolio- of Transactie-export uit DEGIRO — niet het Rekeningoverzicht (Account.csv)',
    exampleHeader: 'Product,ISIN,Beurs,... (of Product;ISIN;Beurs;...)',
    exports: [
      {
        label: 'Portfolio.csv — Posities',
        detail:
          'Portefeuille → Export. Je posities van vandaag, met aantal, slotkoers en waarde in euro.',
        supported: true,
        kind: 'positions',
      },
      {
        label: 'Transactions.csv — Transacties',
        detail:
          'Transacties → Export. Je handelshistorie over een gekozen periode; wij rekenen koop min verkoop terug naar je positie.',
        supported: true,
        kind: 'transactions',
      },
      {
        label: 'Account.csv — Rekeningoverzicht',
        detail:
          'Bevat geldmutaties, geen posities. Exporteer in plaats daarvan Portfolio of Transacties.',
        supported: false,
        kind: 'unknown',
      },
    ],
    note: 'Beide DEGIRO-varianten werken: de web-export (komma’s) en de oudere export (puntkomma’s).',
  },
  {
    id: 'saxo',
    label: 'Saxo Bank',
    description: 'Export uit Saxo Bank/BinckBank',
    exampleHeader: 'Instrument,ISIN,...',
    exports: [
      {
        label: 'Posities-export (CSV)',
        detail:
          'Rekening → Posities → Exporteren. Met de kolommen Instrument, Symbool, ISIN, Aantal, Huidige prijs en Waarde.',
        supported: true,
        kind: 'positions',
      },
    ],
  },
  {
    id: 'ing_beleggen',
    label: 'ING Beleggen',
    description: 'Export uit Mijn ING Beleggen',
    exampleHeader: 'Datum,ISIN,Fonds,...',
    exports: [
      {
        label: 'Effectenoverzicht (CSV)',
        detail:
          'Mijn ING Beleggen → Overzicht → Downloaden. Met de kolommen Datum, ISIN-code, Naam effect, Aantal, Koers en Waarde.',
        supported: true,
        kind: 'positions',
      },
    ],
  },
  {
    id: 'trading212',
    label: 'Trading 212',
    description: 'Account Statement-export uit Trading 212',
    exampleHeader: 'Action,Time,ISIN,Ticker,Name,...',
    exports: [
      {
        label: 'Account Statement (CSV)',
        detail:
          'History → Export → CSV. Koop, verkoop en dividend nemen we mee; stortingen, opnames en valutawissels slaan we over.',
        supported: true,
        kind: 'transactions',
      },
    ],
    note: 'Trading 212 kan ook automatisch: koppel je read-only API-key op de bezitting, dan hoef je nooit meer te uploaden.',
  },
  {
    id: 'etoro',
    label: 'eToro',
    description: 'Account Statement-export uit eToro',
    exampleHeader: 'Date,Type,Details,Amount,Units,...',
    exports: [
      {
        label: 'Account Statement (CSV)',
        detail:
          'Portfolio → Rekeningoverzicht → Exporteren. Het tabblad met Date, Type, Details, Amount, Units en Realized Equity Change.',
        supported: true,
        kind: 'transactions',
      },
    ],
    note: 'eToro-rekeningen staan in dollars; bedragen komen binnen zoals ze in het bestand staan.',
  },
]

/**
 * De soorten export die deze broker daadwerkelijk oplevert én wij aankunnen.
 *
 * Levert er één (Saxo, ING, Trading 212, eToro), dan hoeft de wizard niets te
 * vragen. Levert er twee (DEGIRO: portefeuille óf transacties), dan moet de
 * gebruiker kiezen — die keuze bepaalt of de import mag vervangen of alleen
 * aanvullen.
 */
export function supportedExportKinds(preset: BrokerPreset): Array<'positions' | 'transactions'> {
  const kinds: Array<'positions' | 'transactions'> = []
  for (const exp of preset.exports) {
    if (!exp.supported) continue
    if (exp.kind !== 'positions' && exp.kind !== 'transactions') continue
    if (!kinds.includes(exp.kind)) kinds.push(exp.kind)
  }
  return kinds
}

// ---------------------------------------------------------------------------
// Helpers – Dutch number & date parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Dutch-formatted number string into a JavaScript number.
 * Handles formats like "1.234,56" (→ 1234.56), "1234,56", or plain "1234".
 * Returns 0 for empty or unparseable strings.
 */
export function parseNLNumber(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/['"]/g, '').trim()
  if (!cleaned) return 0

  // Dutch format: dots are thousands separators, comma is decimal separator.
  // Remove dots first, then swap comma for dot.
  const normalised = cleaned.replace(/\./g, '').replace(',', '.')
  const value = parseFloat(normalised)
  return Number.isFinite(value) ? value : 0
}

/**
 * Parse an English-formatted number string (dot as decimal separator,
 * comma as thousands separator). Used by Trading 212 and eToro exports.
 */
export function parseENNumber(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/['"]/g, '').trim()
  if (!cleaned) return 0
  const normalised = cleaned.replace(/,/g, '')
  const value = parseFloat(normalised)
  return Number.isFinite(value) ? value : 0
}

/**
 * Strikte varianten van {@link parseNLNumber} / {@link parseENNumber}: retourneer
 * `null` wanneer de cel leeg is OF een niet-leeg maar onparsbaar getal bevat.
 * Gebruikt door {@link requireNumber} om een corrupte waarde/koers-kolom als
 * importwaarschuwing te laten verschijnen i.p.v. stil een €0-holding op te leveren.
 */
export function parseNLNumberOrNull(str: string): number | null {
  const cleaned = (str ?? '').replace(/['"]/g, '').trim()
  if (!cleaned) return null
  const value = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

export function parseENNumberOrNull(str: string): number | null {
  const cleaned = (str ?? '').replace(/['"]/g, '').trim()
  if (!cleaned) return null
  const value = parseFloat(cleaned.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/**
 * Lees een WAARDEBEPALEND getalveld (bedrag/waarde) strikt: een lege cel geeft 0
 * (optioneel veld of de waarde staat in een zustercolom), maar een niet-lege,
 * onparsbare cel gooit een Error. Die wordt door de try/catch in
 * {@link parseBrokerCSV} opgevangen → `errors[]` + `skipped++`, zodat een
 * verkeerd toegewezen bedrag-kolom als zichtbare waarschuwing eindigt i.p.v. een
 * stille €0-holding die de portefeuillewaarde vervuilt.
 */
function requireNumber(raw: string, label: string, parse: (s: string) => number | null): number {
  if (!(raw ?? '').replace(/['"]/g, '').trim()) return 0
  const value = parse(raw)
  if (value === null) {
    throw new Error(`onleesbare waarde in kolom "${label}": "${raw.trim()}"`)
  }
  return value
}

/**
 * Convert a Dutch date string (DD-MM-YYYY) to ISO format (YYYY-MM-DD).
 * Returns null for empty or invalid date strings.
 */
export function parseNLDate(str: string): string | null {
  if (!str) return null
  const cleaned = str.replace(/['"]/g, '').trim()
  if (!cleaned) return null

  // Accept DD-MM-YYYY or DD/MM/YYYY
  const match = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (!match) return null

  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3]

  // Basic sanity check on date components
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null

  return `${year}-${month}-${day}`
}

/**
 * Parse a Trading 212-style timestamp ("YYYY-MM-DD HH:mm:ss[.SSS]" or
 * "YYYY-MM-DDTHH:mm:ssZ") and return the date portion in ISO format.
 */
export function parseISODatePrefix(str: string): string | null {
  if (!str) return null
  const cleaned = str.replace(/['"]/g, '').trim()
  if (!cleaned) return null
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const m = parseInt(match[2], 10)
  const d = parseInt(match[3], 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * Parse an eToro-style date ("DD/MM/YYYY HH:mm:ss" or "DD/MM/YYYY") and
 * return the date portion in ISO format. Falls back to ISO-prefix parsing
 * if the input already starts with "YYYY-MM-DD".
 */
export function parseEtoroDate(str: string): string | null {
  if (!str) return null
  const cleaned = str.replace(/['"]/g, '').trim()
  if (!cleaned) return null
  // ISO prefix variant
  const iso = parseISODatePrefix(cleaned)
  if (iso) return iso
  // DD/MM/YYYY [HH:mm[:ss]]
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3]
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// CSV splitting (respects quoted fields)
// ---------------------------------------------------------------------------

/**
 * Split a single CSV line by delimiter, respecting double-quoted fields.
 * Handles escaped quotes ("") inside quoted strings.
 */
function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  return result.map((f) => f.replace(/^"|"$/g, '').trim())
}

// ---------------------------------------------------------------------------
// Header normalisation & column lookup
// ---------------------------------------------------------------------------

/**
 * Build a raw key-value record from headers + fields for a single CSV row.
 */
function buildRawRecord(headers: string[], fields: string[]): Record<string, string> {
  const raw: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]?.trim()
    if (key) raw[key] = fields[i] ?? ''
  }
  return raw
}

/**
 * Case-insensitive, whitespace-trimmed column lookup (exact match).
 * Returns the field value or empty string if not found.
 */
function col(headers: string[], fields: string[], name: string): string {
  const target = name.trim().toLowerCase()
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === target)
  if (idx === -1) return ''
  return fields[idx] ?? ''
}

/**
 * Case-insensitive column lookup by substring match (contains).
 * Returns the value of the FIRST matching header, or empty string.
 *
 * Use this for columns whose full name varies across export versions, e.g.:
 *   "Transactiekosten en/of" (old)  vs
 *   "Transactiekosten en/of kosten van derden EUR" (new web export)
 * Both contain "transactiekosten", so `colContains(h, f, 'transactiekosten')`
 * matches either.
 *
 * For "Waarde EUR" vs "Waarde": pass the longer/specific string first and fall
 * back manually — do NOT use colContains("waarde") alone because it would also
 * hit "Lokale waarde".
 */
function colContains(headers: string[], fields: string[], needle: string): string {
  const target = needle.trim().toLowerCase()
  const idx = headers.findIndex((h) => h.trim().toLowerCase().includes(target))
  if (idx === -1) return ''
  return fields[idx] ?? ''
}

/**
 * Normalise header strings for consistent matching:
 * strip BOM, trim whitespace, collapse inner whitespace.
 */
function normaliseHeaders(headers: string[]): string[] {
  return headers.map((h) =>
    h
      .replace(/^\uFEFF/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

// ---------------------------------------------------------------------------
// Broker detection
// ---------------------------------------------------------------------------

/**
 * Lowercase header fingerprints used to identify each broker format.
 * Exported so format-contracts.ts can reference them as the single source
 * of truth instead of duplicating the marker lists.
 */
export const DEGIRO_PORTFOLIO_MARKERS = ['product', 'isin', 'beurs', 'aantal', 'slotkoers']
export const DEGIRO_TRANSACTION_MARKERS = ['datum', 'product', 'isin', 'koers', 'transactiekosten']
export const SAXO_MARKERS = ['instrument', 'symbool', 'isin', 'gemiddelde openingsprijs']
export const ING_BELEGGEN_MARKERS = ['naam effect', 'isin-code', 'aantal', 'koers']
export const TRADING212_MARKERS = ['action', 'time', 'isin', 'ticker', 'no. of shares']
export const ETORO_MARKERS = ['date', 'type', 'details', 'amount', 'units']

/**
 * Auto-detect the broker from the first (header) line of a CSV file.
 * Returns null if no known broker format is recognised.
 */
export function detectBroker(content: string): BrokerType | null {
  // Strip BOM and grab first non-empty line
  const cleaned = content.replace(/^\uFEFF/, '')
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim().length > 0)
  if (!firstLine) return null

  const lower = firstLine.toLowerCase()

  // Check each broker's marker set — all markers must be present in the header
  const containsAll = (markers: string[]) => markers.every((m) => lower.includes(m))

  // Order matters: check the more specific patterns first.
  if (containsAll(DEGIRO_TRANSACTION_MARKERS)) return 'degiro'
  if (containsAll(DEGIRO_PORTFOLIO_MARKERS)) return 'degiro'
  if (containsAll(SAXO_MARKERS)) return 'saxo'
  if (containsAll(ING_BELEGGEN_MARKERS)) return 'ing_beleggen'
  if (containsAll(TRADING212_MARKERS)) return 'trading212'
  // eToro detection is broad ("date,type,amount,units" is generic), so we
  // only match when the more specific column "realized equity change" is
  // also present — that field is unique to eToro account statements.
  if (containsAll(ETORO_MARKERS) && lower.includes('realized equity change')) return 'etoro'

  return null
}

/**
 * Pick the column delimiter for a given broker. Trading 212 and eToro always
 * use commas. Saxo and ING Beleggen use semicolons. For DEGIRO use
 * `detectDelimiter` on the actual header line instead — both comma-delimited
 * (web export) and semicolon-delimited (older desktop export) exist in the wild.
 */
function delimiterFor(broker: BrokerType): ',' | ';' {
  return broker === 'trading212' || broker === 'etoro' ? ',' : ';'
}

/**
 * Auto-detect the delimiter of a single header line by counting occurrences of
 * `;`, `,` and tab. Returns the most-frequent one, or the provided fallback
 * when counts are equal (avoids guessing on ambiguous single-column headers).
 *
 * This mirrors the logic in `app/(app)/core/cash/import/page.tsx` ~line 732-741
 * and `lib/parsers/csv.ts` (splitCSVLine) — kept here to avoid a dependency on
 * the bank-CSV module from the broker module.
 */
function detectDelimiter(headerLine: string, fallback: ',' | ';' = ';'): ',' | ';' {
  const semicolons = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  if (semicolons === commas) return fallback
  return semicolons > commas ? ';' : ','
}

// ---------------------------------------------------------------------------
// Individual broker parsers
// ---------------------------------------------------------------------------

/**
 * Detect whether DEGIRO headers represent a transaction export vs. a portfolio
 * export. Transaction exports have "Datum" and "Transactiekosten" columns.
 */
function isDegiroTransaction(headersLower: string[]): boolean {
  return (
    headersLower.some((h) => h.startsWith('datum')) &&
    headersLower.some((h) => h.startsWith('transactiekosten'))
  )
}

/**
 * Marker columns that uniquely identify the DEGIRO "Rekeningoverzicht"
 * (Account.csv) — a COMMA-delimited cash-mutation export. The triple
 * Valutadatum + Mutatie + Saldo appears together ONLY in the account overview:
 * the Portfolio and Transactie exports lack all three. (Product/ISIN are NOT
 * discriminators — the account overview has them too, so we key on the
 * cash-mutation columns instead.)
 */
const DEGIRO_ACCOUNT_MARKERS = ['valutadatum', 'mutatie', 'saldo']

/**
 * Single, specific, actionable error for an uploaded DEGIRO Rekeningoverzicht.
 * We deliberately do NOT support Account.csv (it is cash-mutations, not
 * holdings); instead we name the format and redirect the user to the Portfolio
 * (actuele posities) or Transactie (handelshistorie) export. The wording is
 * load-bearing: it must contain "Rekeningoverzicht" and mention Portfolio +
 * Transacties so the user knows exactly which file to export instead.
 */
const DEGIRO_ACCOUNT_OVERVIEW_ERROR =
  'Dit is het DEGIRO Rekeningoverzicht (cash-mutaties). Exporteer in DEGIRO je Portfolio voor je actuele posities (of Transacties voor je handelshistorie) en upload dat bestand.'

/**
 * Detect the DEGIRO Rekeningoverzicht from its (lowercased) header.
 *
 * Returns true when all of Valutadatum, Mutatie and Saldo appear among the
 * headers. `some(...includes...)` per marker keeps this robust to the blank /
 * duplicate header columns and stray whitespace in the real export.
 *
 * NOTE: the account overview is COMMA-delimited, so callers must pass a header
 * representation that isn't mangled by the DEGIRO ';' delimiter — see the
 * raw-line check in parseBrokerCSV.
 */
function isDegiroAccountOverview(headersLower: string[]): boolean {
  return DEGIRO_ACCOUNT_MARKERS.every((marker) =>
    headersLower.some((h) => h.includes(marker)),
  )
}

function parseDegiroRow(
  headers: string[],
  fields: string[],
  isTransaction: boolean,
): ParsedHoldingRow | null {
  const name = col(headers, fields, 'Product')
  if (!name) return null

  const isin = col(headers, fields, 'ISIN') || null
  const exchange = col(headers, fields, 'Beurs') || null
  const raw = buildRawRecord(headers, fields)

  if (isTransaction) {
    const dateStr = col(headers, fields, 'Datum')
    const units = parseNLNumber(col(headers, fields, 'Aantal'))

    // "Waarde EUR" is the EUR-denominated value (used in the real DEGIRO web
    // export). Older semicolon exports may label this column "Waarde". We try
    // an EXACT "Waarde EUR" match first, then a substring match for variant
    // spellings, and finally fall back to bare "Waarde" for backwards compat.
    // IMPORTANT: "Lokale waarde" must NOT match here — it is in local currency
    // (e.g. USD) and would give a wrong total. Preferring the exact match over
    // the substring match removes any column-ordering dependency: if DEGIRO
    // ever introduces a "Lokale waarde EUR" column, the exact "Waarde EUR"
    // header is still picked instead of the first substring hit.
    const waardeEurRaw =
      col(headers, fields, 'Waarde EUR') !== ''
        ? col(headers, fields, 'Waarde EUR')
        : colContains(headers, fields, 'waarde eur')
    const waardeRaw = waardeEurRaw !== '' ? waardeEurRaw : col(headers, fields, 'Waarde')
    const total = requireNumber(waardeRaw, 'Waarde EUR', parseNLNumberOrNull)

    // price_per_unit is derived in EUR: |WaardeEUR| / |Aantal|
    // NOT the "Koers" column which is in local currency (e.g. USD).
    // Guard against division by zero.
    const absUnits = Math.abs(units)
    const absTotal = Math.abs(total)
    const price_per_unit = absUnits > 0 ? absTotal / absUnits : 0

    // Fees: real export column is "Transactiekosten en/of kosten van derden EUR".
    // Older exports use a shorter name. colContains matches both.
    const fees = Math.abs(parseNLNumber(colContains(headers, fields, 'transactiekosten')))

    // Determine type from sign of units (positive = buy, negative = sell).
    // If units is exactly 0 this row is likely not a trade — skip it.
    if (absUnits === 0) return null
    const type: HoldingRowType = units >= 0 ? 'buy' : 'sell'

    // Order ID: DEGIRO quirk — the last header field is empty, so the UUID
    // is one position to the right of the "Order ID" header. We therefore read
    // it robustly: take the last non-empty field in the data row that looks like
    // a UUID (8-4-4-4-12 hex). This is more reliable than relying on the
    // shifted column index.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const orderId = [...fields].reverse().find((f) => UUID_RE.test(f.trim())) ?? ''

    // Store the order-id in raw["Order ID"] so downstream import steps can
    // persist it as an external_id without needing type changes.
    const rawWithOrderId = { ...raw, 'Order ID': orderId }

    return {
      name,
      ticker: null,
      isin,
      units: absUnits,
      price_per_unit,
      total_amount: absTotal,
      date: parseNLDate(dateStr),
      type,
      fees,
      currency: 'EUR',
      exchange,
      externalId: orderId || null,
      raw: rawWithOrderId,
    }
  }

  // Portfolio (position) row
  const units = parseNLNumber(col(headers, fields, 'Aantal'))
  const price = parseNLNumber(col(headers, fields, 'Slotkoers'))
  const total = requireNumber(col(headers, fields, 'Waarde in EUR'), 'Waarde in EUR', parseNLNumberOrNull)

  return {
    name,
    ticker: null,
    isin,
    units: Math.abs(units),
    price_per_unit: Math.abs(price),
    total_amount: Math.abs(total),
    date: null,
    type: 'position',
    fees: 0,
    currency: 'EUR',
    exchange,
    // Positie-rijen zijn geen transacties en worden nooit ontdubbeld.
    externalId: null,
    raw,
  }
}

function parseSaxoRow(headers: string[], fields: string[]): ParsedHoldingRow | null {
  const name = col(headers, fields, 'Instrument')
  if (!name) return null

  const ticker = col(headers, fields, 'Symbool') || null
  const isin = col(headers, fields, 'ISIN') || null
  const units = parseNLNumber(col(headers, fields, 'Aantal'))
  const currentPrice = parseNLNumber(col(headers, fields, 'Huidige prijs'))
  const total = requireNumber(col(headers, fields, 'Waarde'), 'Waarde', parseNLNumberOrNull)
  const currency = col(headers, fields, 'Valuta') || 'EUR'
  const raw = buildRawRecord(headers, fields)

  return {
    name,
    ticker,
    isin,
    units: Math.abs(units),
    price_per_unit: Math.abs(currentPrice),
    total_amount: Math.abs(total),
    date: null,
    type: 'position',
    fees: 0,
    currency,
    exchange: null,
    // Positie-rijen zijn geen transacties en worden nooit ontdubbeld.
    externalId: null,
    raw,
  }
}

function parseINGBeleggenRow(headers: string[], fields: string[]): ParsedHoldingRow | null {
  const name = col(headers, fields, 'Naam effect')
  if (!name) return null

  const isin = col(headers, fields, 'ISIN-code') || null
  const dateStr = col(headers, fields, 'Datum')
  const units = parseNLNumber(col(headers, fields, 'Aantal'))
  const price = parseNLNumber(col(headers, fields, 'Koers'))
  const total = requireNumber(col(headers, fields, 'Waarde'), 'Waarde', parseNLNumberOrNull)
  const raw = buildRawRecord(headers, fields)

  return {
    name,
    ticker: null,
    isin,
    units: Math.abs(units),
    price_per_unit: Math.abs(price),
    total_amount: Math.abs(total),
    date: parseNLDate(dateStr),
    type: 'position',
    fees: 0,
    currency: 'EUR',
    exchange: null,
    // Positie-rijen zijn geen transacties en worden nooit ontdubbeld.
    externalId: null,
    raw,
  }
}

/**
 * Parse a Trading 212 "Account Statement" CSV row.
 *
 * Trading 212 actions we map:
 *   - "Market buy", "Limit buy", "Stop buy"   → buy
 *   - "Market sell", "Limit sell", "Stop sell" → sell
 *   - "Dividend (...)"                         → dividend
 *
 * Cash-only actions (Deposit, Withdrawal, Interest on cash, Currency
 * conversion, Card debit) are skipped — they do not affect holdings.
 */
function parseTrading212Row(headers: string[], fields: string[]): ParsedHoldingRow | null {
  const action = col(headers, fields, 'Action').toLowerCase()
  if (!action) return null

  // Only handle holdings-relevant actions; skip cash movements.
  let type: HoldingRowType
  if (action.startsWith('market buy') || action.startsWith('limit buy') || action.startsWith('stop buy')) {
    type = 'buy'
  } else if (action.startsWith('market sell') || action.startsWith('limit sell') || action.startsWith('stop sell')) {
    type = 'sell'
  } else if (action.startsWith('dividend')) {
    type = 'dividend'
  } else {
    return null
  }

  const name = col(headers, fields, 'Name')
  const ticker = col(headers, fields, 'Ticker') || null
  const isin = col(headers, fields, 'ISIN') || null
  // Without name AND identifier we cannot meaningfully import the row.
  if (!name && !ticker && !isin) return null

  const time = col(headers, fields, 'Time')
  const units = parseENNumber(col(headers, fields, 'No. of shares'))
  const pricePerShare = parseENNumber(col(headers, fields, 'Price / share'))
  const total = requireNumber(col(headers, fields, 'Total'), 'Total', parseENNumberOrNull)
  const currency = col(headers, fields, 'Currency (Total)') || col(headers, fields, 'Currency (Price / share)') || 'EUR'
  const notes = col(headers, fields, 'Notes')
  // Trading 212 zet een eigen transactie-id in de laatste kolom ("ID").
  const externalId = col(headers, fields, 'ID').trim() || null
  const raw = buildRawRecord(headers, fields)

  return {
    name: name || ticker || isin || 'Onbekend',
    ticker,
    isin,
    units: Math.abs(units),
    price_per_unit: Math.abs(pricePerShare),
    total_amount: Math.abs(total),
    date: parseISODatePrefix(time),
    type,
    fees: 0,
    currency,
    exchange: null,
    externalId,
    raw: notes ? { ...raw, _notes: notes } : raw,
  }
}

/**
 * Parse an eToro "Account Statement / Transactions" CSV row.
 *
 * eToro's transaction log uses a free-text "Type" column. We map common
 * trade-related types and skip everything else (deposits, withdrawals,
 * fees, balance updates, mirror copy events).
 *
 * The instrument identifier lives in the "Details" column, formatted as
 * "TICKER/USD" or "TICKER/EUR" (e.g. "AAPL/USD"). When ISIN is provided as
 * a separate column we prefer that.
 */
function parseEtoroRow(headers: string[], fields: string[]): ParsedHoldingRow | null {
  const rawType = col(headers, fields, 'Type').trim().toLowerCase()
  if (!rawType) return null

  let type: HoldingRowType
  if (rawType === 'open position' || rawType.startsWith('open position')) {
    type = 'buy'
  } else if (rawType === 'position closed' || rawType.startsWith('position closed') || rawType === 'close position') {
    type = 'sell'
  } else if (rawType === 'dividend' || rawType.startsWith('dividend')) {
    type = 'dividend'
  } else {
    // Skip everything else (deposit, withdrawal, fee, balance, transfer, ...)
    return null
  }

  const details = col(headers, fields, 'Details').trim()
  const isin = col(headers, fields, 'ISIN') || null
  // Details is typically "TICKER/USD" or "TICKER/EUR"; take the part before "/"
  const tickerFromDetails = details.includes('/') ? details.split('/')[0].trim() : details
  const ticker = tickerFromDetails || null

  if (!details && !isin) return null

  const date = col(headers, fields, 'Date')
  const amount = requireNumber(col(headers, fields, 'Amount'), 'Amount', parseENNumberOrNull)
  const units = parseENNumber(col(headers, fields, 'Units') || col(headers, fields, 'Units / Contracts'))
  const equityChange = parseENNumber(col(headers, fields, 'Realized Equity Change'))
  // eToro's Position ID hoort bij de POSITIE, niet bij de regel: openen en
  // sluiten delen hetzelfde nummer. De dedup-sleutel voegt daarom soort + datum
  // toe (zie lib/holdings-import-key.ts) — het id alleen zou de sluitregel als
  // duplicaat van de openregel laten sneuvelen.
  const externalId = col(headers, fields, 'Position ID').trim() || null
  const raw = buildRawRecord(headers, fields)

  // For dividends eToro reports the cash amount in "Amount" but no units —
  // fall back to a unit value of 1 so the total is preserved.
  const safeUnits = units > 0 ? units : 1
  const totalAbs = Math.abs(amount || equityChange)
  const pricePerUnit = safeUnits > 0 ? totalAbs / safeUnits : 0

  return {
    name: details || ticker || isin || 'Onbekend',
    ticker,
    isin,
    units: Math.abs(units),
    price_per_unit: pricePerUnit,
    total_amount: totalAbs,
    date: parseEtoroDate(date),
    type,
    fees: 0,
    // eToro accounts are USD-based; expose explicitly for downstream FX work.
    currency: 'USD',
    exchange: null,
    externalId,
    raw,
  }
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a broker CSV file and return structured holding/transaction rows.
 *
 * The function is resilient to:
 * - BOM characters at the start of the file
 * - Empty or comment rows
 * - Slight header variations (extra whitespace, different casing)
 * - Missing optional columns
 */
export function parseBrokerCSV(content: string, broker: BrokerType): BrokerParseResult {
  const result: BrokerParseResult = {
    broker,
    rows: [],
    errors: [],
    skipped: 0,
    // Wordt aan het eind afgeleid uit de gelezen rijen; blijft 'unknown' op elk
    // vroeg return-pad (leeg bestand, geweigerd formaat).
    contentKind: 'unknown',
  }

  // Strip BOM and split into lines
  const cleaned = content.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/)

  // Find the first non-empty line as the header
  const headerIdx = lines.findIndex((l) => l.trim().length > 0)
  if (headerIdx === -1) {
    result.errors.push('Bestand is leeg of bevat geen geldige regels.')
    return result
  }

  // DEGIRO Rekeningoverzicht (Account.csv) is COMMA-delimited cash-mutations and
  // is deliberately NOT supported. Detect it BEFORE parsing so the user gets a
  // specific, actionable error instead of the generic "wrong brokerformat" one.
  // The header line is comma-separated, but delimiterFor('degiro') is ';', so a
  // ';'-split would yield one field (the whole line). We therefore detect on the
  // raw header line, split on comma, lowercased.
  if (broker === 'degiro') {
    const accountHeaderLower = lines[headerIdx]
      .split(',')
      .map((h) => h.toLowerCase())
    if (isDegiroAccountOverview(accountHeaderLower)) {
      result.errors.push(DEGIRO_ACCOUNT_OVERVIEW_ERROR)
      return result // rows stay empty; no generic fallback message
    }
  }

  // For DEGIRO: auto-detect the actual delimiter from the header line because
  // the web export uses commas while the older desktop/classic export uses
  // semicolons. All other brokers keep their hardcoded delimiter.
  const delim: ',' | ';' =
    broker === 'degiro'
      ? detectDelimiter(lines[headerIdx], ';')
      : delimiterFor(broker)

  const rawHeaders = splitLine(lines[headerIdx], delim)
  const headers = normaliseHeaders(rawHeaders)

  // Determine DEGIRO sub-format (transaction vs. portfolio)
  const headersLower = headers.map((h) => h.toLowerCase())
  const isTransaction = broker === 'degiro' && isDegiroTransaction(headersLower)

  // Parse data rows (everything after the header)
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines and lines that look like comments or sub-totals
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue
    }

    const fields = splitLine(line, delim)

    // Skip rows where every field is empty (trailing semicolons)
    if (fields.every((f) => f === '')) {
      continue
    }

    let row: ParsedHoldingRow | null = null

    try {
      switch (broker) {
        case 'degiro':
          row = parseDegiroRow(headers, fields, isTransaction)
          break
        case 'saxo':
          row = parseSaxoRow(headers, fields)
          break
        case 'ing_beleggen':
          row = parseINGBeleggenRow(headers, fields)
          break
        case 'trading212':
          row = parseTrading212Row(headers, fields)
          break
        case 'etoro':
          row = parseEtoroRow(headers, fields)
          break
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Regel ${i + 1}: ${msg}`)
      result.skipped++
      continue
    }

    if (row) {
      result.rows.push(row)
    } else {
      result.skipped++
    }
  }

  result.contentKind = deriveContentKind(result.rows)

  if (result.rows.length === 0 && result.skipped > 0) {
    // Make the generic fallback format-aware: if this is a DEGIRO upload whose
    // header still looks like the Rekeningoverzicht (defensive — the early
    // return above normally catches it), surface the specific redirect instead
    // of the unhelpful generic text. `headersLower` here comes from the ';'-split
    // header, but isDegiroAccountOverview matches substrings, so it still hits
    // the comma-joined account header.
    if (broker === 'degiro' && isDegiroAccountOverview(headersLower)) {
      result.errors.push(DEGIRO_ACCOUNT_OVERVIEW_ERROR)
    } else {
      result.errors.push(
        'Geen geldige rijen gevonden. Controleer of het juiste brokerformaat is geselecteerd.',
      )
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/** Parse a Trading 212 Account Statement CSV. */
export function parseTrading212(csv: string): BrokerParseResult {
  return parseBrokerCSV(csv, 'trading212')
}

/** Parse an eToro Account Statement / Transactions CSV. */
export function parseEtoro(csv: string): BrokerParseResult {
  return parseBrokerCSV(csv, 'etoro')
}
