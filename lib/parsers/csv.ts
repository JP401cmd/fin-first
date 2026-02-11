/**
 * CSV parser for bank transaction files.
 * Supports ING, Rabobank, ABN AMRO CSV formats via presets.
 */

import type { ParsedTransaction } from './shared'
import { computeHash } from './shared'
import type { CSVPreset } from './index'

/**
 * Parse a CSV date string into YYYY-MM-DD format.
 */
function parseDate(value: string, format: string): string {
  value = value.replace(/['"]/g, '').trim()

  if (format === 'YYYYMMDD' && value.length === 8) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  if (format === 'DD-MM-YYYY') {
    const [d, m, y] = value.split('-')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  if (format === 'DD/MM/YYYY') {
    const [d, m, y] = value.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Default: already YYYY-MM-DD
  return value
}

/**
 * Parse an amount string from Dutch CSV (handles comma as decimal separator).
 */
function parseAmount(value: string): number {
  value = value.replace(/['"]/g, '').trim()
  // Dutch format: 1.234,56 → remove dots, replace comma with dot
  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.')
  }
  return parseFloat(value) || 0
}

/**
 * Split a CSV line respecting quoted fields.
 */
function splitCSVLine(line: string, delimiter: string): string[] {
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

/**
 * Parse a CSV file content using the given preset configuration.
 */
export async function parseCSV(
  content: string,
  preset: CSVPreset,
): Promise<ParsedTransaction[]> {
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const startIdx = preset.hasHeader ? 1 : 0
  const transactions: ParsedTransaction[] = []

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = splitCSVLine(line, preset.delimiter)

    const dateStr = fields[preset.dateColumn] ?? ''
    const amountStr = fields[preset.amountColumn] ?? ''
    const description = fields[preset.descriptionColumn] ?? ''
    const counterparty = preset.counterpartyColumn != null ? (fields[preset.counterpartyColumn] ?? null) : null

    if (!dateStr || (!amountStr && !preset.debitColumn)) continue

    let amount: number
    if (preset.debitColumn != null && preset.creditColumn != null) {
      const debit = parseAmount(fields[preset.debitColumn] ?? '0')
      const credit = parseAmount(fields[preset.creditColumn] ?? '0')
      amount = credit > 0 ? credit : -debit
    } else {
      amount = parseAmount(amountStr)
    }

    const date = parseDate(dateStr, preset.dateFormat)
    if (!date || date.length !== 10) continue

    const cleanDescription = description.replace(/\s+/g, ' ').trim() || 'Geen omschrijving'
    const hash = await computeHash(date, amount, cleanDescription)

    transactions.push({
      date,
      amount,
      description: cleanDescription,
      counterparty_name: counterparty?.trim() || null,
      counterparty_iban: null,
      reference: null,
      transaction_type: null,
      import_hash: hash,
    })
  }

  return transactions
}

/**
 * Get the header row from a CSV file for column mapping preview.
 */
export function getCSVHeaders(content: string, delimiter: string): string[] {
  const firstLine = content.trim().split(/\r?\n/)[0] ?? ''
  return splitCSVLine(firstLine, delimiter)
}

/**
 * Get preview rows from a CSV file (first N data rows).
 */
export function getCSVPreview(content: string, delimiter: string, hasHeader: boolean, count: number = 5): string[][] {
  const lines = content.trim().split(/\r?\n/)
  const startIdx = hasHeader ? 1 : 0
  const rows: string[][] = []

  for (let i = startIdx; i < Math.min(lines.length, startIdx + count); i++) {
    const line = lines[i]?.trim()
    if (!line) continue
    rows.push(splitCSVLine(line, delimiter))
  }

  return rows
}
