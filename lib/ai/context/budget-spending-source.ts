// ── Gedeelde bron-plumbing voor de canonieke bestedingssom in AI-context ──────
//
// Sinds de norm van 30 aug 2026 (lib/budget-spending.ts) is "besteed per budget"
// een GETEKENDE som met een RICHTING per budget, plus de split-regels op hun
// eigen budget. Drie dingen zijn daarvoor nodig die de AI-context-builders tot
// nu toe geen van allen ophaalden:
//
//   1. `is_split` op de transactierij (anders wordt de ouderrij dubbelgeteld óf
//      — erger — helemaal gemist, want een split-ouder heeft `budget_id = NULL`
//      en viel dus uit élke `.not('budget_id','is',null)`-query);
//   2. de bijbehorende `transaction_splits`-regels;
//   3. de richting per budget (`buildBudgetTypeMap`), want de aftrek van een
//      inkomst geldt alléén op een uitgaven-budget.
//
// Vier context-builders hadden anders vier keer dezelfde vijf regels gekregen.
// Dit bestand is die vijf regels, één keer.
//
// SAMENVOEGEN MET lib/budget-spending-fetch.ts (openstaand). Die module doet
// hetzelfde voor de loader-/route-kant en heeft dezelfde kolomlijst
// (`BUDGET_SPENDING_TX_COLUMNS` = id, amount, budget_id, transaction_type,
// is_income, is_split — één op één gelijk aan de selects hieronder). Eén
// verschil houdt ze nu uit elkaar: `fetchSpendingSplits` daar levert
// `{budget_id, amount}`, en de 12-maands MAANDGROEPERING in
// budget-insights-context heeft ook `transaction_id` nodig om een split-regel
// in de maandbak van zijn OUDER te leggen. Zodra dat veld daar mee terugkomt,
// vervalt dit bestand: dan importeren de context-builders `fetchSpendingSplits`
// en `BUDGET_SPENDING_TX_COLUMNS` rechtstreeks.

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBudgetTypeMap } from '@/lib/budget-utils'

/**
 * PostgREST-filter: rijen mét budget_id ÓF split-ouders (die hebben er geen).
 * VERHUISD naar lib/budget-spending-fetch.ts (31 aug 2026) zodat de API-routes
 * hem kunnen gebruiken zonder uit de AI-contextlaag te importeren. Hier alleen
 * nog een re-export onder dezelfde naam — één definitie, twee ingangen.
 */
export { BUDGET_OR_SPLIT_FILTER } from '@/lib/budget-spending-fetch'

/** Split-regel zoals de context-builders 'm nodig hebben. */
export interface AiSplitRow {
  /** Nodig om de datum van de OUDER te kunnen overnemen (maandgroepering). */
  transaction_id: string
  budget_id: string | null
  amount: number
}

/** Minimale transactievorm om de split-ids uit af te leiden. */
interface SplitParentRow {
  id?: string | null
  is_split?: boolean | null
}

/**
 * Haal de split-regels op die bij de meegegeven transactierijen horen.
 *
 * Faalt zacht (lege lijst) — een AI-context hoort nooit een chat te slopen
 * omdat één sectie niet geladen kon worden. Zonder split-ouders in de invoer
 * wordt er géén query gedaan.
 */
export async function loadSplitRows(
  supabase: SupabaseClient,
  transactions: SplitParentRow[],
): Promise<AiSplitRow[]> {
  const ids = transactions
    .filter((t) => t.is_split === true && t.id)
    .map((t) => t.id as string)
  if (ids.length === 0) return []

  try {
    const { data } = await supabase
      .from('transaction_splits')
      .select('transaction_id, budget_id, amount')
      .in('transaction_id', ids)
    return (data ?? []) as AiSplitRow[]
  } catch {
    return []
  }
}

/**
 * Richting per budget, inclusief de erfregel child→parent.
 *
 * `budget_type` mag NULL zijn in de database; die valt hier terug op de
 * DB-default `'expense'` — bewust de veilige kant, want inkomsten-semantiek
 * zou een inkomst laten OPTELLEN in plaats van aftrekken.
 */
export function buildAiBudgetTypeMap(
  budgets: { id: string; parent_id?: string | null; budget_type?: string | null }[],
): Map<string, string> {
  return buildBudgetTypeMap(
    budgets.map((b) => ({
      id: b.id,
      parent_id: b.parent_id ?? null,
      budget_type: b.budget_type ?? 'expense',
    })),
  )
}
