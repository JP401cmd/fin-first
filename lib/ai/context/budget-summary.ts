// ── Gedeelde budgetgrondslag voor élke AI-context (fase C2b) ─────────────────
//
// De cloud-Fin telde zijn budgetten zélf op, ín `buildKernContext`: budgetten
// ophalen, transacties van deze maand ophalen, overboekingen eruit filteren,
// per budget optellen, kind bij ouder. Prima code — maar één plek, en dus geen
// bron die iemand anders kan lezen.
//
// Toen de lokale Fin dezelfde cijfers nodig had, waren er twee wegen: de logica
// overtypen (en daarmee gegarandeerd uit elkaar groeien) of 'm losmaken. Dit
// bestand is de tweede weg — precies wat C2b vraagt: "één gedeelde
// overview-extractor zodat lokaal en cloud dezelfde cijfergrondslag lezen".
//
// GEEN GEDRAGSWIJZIGING AAN DE CLOUDKANT. De regels hieronder zijn één-op-één
// overgenomen uit `buildKernContext`: het maandvenster via `localMonthBounds`
// (einde exclusief, dus `.lt()` — anders lekt de vorige maand mee), alleen rijen
// mét `budget_id`, `transaction_type` 'transfer'/'joint_transfer' eruit (een
// overboeking naar je eigen rekening is geen uitgave), bedragen absoluut, en het
// bestede bedrag van een ouder = de som van zijn kinderen plus wat er direct op
// de ouder geboekt staat.
//
// Puur waar het kan: `summarizeBudgets` rekent zonder database en is dus zonder
// Supabase te testen. `loadBudgetSummary` doet alleen de twee queries.

import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds } from '@/lib/month-range'

/** Budgetrij zoals beide context-builders 'm opvragen. */
export interface BudgetRow {
  id: string
  parent_id: string | null
  name: string
  default_limit: number | string | null
  budget_type: string
  is_essential?: boolean | null
}

/** Transactierij: alleen wat voor de optelling nodig is. */
export interface BudgetTransactionRow {
  budget_id: string | null
  amount: number | string
  transaction_type?: string | null
}

export interface BudgetSummaryChild {
  id: string
  name: string
  /** Maandlimiet in EUR (0 = geen limiet ingesteld). */
  limit: number
  /** Deze maand besteed in EUR. */
  spent: number
  /** Besteed t.o.v. limiet in procenten; 0 wanneer er geen limiet is. */
  pct: number
  /** 'OK' | 'BIJNA' (≥80%) | 'OVER' (≥100%) — alleen zinvol bij een limiet. */
  status: 'OK' | 'BIJNA' | 'OVER'
}

export interface BudgetSummaryParent {
  id: string
  name: string
  /** 'expense' | 'savings' | 'debt' | 'income'. */
  type: string
  limit: number
  /** Kinderen plus wat direct op de ouder geboekt is. */
  spent: number
  children: BudgetSummaryChild[]
}

export interface BudgetSummary {
  /** False wanneer er (nog) geen budgetten zijn ingesteld. */
  hasBudgets: boolean
  parents: BudgetSummaryParent[]
}

export const EMPTY_BUDGET_SUMMARY: BudgetSummary = { hasBudgets: false, parents: [] }

/** Overboekingen tussen eigen rekeningen zijn geen uitgave. */
function isTransfer(t: BudgetTransactionRow): boolean {
  return t.transaction_type === 'transfer' || t.transaction_type === 'joint_transfer'
}

function limitOf(row: BudgetRow): number {
  const n = Number(row.default_limit)
  return Number.isFinite(n) ? n : 0
}

function statusFor(pct: number): BudgetSummaryChild['status'] {
  if (pct >= 100) return 'OVER'
  if (pct >= 80) return 'BIJNA'
  return 'OK'
}

/**
 * Reken budgetten + transacties om naar de gedeelde samenvatting. Pure functie:
 * geen database, geen tijd, geen I/O — daarom los testbaar.
 */
export function summarizeBudgets(
  budgets: BudgetRow[],
  transactions: BudgetTransactionRow[],
): BudgetSummary {
  if (budgets.length === 0) return EMPTY_BUDGET_SUMMARY

  const spendingByBudget: Record<string, number> = {}
  for (const t of transactions) {
    if (!t.budget_id) continue
    if (isTransfer(t)) continue
    const amount = Math.abs(Number(t.amount))
    if (!Number.isFinite(amount)) continue
    spendingByBudget[t.budget_id] = (spendingByBudget[t.budget_id] ?? 0) + amount
  }

  const parentRows = budgets.filter((b) => !b.parent_id)
  const childRows = budgets.filter((b) => b.parent_id)

  const parents: BudgetSummaryParent[] = parentRows.map((parent) => {
    const children: BudgetSummaryChild[] = childRows
      .filter((c) => c.parent_id === parent.id)
      .map((child) => {
        const spent = spendingByBudget[child.id] ?? 0
        const limit = limitOf(child)
        const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0
        return { id: child.id, name: child.name, limit, spent, pct, status: statusFor(pct) }
      })

    // Ouder-totaal = kinderen + wat er rechtstreeks op de ouder geboekt staat.
    const spent =
      children.reduce((sum, c) => sum + c.spent, 0) + (spendingByBudget[parent.id] ?? 0)

    return { id: parent.id, name: parent.name, type: parent.budget_type, limit: limitOf(parent), spent, children }
  })

  return { hasBudgets: true, parents }
}

/**
 * Haal de budgetten en de transacties van DEZE maand op en vat ze samen.
 *
 * Faalt zacht: een query-fout levert een lege samenvatting op in plaats van een
 * throw — een AI-context hoort nooit een pagina of een chat te slopen omdat één
 * sectie niet geladen kon worden.
 */
export async function loadBudgetSummary(supabase: SupabaseClient): Promise<BudgetSummary> {
  try {
    // Tijdzone-veilig maandvenster; `end` is EXCLUSIEF (de 1e van de volgende
    // maand), dus `.lt()` — met `.lte()` op de laatste dag zou de vorige maand
    // kunnen meelekken.
    const { start, end } = localMonthBounds(new Date())

    const [budgetsResult, transactionsResult] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, parent_id, name, default_limit, budget_type, is_essential')
        .order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('budget_id, amount, is_income, transaction_type')
        .gte('date', start)
        .lt('date', end)
        .not('budget_id', 'is', null),
    ])

    return summarizeBudgets(
      (budgetsResult.data ?? []) as BudgetRow[],
      (transactionsResult.data ?? []) as BudgetTransactionRow[],
    )
  } catch {
    return EMPTY_BUDGET_SUMMARY
  }
}
