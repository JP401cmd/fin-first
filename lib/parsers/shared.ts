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
  /**
   * Bron-specifiek transactietype uit het bestand (bv. PayPal-kolom "Type":
   * "Bank Deposit to PP Account", "Algemene opname"). Wordt NIET in de DB-kolom
   * `transaction_type` opgeslagen (die heeft een CHECK-constraint op een vaste
   * enum) — puur gebruikt tijdens import om eigen-rekening-verschuivingen te
   * herkennen op rekeningen zonder bruikbare IBAN (zie CSVPreset.transferTypeColumn).
   */
  source_type: string | null
  bank_code: string | null
  /**
   * Per-rij unieke bank-referentie (bv. Rabobank `Volgnr`). NIET in import_hash:
   * de hash blijft stabiel (date|amount|description) zodat re-imports betrouwbaar
   * gedetecteerd worden. bank_seq onderscheidt écht-verschillende transacties met
   * identieke datum/bedrag/omschrijving via de samengestelde unieke index
   * `(user_id, import_hash, coalesce(bank_seq, ''))`.
   */
  bank_seq: string | null
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
  import_hash: string
}

/**
 * Compute a stable hash for duplicate detection.
 * Uses date + amount + first 100 chars of description. Bewust GEEN extra entropie
 * (zoals Volgnr) hierin — dan zou re-import-detectie breken en zou bestaande data
 * een migratie-gat krijgen. Distinct-maar-identieke transacties worden onderscheiden
 * via de aparte `bank_seq`-kolom in de samengestelde unieke index, niet via de hash.
 */
export async function computeHash(date: string, amount: number, description: string): Promise<string> {
  const input = `${date}|${amount}|${description.slice(0, 100)}`
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
