// lib/recurring-account.ts
// Welke rekening draagt een bevestigde terugkerende regel?
//
// `recurring_transactions.account_id` is NOT NULL, dus er moet er één gekozen
// worden. Die keuze was "de eerste rekening die de query teruggeeft" — willekeurig
// (geen ordering), inclusief uitgezette en archiefrekeningen, en zonder
// eigenaarsfilter terwijl de SELECT-policy op `bank_accounts` huishoud-gedeeld is.
// Gevolg: bevestigde abonnementen landden op een rekening waar hun betalingen niet
// staan (of zelfs op die van de partner). Deze functie is pure keuzelogica; de
// aanroeper levert alleen eigen rijen aan.

export interface RecurringAccountCandidate {
  id: string
  is_active?: boolean | null
  is_archive_bucket?: boolean | null
  sort_order?: number | null
}

/** Uitgezette en archiefrekeningen dragen geen nieuwe regels meer. */
function isEligible(a: RecurringAccountCandidate): boolean {
  return a.is_active !== false && a.is_archive_bucket !== true
}

/** Laagste sort_order eerst; ontbrekende sort_order achteraan; id als tiebreak. */
function byOrder(a: RecurringAccountCandidate, b: RecurringAccountCandidate): number {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
  if (ao !== bo) return ao - bo
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * De rekening waar de betalingen van deze tegenpartij ook echt staan wint; anders
 * de eerste actieve eigen rekening in vaste volgorde. Geen actieve rekening → null,
 * zodat de aanroeper een nette fout kan geven in plaats van een willekeurige keuze.
 */
export function pickRecurringAccountId(params: {
  accounts: readonly RecurringAccountCandidate[]
  accountIdsOfCounterparty: readonly (string | null | undefined)[]
}): string | null {
  const eligible = params.accounts.filter(isEligible).sort(byOrder)
  if (eligible.length === 0) return null

  const allowed = new Map(eligible.map((a) => [a.id, a]))
  const tally = new Map<string, number>()
  for (const id of params.accountIdsOfCounterparty) {
    if (!id || !allowed.has(id)) continue
    tally.set(id, (tally.get(id) ?? 0) + 1)
  }

  let winner: string | null = null
  let best = 0
  // `eligible` is al gesorteerd, dus een gelijkspel valt op de vaste volgorde.
  for (const account of eligible) {
    const n = tally.get(account.id) ?? 0
    if (n > best) {
      best = n
      winner = account.id
    }
  }

  return winner ?? eligible[0].id
}
