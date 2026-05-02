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
  /** Original CSV row preserved as key-value pairs for debugging / auditing. */
  raw: Record<string, string>
}

export interface BrokerParseResult {
  broker: BrokerType
  rows: ParsedHoldingRow[]
  /** Non-fatal parsing warnings (e.g. unrecognised rows, missing fields). */
  errors: string[]
  /** Number of rows that were skipped entirely. */
  skipped: number
}

// ---------------------------------------------------------------------------
// Broker presets (UI-facing metadata)
// ---------------------------------------------------------------------------

export type BrokerPreset = {
  id: BrokerType
  label: string
  description: string
  exampleHeader: string
}

export const BROKER_PRESETS: BrokerPreset[] = [
  {
    id: 'degiro',
    label: 'DEGIRO',
    description: 'Portfolio of transactie-export uit DEGIRO',
    exampleHeader: 'Product,ISIN,Beurs,...',
  },
  {
    id: 'saxo',
    label: 'Saxo Bank',
    description: 'Export uit Saxo Bank/BinckBank',
    exampleHeader: 'Instrument,ISIN,...',
  },
  {
    id: 'ing_beleggen',
    label: 'ING Beleggen',
    description: 'Export uit Mijn ING Beleggen',
    exampleHeader: 'Datum,ISIN,Fonds,...',
  },
  {
    id: 'trading212',
    label: 'Trading 212',
    description: 'Account Statement-export uit Trading 212',
    exampleHeader: 'Action,Time,ISIN,Ticker,Name,...',
  },
  {
    id: 'etoro',
    label: 'eToro',
    description: 'Account Statement-export uit eToro',
    exampleHeader: 'Date,Type,Details,Amount,Units,...',
  },
]

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
 * Case-insensitive, whitespace-trimmed column lookup.
 * Returns the field value or empty string if not found.
 */
function col(headers: string[], fields: string[], name: string): string {
  const target = name.trim().toLowerCase()
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === target)
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

/** Lowercase header fingerprints used to identify each broker format. */
const DEGIRO_PORTFOLIO_MARKERS = ['product', 'isin', 'beurs', 'aantal', 'slotkoers']
const DEGIRO_TRANSACTION_MARKERS = ['datum', 'product', 'isin', 'koers', 'transactiekosten']
const SAXO_MARKERS = ['instrument', 'symbool', 'isin', 'gemiddelde openingsprijs']
const ING_BELEGGEN_MARKERS = ['naam effect', 'isin-code', 'aantal', 'koers']
const TRADING212_MARKERS = ['action', 'time', 'isin', 'ticker', 'no. of shares']
const ETORO_MARKERS = ['date', 'type', 'details', 'amount', 'units']

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
 * Pick the column delimiter for a given broker. Dutch brokers (DEGIRO, Saxo,
 * ING) use semicolons; Trading 212 and eToro both use commas.
 */
function delimiterFor(broker: BrokerType): ',' | ';' {
  return broker === 'trading212' || broker === 'etoro' ? ',' : ';'
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
    const price = parseNLNumber(col(headers, fields, 'Koers'))
    const total = parseNLNumber(col(headers, fields, 'Waarde'))
    const fees = parseNLNumber(col(headers, fields, 'Transactiekosten en/of'))

    // Determine type from sign of units (positive = buy, negative = sell).
    // If units is exactly 0 this row is likely not a trade — skip it.
    const type: HoldingRowType = units >= 0 ? 'buy' : 'sell'

    return {
      name,
      ticker: null,
      isin,
      units: Math.abs(units),
      price_per_unit: Math.abs(price),
      total_amount: Math.abs(total),
      date: parseNLDate(dateStr),
      type,
      fees: Math.abs(fees),
      currency: 'EUR',
      exchange,
      raw,
    }
  }

  // Portfolio (position) row
  const units = parseNLNumber(col(headers, fields, 'Aantal'))
  const price = parseNLNumber(col(headers, fields, 'Slotkoers'))
  const total = parseNLNumber(col(headers, fields, 'Waarde in EUR'))

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
  const total = parseNLNumber(col(headers, fields, 'Waarde'))
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
  const total = parseNLNumber(col(headers, fields, 'Waarde'))
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
  const total = parseENNumber(col(headers, fields, 'Total'))
  const currency = col(headers, fields, 'Currency (Total)') || col(headers, fields, 'Currency (Price / share)') || 'EUR'
  const notes = col(headers, fields, 'Notes')
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
  const amount = parseENNumber(col(headers, fields, 'Amount'))
  const units = parseENNumber(col(headers, fields, 'Units') || col(headers, fields, 'Units / Contracts'))
  const equityChange = parseENNumber(col(headers, fields, 'Realized Equity Change'))
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

  const delim = delimiterFor(broker)
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

  if (result.rows.length === 0 && result.skipped > 0) {
    result.errors.push(
      'Geen geldige rijen gevonden. Controleer of het juiste brokerformaat is geselecteerd.',
    )
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
