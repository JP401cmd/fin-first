import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthBounds } from '@/lib/month-range'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'
import { BUDGET_SPENDING_TX_COLUMNS, fetchSpendingSplits } from '@/lib/budget-spending-fetch'

/**
 * Budget-stand voor de check-in: limiet + besteed per hoofdbudget, deze maand.
 *
 * TWEE FOUTEN OPGERUIMD (convergentie 30 aug 2026), beide dezelfde klasse:
 *
 *  1. **Eigen bestedingssom.** Er stond een ongefilterde `Σ|amount|`-lus: een
 *     inkomst op een uitgaven-budget en een eigen-rekening-transfer telden
 *     allebei als besteding. Vervangen door `buildBudgetSpendingMap`
 *     (lib/budget-spending.ts) met de richting per budget uit
 *     `buildBudgetTypeMap` — dezelfde som als de budgetten-pagina.
 *  2. **Dubbeltellende parent-rollup.** De oude code telde de kindersom BÓVENOP
 *     de eigen som van de parent. Canoniek is `spentForBudget`: óf de kinderen,
 *     óf de eigen directe besteding — nooit allebei.
 *
 * De budgetten worden nu in ÉÉN query opgehaald (parents + children) i.p.v.
 * twee: de type-erfregel heeft de kinderen sowieso nodig, en `archive`-parents
 * moeten in de type-map zitten (anders verliezen hun kinderen hun richting) ook
 * al staan ze niet in het antwoord.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // Alle budgetten (parents + children, álle types), de huidige-maand-transacties
  // met de kolommen van het bestedingscontract, en de budget_amounts-overrides.
  const [budgetsRes, transactionsRes, amountsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, icon, budget_type, default_limit, interval, parent_id')
      .eq('user_id', claims.sub)
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select(BUDGET_SPENDING_TX_COLUMNS)
      .eq('user_id', claims.sub)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('budget_amounts')
      .select('budget_id, effective_from, amount')
      .lte('effective_from', monthStart)
      .order('effective_from', { ascending: false }),
  ])

  const allBudgets = budgetsRes.data || []
  const transactions = transactionsRes.data || []
  const budgetAmounts = amountsRes.data || []

  // De rijen die de check-in toont: hoofdbudgetten, zonder het archief.
  const budgets = allBudgets.filter(
    (b) => b.parent_id === null && b.budget_type !== 'archive',
  )

  // Build map: budget_id → most recent override amount (already sorted desc by effective_from)
  const overrideByBudget: Record<string, number> = {}
  for (const ba of budgetAmounts) {
    if (!(ba.budget_id in overrideByBudget)) {
      overrideByBudget[ba.budget_id] = Number(ba.amount)
    }
  }

  // Canonieke bestedingssom: richting per budget (child erft van parent),
  // inkomsten gaan er op een uitgaven-budget AF, transfers tellen niet mee,
  // split-regels tellen op hun eigen budget met de ouderrij overgeslagen.
  const budgetTypes = buildBudgetTypeMap(
    allBudgets.map((b) => ({
      id: b.id,
      parent_id: b.parent_id ?? null,
      budget_type: (b.budget_type as string | null) ?? 'expense',
    })),
  )
  const splits = await fetchSpendingSplits(supabase, transactions)
  const spending = buildBudgetSpendingMap(transactions, splits, budgetTypes)

  const childIdsByParent = new Map<string, string[]>()
  for (const b of allBudgets) {
    if (!b.parent_id) continue
    const list = childIdsByParent.get(b.parent_id) ?? []
    list.push(b.id)
    childIdsByParent.set(b.parent_id, list)
  }

  const result = budgets.map(b => {
    // Use override if available, otherwise normalize default_limit to monthly
    let limit: number
    if (b.id in overrideByBudget) {
      limit = overrideByBudget[b.id]
    } else {
      limit = b.default_limit || 0
      if (b.interval === 'quarterly') limit = limit / 3
      if (b.interval === 'yearly') limit = limit / 12
    }

    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      limit,
      // Óf de kinderen, óf de eigen besteding — nooit allebei (spentForBudget).
      spent: spentForBudget(b.id, childIdsByParent.get(b.id) ?? [], spending),
      budget_type: b.budget_type,
    }
  })

  return NextResponse.json({ budgets: result })
}
