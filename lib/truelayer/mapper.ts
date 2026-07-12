import type { TLTransaction } from './types'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { computeHash } from '@/lib/parsers/shared'

/**
 * Map a TrueLayer transaction to our ParsedTransaction format.
 * Uses the same computeHash() as file-based import for cross-import deduplication.
 */
export async function mapTransaction(tl: TLTransaction): Promise<ParsedTransaction> {
  const date = tl.timestamp.split('T')[0]
  const description = tl.description ?? ''
  const counterparty_name = tl.merchant_name ?? null

  const import_hash = await computeHash(date, tl.amount, description)

  return {
    date,
    amount: tl.amount,
    description,
    counterparty_name,
    counterparty_iban: null,
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
