/**
 * MT940 parser wrapper around mt940js.
 * Parses MT940 bank statement files and returns normalized transactions.
 * Runs client-side (mt940js works in the browser).
 */

import MT940 from 'mt940js'
import { computeHash, type ParsedTransaction } from './shared'

export type { ParsedTransaction } from './shared'

/**
 * Extract counterparty name from MT940 field 86 details.
 * Dutch banks typically put the name after /NAME/ or NAAM: markers.
 */
function extractCounterpartyName(details: string): string | null {
  // Try /NAME/ pattern (common in Dutch MT940)
  const nameMatch = details.match(/\/NAME\/([^/]+)/i)
  if (nameMatch) return nameMatch[1].trim()

  // Try NAAM: pattern
  const naamMatch = details.match(/NAAM:\s*(.+?)(?:\n|$)/i)
  if (naamMatch) return naamMatch[1].trim()

  return null
}

/**
 * Extract counterparty IBAN from MT940 field 86 details.
 */
function extractCounterpartyIban(details: string): string | null {
  const ibanMatch = details.match(/\/IBAN\/([A-Z]{2}\d{2}[A-Z0-9]{4,30})/i)
  if (ibanMatch) return ibanMatch[1].trim()

  // Generic IBAN pattern
  const genericMatch = details.match(/\b([A-Z]{2}\d{2}[A-Z]{4}\d{10,18})\b/)
  if (genericMatch) return genericMatch[1]

  return null
}

/**
 * Extract reference from MT940 field 86 details.
 */
function extractReference(details: string): string | null {
  const refMatch = details.match(/\/RREF\/([^/]+)/i)
  if (refMatch) return refMatch[1].trim()

  const erefMatch = details.match(/\/EREF\/([^/]+)/i)
  if (erefMatch) return erefMatch[1].trim()

  return null
}

/**
 * Parse an MT940 file content string into normalized transactions.
 */
export async function parseMT940(content: string): Promise<ParsedTransaction[]> {
  const parser = new MT940()
  const statements = parser.parse(content)

  const transactions: ParsedTransaction[] = []

  for (const statement of statements) {
    for (const tx of statement.transactions) {
      const date = formatDate(tx.date)
      const amount = tx.amount
      const details = tx.details || ''
      const description = details.replace(/\s+/g, ' ').trim() || 'Geen omschrijving'

      const hash = await computeHash(date, amount, description)

      transactions.push({
        date,
        amount,
        description,
        counterparty_name: extractCounterpartyName(details),
        counterparty_iban: extractCounterpartyIban(details),
        reference: extractReference(details),
        transaction_type: tx.transactionType || null,
        import_hash: hash,
      })
    }
  }

  return transactions
}

function formatDate(date: Date | string): string {
  if (typeof date === 'string') return date
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
