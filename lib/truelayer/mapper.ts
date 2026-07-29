import type { TLTransaction } from './types'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { computeHash } from '@/lib/parsers/shared'

/** Lege/whitespace-only providerwaarden tellen als "niet gevuld" (→ null),
 *  zodat ze niet als lege tegenpartij in de DB landen en de meta-fallback
 *  hieronder gewoon aan bod komt. ParsedTransaction gebruikt null, niet ''. */
function blankToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Map a TrueLayer transaction to our ParsedTransaction format.
 * Uses the same computeHash() as file-based import for cross-import deduplication.
 */
export async function mapTransaction(tl: TLTransaction): Promise<ParsedTransaction> {
  const date = tl.timestamp.split('T')[0]
  const description = tl.description ?? ''
  // Tegenpartij: `merchant_name` is het gestandaardiseerde veld, maar de
  // Nederlandse xs2a-banken (Rabobank live: 0/354 gevuld) laten het leeg en
  // zetten naam + IBAN in `meta.counter_party_*`. Vandaar de fallback — zonder
  // deze blijft counterparty_name/-iban leeg en verliest de categorisatie
  // (regelmotor én AI) haar sterkste signaal. Pariteit met de CSV/MT940-import,
  // die deze twee velden al vult.
  const counterparty_name =
    blankToNull(tl.merchant_name) ?? blankToNull(tl.meta?.counter_party_preferred_name)
  const counterparty_iban = blankToNull(tl.meta?.counter_party_iban)

  // import_hash blijft bewust date+amount+description: de tegenpartij verrijkt
  // de rij, maar mag de dedup-sleutel niet verschuiven (bestaande rijen zouden
  // anders als "nieuw" terugkomen bij de volgende sync).
  const import_hash = await computeHash(date, tl.amount, description)

  return {
    date,
    amount: tl.amount,
    description,
    counterparty_name,
    counterparty_iban,
    reference: tl.transaction_id ?? null,
    // De DB-CHECK op transaction_type staat alleen semantische types toe
    // ('transfer'/'salary'/...); rauwe TrueLayer-categorieën ('PURCHASE',
    // 'DIRECT_DEBIT', ...) horen in bank_code, net als de CSV-import doet.
    transaction_type: null,
    source_type: null,
    bank_code: tl.transaction_category ?? tl.transaction_type ?? null,
    // transaction_id staat al in `reference`; bewust niet als bank_seq omdat een
    // pending→posted id-wissel (zelfde datum/bedrag/omschrijving) anders een valse
    // "nieuwe" rij zou worden in de samengestelde unieke index.
    bank_seq: null,
    running_balance: tl.running_balance?.amount ?? null,
    creditor_id: null,
    // fx/creditor niet beschikbaar uit TrueLayer; CSV-import vult deze.
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
    import_hash,
  }
}

/**
 * Map an array of TrueLayer transactions.
 */
export async function mapTransactions(tlTransactions: TLTransaction[]): Promise<ParsedTransaction[]> {
  return Promise.all(tlTransactions.map(mapTransaction))
}
