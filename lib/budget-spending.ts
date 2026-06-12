// lib/budget-spending.ts
// Gedeelde, pure aggregatie van uitgaven per budget — zodat verschillende
// oppervlakken (budgets-pagina, AI-lookup-tool) NIET elk hun eigen som maken.
//
// Canoniek gedrag (spiegelt lib/budgets-data-loader.ts):
//   - som van |amount| per budget_id over de gegeven transacties;
//   - split-regels tellen op hun eigen budget_id (parent-rij wordt overgeslagen);
//   - transfers tellen niet mee als besteding;
//   - inkomsten tellen niet mee als besteding op een uitgaven-budget.
//   - parent-rollup: een parent met kinderen = som van zijn kinderen, anders
//     zijn eigen directe besteding.
//
// Houdt bewust GEEN rekening met perspectief-weging of effectieve limieten —
// dat blijft loader/pagina-logica. Dit is enkel de spend-aggregatie + rollup.

export type SpendingTxRow = {
  /** Optioneel; alleen relevant voor callers die split-ids afleiden. */
  id?: string
  budget_id?: string | null
  amount: number | string
  is_income?: boolean | null
  transaction_type?: string | null
  is_split?: boolean | null
}

export type SpendingSplitRow = {
  budget_id?: string | null
  amount: number | string
}

/** True als deze transactie als besteding meetelt (geen transfer, geen inkomst). */
function countsAsSpending(t: SpendingTxRow): boolean {
  if (t.is_income === true) return false
  if (t.transaction_type === 'transfer' || t.transaction_type === 'joint_transfer') return false
  return true
}

/**
 * Bouwt de per-budget_id bestedingsmap. Split-transacties leveren hun bedragen
 * via `splits` aan; de parent-rij van een split wordt overgeslagen om dubbeltel
 * te voorkomen (gelijk aan de budgets-loader).
 */
export function buildBudgetSpendingMap(
  transactions: SpendingTxRow[],
  splits: SpendingSplitRow[] = [],
): Record<string, number> {
  const spending: Record<string, number> = {}

  for (const t of transactions) {
    if (t.is_split) continue // bedragen leven op de splits
    if (!t.budget_id) continue
    if (!countsAsSpending(t)) continue
    spending[t.budget_id] = (spending[t.budget_id] ?? 0) + Math.abs(Number(t.amount) || 0)
  }

  for (const s of splits) {
    if (!s.budget_id) continue
    spending[s.budget_id] = (spending[s.budget_id] ?? 0) + Math.abs(Number(s.amount) || 0)
  }

  return spending
}

/**
 * Bestede bedrag voor één budget, met parent-rollup. Een parent (kinderen
 * aanwezig) = som van de kinderen; een blad = zijn eigen directe besteding.
 */
export function spentForBudget(
  budgetId: string,
  childIds: string[],
  spending: Record<string, number>,
): number {
  if (childIds.length > 0) {
    return childIds.reduce((sum, cid) => sum + (spending[cid] ?? 0), 0)
  }
  return spending[budgetId] ?? 0
}
