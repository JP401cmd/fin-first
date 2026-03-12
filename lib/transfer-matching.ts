import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Match and bidirectionally link unlinked transfer pairs.
 *
 * When both sides of an own-account transfer are imported from separate
 * bank exports, they arrive as independent rows with `transaction_type = 'transfer'`
 * but no `linked_transfer_id`. This function finds matching pairs and links them,
 * using the same bidirectional pattern as manual-transfer-sheet.tsx.
 *
 * Match criteria (ALL must hold):
 * - Same absolute amount, opposite sign
 * - Dates within 1 day (bank processing delay)
 * - IBAN cross-match: account_iban_A === counterparty_iban_B AND vice versa
 */
export async function linkUnmatchedTransfers(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  // 1. Fetch all unlinked transfers for this user
  const { data: transfers, error: txError } = await supabase
    .from('transactions')
    .select('id, account_id, date, amount, counterparty_iban')
    .eq('user_id', userId)
    .eq('transaction_type', 'transfer')
    .is('linked_transfer_id', null)
    .order('date', { ascending: true })

  if (txError || !transfers || transfers.length < 2) return 0

  // 2. Fetch bank accounts to get IBANs
  const accountIds = [...new Set(transfers.map(t => t.account_id))]
  const { data: accounts, error: accError } = await supabase
    .from('bank_accounts')
    .select('id, iban')
    .in('id', accountIds)

  if (accError || !accounts) return 0

  const ibanByAccountId = new Map<string, string>()
  for (const acc of accounts) {
    if (acc.iban) ibanByAccountId.set(acc.id, acc.iban.replace(/\s/g, '').toUpperCase())
  }

  // Normalize counterparty IBANs on transfers
  const enriched = transfers.map(t => ({
    ...t,
    amount: Number(t.amount),
    accountIban: ibanByAccountId.get(t.account_id) ?? null,
    counterpartyIban: t.counterparty_iban?.replace(/\s/g, '').toUpperCase() ?? null,
  }))

  // 3. Find matching pairs
  const matched = new Set<string>()
  let pairsLinked = 0

  for (let i = 0; i < enriched.length; i++) {
    const a = enriched[i]
    if (matched.has(a.id)) continue
    if (!a.accountIban || !a.counterpartyIban) continue

    for (let j = i + 1; j < enriched.length; j++) {
      const b = enriched[j]
      if (matched.has(b.id)) continue
      if (!b.accountIban || !b.counterpartyIban) continue

      // Same absolute amount, opposite sign
      if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > 0.005) continue
      if (Math.sign(a.amount) === Math.sign(b.amount)) continue

      // Date within 1 day
      const dayA = new Date(a.date).getTime()
      const dayB = new Date(b.date).getTime()
      if (Math.abs(dayA - dayB) > 86_400_000) continue

      // IBAN cross-match
      if (a.accountIban !== b.counterpartyIban) continue
      if (b.accountIban !== a.counterpartyIban) continue

      // Match found — link bidirectionally
      const [resA, resB] = await Promise.all([
        supabase.from('transactions').update({ linked_transfer_id: b.id }).eq('id', a.id),
        supabase.from('transactions').update({ linked_transfer_id: a.id }).eq('id', b.id),
      ])

      if (!resA.error && !resB.error) {
        matched.add(a.id)
        matched.add(b.id)
        pairsLinked++
      }

      break // a is matched, move to next i
    }
  }

  return pairsLinked
}
