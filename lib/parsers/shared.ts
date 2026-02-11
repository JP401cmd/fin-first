/**
 * Shared types and utilities for all parsers.
 */

export type ParsedTransaction = {
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  reference: string | null
  transaction_type: string | null
  import_hash: string
}

/**
 * Compute a simple hash for duplicate detection.
 * Uses date + amount + first 100 chars of description.
 */
export async function computeHash(date: string, amount: number, description: string): Promise<string> {
  const input = `${date}|${amount}|${description.slice(0, 100)}`
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
