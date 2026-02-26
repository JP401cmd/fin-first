export interface BudgetRow {
  id: string
  name?: string | null
  default_limit: number | string
  interval?: string | null
  budget_type?: string | null
  is_essential?: boolean | null
}

export interface ChildBudgetRow {
  id: string
  parent_id: string | null
  name?: string | null
  default_limit: number | string
  interval?: string | null
  budget_type?: string | null
  is_essential?: boolean | null
}

export interface MustExpenseItem {
  name: string
  monthlyAmount: number
  annualAmount: number
  interval: string
}

const EXCLUDED_BUDGET_TYPES = ['archive', 'income', 'savings']

function annualAmount(limit: number, interval: string | null | undefined): number {
  if (interval === 'monthly') return limit * 12
  if (interval === 'quarterly') return limit * 4
  return limit // yearly / eenmalig
}

/**
 * Berekent de jaarlijkse must-expenses op basis van essential parent budgetten en hun children.
 *
 * Logica:
 * A) Essential parents: als ze essential children hebben, tel alleen die;
 *    anders tel alle children (backwards compat). Gebruik child interval wanneer er exact 1 child is.
 * B) Orphan essential children: essential children van niet-essential parents worden
 *    individueel meegeteld (archive/income/savings uitgesloten).
 */
export function computeYearlyMustExpenses(
  essentialParents: BudgetRow[],
  allChildren: ChildBudgetRow[],
): { yearlyMustExpenses: number; expenseItems: MustExpenseItem[] } {
  const expenseItems: MustExpenseItem[] = []
  let total = 0
  const essentialParentIds = new Set(essentialParents.map(b => b.id))

  // A: Essential parent budgets — gebruik essential children indien aanwezig; anders alle children
  for (const b of essentialParents) {
    const children = allChildren.filter(c => c.parent_id === b.id)
    const essentialChildren = children.filter(c => c.is_essential)
    const relevantChildren = essentialChildren.length > 0 ? essentialChildren : children

    const limit = relevantChildren.length > 0
      ? relevantChildren.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)

    // Gebruik child interval wanneer er exact 1 relevant child is; anders parent interval
    const interval = (relevantChildren.length === 1 ? relevantChildren[0].interval : null) ?? b.interval
    const annual = annualAmount(limit, interval)

    total += annual
    expenseItems.push({
      name: b.name ?? 'Onbekend budget',
      monthlyAmount: annual / 12,
      annualAmount: annual,
      interval: interval ?? 'monthly',
    })
  }

  // B: Essential children van niet-essential parents (orphans)
  const orphans = allChildren.filter(
    c =>
      c.is_essential &&
      !essentialParentIds.has(c.parent_id ?? '') &&
      !EXCLUDED_BUDGET_TYPES.includes(c.budget_type ?? ''),
  )
  for (const child of orphans) {
    const annual = annualAmount(Number(child.default_limit), child.interval)
    total += annual
    expenseItems.push({
      name: child.name ?? 'Onbekend budget',
      monthlyAmount: annual / 12,
      annualAmount: annual,
      interval: child.interval ?? 'monthly',
    })
  }

  return { yearlyMustExpenses: total, expenseItems }
}

export type RetirementExpenseMethod =
  | 'essential_budgets'
  | 'custom_amount'
  | 'current_income'

/**
 * Berekent de jaarlijkse uitgave na retirement op basis van de gekozen methode.
 *
 * - essential_budgets: gebruik yearlyMustExpenses (berekend uit essentiële budgetten)
 * - custom_amount: gebruik het door de gebruiker opgegeven bedrag (in huidige prijzen)
 * - current_income: gebruik het huidige jaarinkomen als uitgavenpatroon
 *
 * Valt terug op yearlyMustExpenses als de gekozen methode geen geldige waarde oplevert.
 */
export function computeRetirementExpenses(
  method: RetirementExpenseMethod | null | undefined,
  yearlyMustExpenses: number,
  yearlyIncome: number,
  customAmount?: number | null,
): number {
  switch (method) {
    case 'custom_amount': {
      const amt = Number(customAmount ?? 0)
      return amt > 0 ? amt : yearlyMustExpenses
    }
    case 'current_income':
      return yearlyIncome > 0 ? yearlyIncome : yearlyMustExpenses
    case 'essential_budgets':
    default:
      return yearlyMustExpenses
  }
}
