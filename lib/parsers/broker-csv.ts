/**
 * CSV parsers for Dutch broker portfolio/transaction exports.
 * Supports DEGIRO, Saxo Bank, and ING Beleggen formats.
 *
 * All three brokers use semicolon-delimited CSVs with Dutch number formatting
 * (comma as decimal separator, dot as thousands separator).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrokerType = 'degiro' | 'saxo' | 'ing_beleggen'

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

  return null
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

  const rawHeaders = splitLine(lines[headerIdx], ';')
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

    const fields = splitLine(line, ';')

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
