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
// DE SOM ZELF IS NIET VAN DIT BESTAND (convergentie 30 aug 2026). Waar hier
// eerder een eigen optelling stond — `Math.abs()` per rij, transfers eruit,
// ouder = kinderen PLUS eigen boekingen — draait de samenvatting nu op de
// canonieke bron `lib/budget-spending.ts`:
//
//   • `buildBudgetSpendingMap(transactions, splits, budgetTypes)` — getekend per
//     richting: op een uitgaven-budget (expense/debt) gaat een inkomst ERAF, op
//     een inkomsten-budget (income/savings) IS de positieve rij de realisatie,
//     op archive telt alles absoluut. Transfers tellen niet op de uitgavenkant.
//   • `spentForBudget` — de parent-rollup is ÓF/ÓF: een ouder mét kinderen is de
//     som van zijn kinderen, een ouder zonder kinderen zijn eigen boekingen.
//     Kinderen PLUS eigen boekingen (de oude regel hier) telde een rechtstreeks
//     op de ouder geboekte rij dubbel zodra er ook kinderen waren.
//
// Het maandvenster blijft van dit bestand: `localMonthBounds`, einde EXCLUSIEF
// (dus `.lt()` — met `.lte()` op de laatste dag lekt de vorige maand mee).
//
// Puur waar het kan: `summarizeBudgets` rekent zonder database en is dus zonder
// Supabase te testen. `loadBudgetSummary` doet alleen de queries.

import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds } from '@/lib/month-range'
import {
  buildBudgetSpendingMap,
  spentForBudget,
  budgetBarPct,
  type SpendingSplitRow,
} from '@/lib/budget-spending'
import {
  BUDGET_OR_SPLIT_FILTER,
  buildAiBudgetTypeMap,
  loadSplitRows,
} from './budget-spending-source'

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
  /** Nodig om de split-regels aan hun ouder te koppelen. */
  id?: string
  budget_id: string | null
  amount: number | string
  /**
   * De vlag doet mee als extra marker naast het teken; het TEKEN blijft de
   * harde toets (de kolom is BOOLEAN DEFAULT false zonder CHECK). Zie
   * `spendingContribution` in lib/budget-spending.ts.
   */
  is_income?: boolean | null
  transaction_type?: string | null
  /** True = de bedragen leven op `transaction_splits`, niet op deze rij. */
  is_split?: boolean | null
}

/** Split-regel; `amount` staat POSITIEF in de database. */
export type BudgetSplitRow = SpendingSplitRow

export interface BudgetSummaryChild {
  id: string
  name: string
  /** Maandlimiet in EUR (0 = geen limiet ingesteld). */
  limit: number
  /**
   * Deze maand besteed in EUR. KAN NEGATIEF ZIJN: op een uitgaven-budget met
   * meer inkomsten dan uitgaven kwam er netto geld binnen. Dat bedrag wordt
   * bewust niet op 0 geklemd — de eigenaar wil het zien.
   */
  spent: number
  /**
   * Besteed t.o.v. limiet in procenten; 0 wanneer er geen limiet is.
   * Onderaan geklemd op 0 (een negatieve besteding is geen −410% budget),
   * bovenaan bewust NIET (anders verdwijnt elke overschrijdingssignalering).
   */
  pct: number
  /** 'OK' | 'BIJNA' (≥80%) | 'OVER' (≥100%) — alleen zinvol bij een limiet. */
  status: 'OK' | 'BIJNA' | 'OVER'
}

export interface BudgetSummaryParent {
  id: string
  name: string
  /** 'expense' | 'savings' | 'debt' | 'income' | 'archive'. */
  type: string
  limit: number
  /** Kinderen ÓF (bij een ouder zonder kinderen) zijn eigen boekingen. */
  spent: number
  children: BudgetSummaryChild[]
}

export interface BudgetSummary {
  /** False wanneer er (nog) geen budgetten zijn ingesteld. */
  hasBudgets: boolean
  parents: BudgetSummaryParent[]
}

export const EMPTY_BUDGET_SUMMARY: BudgetSummary = { hasBudgets: false, parents: [] }

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
  // VERPLICHT, zonder default — spiegel van `buildBudgetSpendingMap` en
  // `buildSpendingSums`. Met `= []` compileert een achtergebleven
  // tweeargument-aanroep gewoon door, en sinds de queries óók split-ouders
  // meenemen (BUDGET_OR_SPLIT_FILTER) betekent dat: ouderrij overgeslagen,
  // split-regels nooit opgeteld — het bedrag verdwijnt stil. Geen splits
  // opgehaald? Geef expliciet `[]`.
  splits: BudgetSplitRow[],
): BudgetSummary {
  if (budgets.length === 0) return EMPTY_BUDGET_SUMMARY

  // Richting per budget (child erft parent) + de canonieke, getekende som.
  const budgetTypes = buildAiBudgetTypeMap(budgets)
  const spendingByBudget = buildBudgetSpendingMap(transactions, splits, budgetTypes)

  const parentRows = budgets.filter((b) => !b.parent_id)
  const childRows = budgets.filter((b) => b.parent_id)

  const parents: BudgetSummaryParent[] = parentRows.map((parent) => {
    const childIds = childRows.filter((c) => c.parent_id === parent.id).map((c) => c.id)

    const children: BudgetSummaryChild[] = childRows
      .filter((c) => c.parent_id === parent.id)
      .map((child) => {
        const spent = spentForBudget(child.id, [], spendingByBudget)
        const limit = limitOf(child)
        // budgetBarPct: onderaan geklemd op 0, bovenaan niet — zie de doc-comment
        // op `pct` en de rekenregel in lib/budget-spending.ts.
        const pct = limit > 0 ? Math.round(budgetBarPct(spent, limit)) : 0
        return { id: child.id, name: child.name, limit, spent, pct, status: statusFor(pct) }
      })

    // Canonieke rollup, ÓF/ÓF: kinderen wanneer die er zijn, anders de eigen
    // boekingen. Zie `spentForBudget` in lib/budget-spending.ts.
    const spent = spentForBudget(parent.id, childIds, spendingByBudget)

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
        .select('id, budget_id, amount, is_income, transaction_type, is_split')
        .gte('date', start)
        .lt('date', end)
        // Verbreed t.o.v. `.not('budget_id','is',null)`: een split-OUDER heeft
        // per definitie `budget_id = NULL` (transaction-form regel 380), en viel
        // dus volledig buiten het beeld van de AI terwijl het scherm z'n
        // split-regels wél meetelt.
        .or(BUDGET_OR_SPLIT_FILTER),
    ])

    // Zacht falen mag, stil falen niet: zonder deze regel ziet een kapotte
    // filter/kolom eruit als "deze gebruiker heeft geen budgetten" — en dat is
    // precies het soort verschil dat maanden onopgemerkt blijft.
    if (transactionsResult.error) {
      console.warn('[ai-context] budget-summary: transacties niet geladen', transactionsResult.error.message)
    }

    const transactions = (transactionsResult.data ?? []) as BudgetTransactionRow[]
    const splits = await loadSplitRows(supabase, transactions)

    return summarizeBudgets(
      (budgetsResult.data ?? []) as BudgetRow[],
      transactions,
      splits,
    )
  } catch {
    return EMPTY_BUDGET_SUMMARY
  }
}
