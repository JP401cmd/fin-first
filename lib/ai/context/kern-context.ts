import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency } from './formatter'
import { loadBudgetSummary, type BudgetSummaryParent } from './budget-summary'

/**
 * Kern-specific context: budgets, spending vs limits, recent patterns.
 *
 * De OPTELLING zelf woont sinds C2b in `budget-summary.ts`, omdat de lokale
 * Fin-chat exact dezelfde cijfers nodig heeft. Deze builder is nu puur de
 * CLOUD-WEERGAVE van die gedeelde samenvatting; de regels (maandvenster,
 * overboekingen eruit, kind-bij-ouder) staan daar één keer.
 */
export async function buildKernContext(supabase: SupabaseClient): Promise<string> {
  const summary = await loadBudgetSummary(supabase)

  if (!summary.hasBudgets) {
    return section('BUDGETTEN DEZE MAAND', 'Nog geen budgetten ingesteld.')
  }

  const budgetLines: string[] = []

  for (const parent of summary.parents) {
    if (parent.type === 'income') continue
    budgetLines.push(`${parent.name}: ${formatCurrency(parent.spent)}/${formatCurrency(parent.limit)}`)
    for (const child of parent.children) {
      budgetLines.push(
        `  ${child.name}: ${formatCurrency(child.spent)}/${formatCurrency(child.limit)} (${child.pct}% ${child.status})`,
      )
    }
  }

  appendTypeBlock(budgetLines, summary.parents, 'savings', (child) =>
    `${child.name}: ${formatCurrency(child.spent)} gereserveerd`,
  )
  appendTypeBlock(budgetLines, summary.parents, 'debt', (child) =>
    `${child.name}: ${formatCurrency(child.spent)} afgelost van ${formatCurrency(child.limit)} doel (${child.pct}%)`,
  )

  return section('BUDGETTEN DEZE MAAND', budgetLines.join('\n'))
}

/** Spaar- of schuldblok: één lege regel, dan één regel per kind. */
function appendTypeBlock(
  lines: string[],
  parents: BudgetSummaryParent[],
  type: 'savings' | 'debt',
  render: (child: BudgetSummaryParent['children'][number]) => string,
): void {
  for (const parent of parents.filter((p) => p.type === type)) {
    const childLines = parent.children.map(render)
    if (childLines.length > 0) {
      lines.push('')
      lines.push(...childLines)
    }
  }
}
