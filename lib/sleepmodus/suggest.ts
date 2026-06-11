/**
 * Suggestie-gloed voor de Sleepmodus: bepaalt per transactie het meest
 * waarschijnlijke doel via de bestaande regel/historie-keten (géén AI-call).
 * Dunne pure wrapper om `computeAutoCategorization` + parent-lookup, zodat de
 * overlay weet welke ring-bol (parent) of dropzone moet gloeien.
 */

import { computeAutoCategorization, type AutoCatContext, type AutoCatTx } from '@/lib/auto-categorize'

export type SleepmodusSuggestion =
  /** Eigen-rekening-overboeking — de Eigen rekening-pill gloeit. */
  | { kind: 'transfer' }
  /** Budgetvoorstel — de parent-bol gloeit (en het child zelf in expanded state). */
  | { kind: 'budget'; budgetId: string; parentId: string }

export function suggestTarget(tx: AutoCatTx, ctx: AutoCatContext): SleepmodusSuggestion | null {
  const result = computeAutoCategorization([tx], ctx)
  const assignment = result.assignments[0]
  if (!assignment) return null
  if (assignment.isTransfer) return { kind: 'transfer' }

  const budget = ctx.budgets.find((b) => b.id === assignment.budget_id)
  if (!budget) return null
  return { kind: 'budget', budgetId: budget.id, parentId: budget.parent_id ?? budget.id }
}
