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
  bank_code: string | null
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
  import_hash: string
}

/**
 * Compute a simple hash for duplicate detection.
 * Uses date + amount + first 100 chars of description, plus optional `extra`
 * entropy (bv. een unieke bank-volgnummer zoals Rabobank `Volgnr`) zodat twee
 * écht-verschillende transacties met identieke datum/bedrag/omschrijving toch
 * een unieke hash krijgen (de unieke index `(user_id, import_hash)` blokkeert ze
 * anders). `extra` weggelaten → identiek gedrag als voorheen (backward-compat).
 */
export async function computeHash(date: string, amount: number, description: string, extra?: string): Promise<string> {
  const base = `${date}|${amount}|${description.slice(0, 100)}`
  const input = extra ? `${base}|${extra}` : base
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
