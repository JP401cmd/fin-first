import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOwnAccountIbansStrict, ibanById } from '@/lib/own-accounts-ibans'
import { normalizeIban } from '@/lib/own-accounts'

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
 *
 * ## Waar de eigen IBANs vandaan komen (en waarom niet meer uit de kolom)
 *
 * Dit bestand draait in de browser (`/core/cash/import` roept 'm aan met de
 * browser-client). De veldencryptiesleutels zijn server-only, dus
 * `bank_accounts.iban_encrypted` is hier niet te ontsleutelen — de IBANs komen
 * via `GET /api/own-accounts/ibans`. Dat is geen omweg maar de enige route: de
 * plaintext-kolom verdwijnt in Stage B.
 *
 * ## Deze functie faalt luid, en dat is een gedragswijziging met een reden
 *
 * De vorige versie gaf `return 0` bij élke leesfout — op de IBANs én op de
 * transacties. Nul gekoppelde paren is echter niet hetzelfde als "er viel niets
 * te koppelen": elk niet-gekoppeld paar telt in de rest van de app door als een
 * échte inkomst én een échte uitgave, en corrumpeert zo de spaarquote zonder dat
 * er ergens iets rood wordt. Een leesfout gooit daarom nu; de aanroepers vangen
 * 'm al af met `.catch(console.error)`, dus de import breekt er niet op — de
 * fout is alleen niet langer onzichtbaar.
 */

/** De transactievelden die de paarherkenning nodig heeft. */
export interface UnlinkedTransfer {
  id: string
  account_id: string
  date: string
  amount: number | string
  counterparty_iban: string | null
}

/** Eén gevonden paar: twee transactie-ids die aan elkaar geknoopt moeten worden. */
export type TransferPair = readonly [string, string]

/**
 * De pure paarherkenning: geen IO, volledig bepaald door zijn invoer.
 *
 * Bewust apart van de databaseronde eromheen, zodat de matchregels — het deel
 * waar een fout stilletjes de spaarquote raakt — direct te testen zijn zonder
 * Supabase-mock.
 *
 * @param transfers        Ongekoppelde transfers, oplopend op datum.
 * @param ibanByAccountId  Rekening-id → IBAN (ruwe vorm; wordt hier genormaliseerd).
 */
export function findTransferPairs(
  transfers: UnlinkedTransfer[],
  ibanByAccountId: Map<string, string>,
): TransferPair[] {
  const normalizedByAccount = new Map<string, string>()
  for (const [accountId, iban] of ibanByAccountId) {
    if (iban && iban.trim()) normalizedByAccount.set(accountId, normalizeIban(iban))
  }

  const enriched = transfers.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Number(t.amount),
    accountIban: normalizedByAccount.get(t.account_id) ?? null,
    counterpartyIban: t.counterparty_iban ? normalizeIban(t.counterparty_iban) : null,
  }))

  const matched = new Set<string>()
  const pairs: TransferPair[] = []

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

      matched.add(a.id)
      matched.add(b.id)
      pairs.push([a.id, b.id] as const)

      break // a is matched, move to next i
    }
  }

  return pairs
}

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

  // Onderscheid "leesfout" van "niets te doen": alleen het tweede is een
  // legitieme 0. Zie de kop van dit bestand.
  if (txError) {
    throw new Error(`Ongekoppelde overboekingen lezen mislukt: ${txError.message}`)
  }
  if (!transfers || transfers.length < 2) return 0

  // 2. Eigen rekening-IBANs — strict: een onvolledige set zou paren missen en
  //    die overboekingen als echte inkomsten/uitgaven laten staan.
  const accounts = await fetchOwnAccountIbansStrict()

  const pairs = findTransferPairs(transfers as UnlinkedTransfer[], ibanById(accounts))

  // 3. Link each pair bidirectionally
  let pairsLinked = 0
  for (const [aId, bId] of pairs) {
    const [resA, resB] = await Promise.all([
      supabase.from('transactions').update({ linked_transfer_id: bId }).eq('id', aId),
      supabase.from('transactions').update({ linked_transfer_id: aId }).eq('id', bId),
    ])

    if (!resA.error && !resB.error) pairsLinked++
  }

  return pairsLinked
}
