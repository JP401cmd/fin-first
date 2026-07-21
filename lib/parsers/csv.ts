/**
 * CSV parser for bank transaction files.
 * Supports ING, Rabobank, ABN AMRO CSV formats via presets.
 */

import type { ParsedTransaction, ImportWarning } from './shared'
import { computeHash, parseAmountOrNull } from './shared'
import type { CSVPreset } from './index'

/** Resultaat van {@link parseCSVWithWarnings}: geldige transacties + overgeslagen rijen. */
export interface CSVParseResult {
  transactions: ParsedTransaction[]
  warnings: ImportWarning[]
}

/**
 * Parse a CSV date string into YYYY-MM-DD format.
 */
function parseDate(value: string, format: string): string {
  value = value.replace(/['"]/g, '').trim()

  if (format === 'YYYYMMDD' && value.length === 8) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  // Dag-maand-jaar: tolereer zowel '/' als '-' als scheidingsteken. PayPal NL
  // exporteert datums als DD-MM-YYYY terwijl de preset DD/MM/YYYY aangeeft (en
  // andersom); splits daarom op beide. Een onvolledige datum geeft de ruwe waarde
  // terug — die faalt de YYYY-MM-DD-controle in parseCSV en wordt netjes
  // overgeslagen i.p.v. de hele import te laten crashen op een undefined deel.
  if (format === 'DD-MM-YYYY' || format === 'DD/MM/YYYY') {
    const [d, m, y] = value.split(/[/-]/)
    if (!d || !m || !y) return value
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Default: already YYYY-MM-DD
  return value
}

/**
 * Parse a debit/credit column value. An EMPTY cell means "0" (the amount lives
 * in the sibling column); a non-empty but unparseable cell returns null so the
 * caller skips the row with a warning instead of importing a wrong €0 amount.
 */
function parseDebitCredit(value: string): number | null {
  if (!value.replace(/['"]/g, '').trim()) return 0
  return parseAmountOrNull(value)
}

/**
 * Parse an optional Dutch-format amount (balance, FX); null for empty or
 * unparseable cells. These are non-critical enrichment fields — an unreadable
 * value degrades silently to null rather than blocking the transaction.
 */
function parseOptionalAmount(value: string): number | null {
  return parseAmountOrNull(value)
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
 * Parse a CSV file, returning both the valid transactions and any rows that were
 * skipped because their amount could not be read. Prefer this over {@link parseCSV}
 * on surfaces that can surface warnings to the user (e.g. the import UI).
 */
export async function parseCSVWithWarnings(
  content: string,
  preset: CSVPreset,
): Promise<CSVParseResult> {
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return { transactions: [], warnings: [] }

  const startIdx = preset.hasHeader ? 1 : 0
  const transactions: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []

  const skipUnparseable = (line: number, raw: string) => {
    warnings.push({
      line,
      code: 'unparseable_amount',
      message: `Regel ${line} overgeslagen: het bedrag "${raw.trim()}" is onleesbaar.`,
    })
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = splitCSVLine(line, preset.delimiter)

    // Filter by status column (e.g. PayPal: only import 'Voltooid' rows)
    if (preset.statusColumn != null && preset.statusFilterValue) {
      const statusValue = (fields[preset.statusColumn] ?? '').trim()
      if (statusValue !== preset.statusFilterValue) continue
    }

    const dateStr = fields[preset.dateColumn] ?? ''
    const amountStr = fields[preset.amountColumn] ?? ''
    const description = fields[preset.descriptionColumn] ?? ''
    const counterparty = preset.counterpartyColumn != null ? (fields[preset.counterpartyColumn] ?? null) : null
    const iban = preset.ibanColumn != null ? (fields[preset.ibanColumn] ?? null) : null
    const reference = preset.referenceColumn != null ? (fields[preset.referenceColumn] ?? null) : null
    const sourceType = preset.transferTypeColumn != null ? (fields[preset.transferTypeColumn] ?? null) : null

    if (!dateStr || (!amountStr && !preset.debitColumn)) continue

    let amount: number
    if (preset.debitColumn != null && preset.creditColumn != null) {
      const debitRaw = fields[preset.debitColumn] ?? ''
      const creditRaw = fields[preset.creditColumn] ?? ''
      const debit = parseDebitCredit(debitRaw)
      const credit = parseDebitCredit(creditRaw)
      // Onleesbaar (niet-leeg, geen getal) → rij overslaan + waarschuwing i.p.v. €0.
      if (debit === null || credit === null) {
        skipUnparseable(i + 1, debit === null ? debitRaw : creditRaw)
        continue
      }
      amount = credit > 0 ? credit : -debit
    } else {
      const parsedAmount = parseAmountOrNull(amountStr)
      if (parsedAmount === null) {
        skipUnparseable(i + 1, amountStr)
        continue
      }
      amount = parsedAmount
      // Handle sign column (e.g. ING "Af Bij" column where "Af" = debit, "Bij" = credit)
      if (preset.signColumn != null && preset.signDebitValue) {
        const signValue = (fields[preset.signColumn] ?? '').trim().toLowerCase()
        const debitValue = preset.signDebitValue.toLowerCase()
        if (signValue === debitValue) {
          amount = -Math.abs(amount)
        } else {
          amount = Math.abs(amount)
        }
      }
    }

    const date = parseDate(dateStr, preset.dateFormat)
    // Validate date is in YYYY-MM-DD format (not just length 10)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const cleanDescription = description.replace(/\s+/g, ' ').trim() || 'Geen omschrijving'
    // import_hash blijft stabiel (date|amount|description) → betrouwbare re-import-detectie.
    // De per-rij unieke referentie (bv. Rabobank-Volgnr) gaat naar bank_seq, zodat twee
    // écht-verschillende transacties met identieke datum/bedrag/omschrijving naast elkaar
    // kunnen bestaan via de samengestelde unieke index (user_id, import_hash, bank_seq).
    const uniqueRef = preset.uniqueRefColumn != null ? (fields[preset.uniqueRefColumn] ?? '').trim() : ''
    const hash = await computeHash(date, amount, cleanDescription)

    const bankCodeVal = preset.bankCodeColumn != null ? (fields[preset.bankCodeColumn] ?? '').trim() : ''
    const balanceVal = preset.balanceColumn != null ? (fields[preset.balanceColumn] ?? '').trim() : ''
    const creditorVal = preset.creditorColumn != null ? (fields[preset.creditorColumn] ?? '').trim() : ''
    const fxAmtVal = preset.fxAmountColumn != null ? (fields[preset.fxAmountColumn] ?? '').trim() : ''
    const fxCurVal = preset.fxCurrencyColumn != null ? (fields[preset.fxCurrencyColumn] ?? '').trim() : ''
    const fxRateVal = preset.fxRateColumn != null ? (fields[preset.fxRateColumn] ?? '').trim() : ''

    transactions.push({
      date,
      amount,
      description: cleanDescription,
      counterparty_name: counterparty?.trim() || null,
      counterparty_iban: iban?.trim() || null,
      reference: reference?.trim() || null,
      transaction_type: null,
      source_type: sourceType?.trim() || null,
      bank_code: bankCodeVal || null,
      bank_seq: uniqueRef || null,
      running_balance: parseOptionalAmount(balanceVal),
      creditor_id: creditorVal || null,
      fx_amount: parseOptionalAmount(fxAmtVal),
      fx_currency: fxCurVal || null,
      fx_rate: parseOptionalAmount(fxRateVal),
      import_hash: hash,
    })
  }

  return { transactions, warnings }
}

/**
 * Parse a CSV file content using the given preset configuration.
 *
 * Backwards-compatible thin wrapper around {@link parseCSVWithWarnings} that
 * returns only the transactions. Skipped/unreadable rows are dropped silently
 * here — call `parseCSVWithWarnings` when you need to surface those to the user.
 */
export async function parseCSV(
  content: string,
  preset: CSVPreset,
): Promise<ParsedTransaction[]> {
  return (await parseCSVWithWarnings(content, preset)).transactions
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
