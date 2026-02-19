import type { GCTransaction } from './types'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { computeHash } from '@/lib/parsers/shared'

/**
 * Map a GoCardless transaction to our ParsedTransaction format.
 * Uses the same computeHash() as file-based import for cross-import deduplication.
 */
export async function mapTransaction(gc: GCTransaction): Promise<ParsedTransaction> {
  const amount = parseFloat(gc.transactionAmount.amount)
  const description =
    gc.remittanceInformationUnstructured ??
    gc.remittanceInformationUnstructuredArray?.join(' ') ??
    ''

  // Determine counterparty based on transaction direction
  const isIncome = amount > 0
  const counterparty_name = isIncome
    ? gc.debtorName ?? gc.creditorName ?? null
    : gc.creditorName ?? gc.debtorName ?? null
  const counterparty_iban = isIncome
    ? gc.debtorAccount?.iban ?? gc.creditorAccount?.iban ?? null
    : gc.creditorAccount?.iban ?? gc.debtorAccount?.iban ?? null

  const import_hash = await computeHash(gc.bookingDate, amount, description)

  return {
    date: gc.bookingDate,
    amount,
    description,
    counterparty_name,
    counterparty_iban,
    reference: gc.internalTransactionId ?? gc.transactionId ?? null,
    transaction_type: gc.bankTransactionCode ?? null,
    import_hash,
  }
}

/**
 * Map an array of GoCardless transactions.
 */
export async function mapTransactions(gcTransactions: GCTransaction[]): Promise<ParsedTransaction[]> {
  return Promise.all(gcTransactions.map(mapTransaction))
}
