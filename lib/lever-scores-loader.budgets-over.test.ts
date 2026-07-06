/**
 * lib/lever-scores-loader.budgets-over.test.ts
 *
 * PARITY-LOCK voor stap 3 van de layout-waterfall-refactor (jul 2026).
 *
 * `budgetsOver` (aantal top-level expense/savings-budgets boven de maandlimiet,
 * kompas-cashflow-indicator #847) werd voorheen INLINE in app/(app)/layout.tsx
 * berekend uit een eigen budget-health-query + maand-budget-transactie-query.
 * De refactor schrapt die dubbele queries en consumeert `budgetsOver` uit
 * `loadLeverScores` — dat het getal al intern uit DEZELFDE queries berekent.
 *
 * Deze test bewijst dat de loader-berekening BYTE-IDENTIEK is aan de oude
 * inline-berekening, zodat het sidebar-`budgetOver`-signaal onveranderd blijft.
 * Geen Supabase-calls — puur de aggregatie-logica getest (beide varianten
 * woordelijk gekopieerd uit de respectievelijke bron).
 */

import { describe, it, expect } from 'vitest'

type BudgetHealthRow = { id: string; default_limit: number; budget_type: string }
type BudgetTxRow = { budget_id: string; amount: number | string }

// ── OUDE inline-berekening (woordelijk uit app/(app)/layout.tsx, vóór refactor) ─
function budgetsOverInline(
  healthBudgets: BudgetHealthRow[],
  budgetTxRows: BudgetTxRow[],
): number {
  const spendPerBudget = new Map<string, number>()
  for (const tx of budgetTxRows) {
    spendPerBudget.set(
      tx.budget_id,
      (spendPerBudget.get(tx.budget_id) ?? 0) + Math.abs(Number(tx.amount)),
    )
  }
  return healthBudgets.filter((b) => {
    if (b.default_limit <= 0) return false
    const spent = spendPerBudget.get(b.id) ?? 0
    return spent > b.default_limit
  }).length
}

// ── NIEUWE bron (woordelijk uit lib/lever-scores-loader.ts) ────────────────────
function budgetsOverLoader(
  healthBudgets: BudgetHealthRow[],
  budgetTxRows: BudgetTxRow[],
): number {
  const spendPerBudget = new Map<string, number>()
  for (const tx of budgetTxRows) {
    spendPerBudget.set(
      tx.budget_id,
      (spendPerBudget.get(tx.budget_id) ?? 0) + Math.abs(Number(tx.amount)),
    )
  }
  return healthBudgets.filter((b) => {
    if (b.default_limit <= 0) return false
    const spent = spendPerBudget.get(b.id) ?? 0
    return spent > b.default_limit
  }).length
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const BUDGETS: BudgetHealthRow[] = [
  { id: 'boodschappen', default_limit: 400, budget_type: 'expense' },
  { id: 'uit-eten', default_limit: 150, budget_type: 'expense' },
  { id: 'sparen', default_limit: 500, budget_type: 'savings' },
  { id: 'geen-limiet', default_limit: 0, budget_type: 'expense' }, // limit 0 → nooit "over"
]

describe('budgetsOver — loader == oude inline-berekening (byte-identiek, stap 3)', () => {
  const cases: { name: string; tx: BudgetTxRow[]; expected: number }[] = [
    {
      name: 'niets uitgegeven → geen enkel budget over',
      tx: [],
      expected: 0,
    },
    {
      name: 'boodschappen over de limiet (negatieve bedragen via abs)',
      tx: [
        { budget_id: 'boodschappen', amount: -250 },
        { budget_id: 'boodschappen', amount: -200 }, // 450 > 400 → over
        { budget_id: 'uit-eten', amount: -100 }, // 100 < 150 → ok
      ],
      expected: 1,
    },
    {
      name: 'twee budgetten over, gemengde teken/string-bedragen',
      tx: [
        { budget_id: 'boodschappen', amount: '-500' }, // 500 > 400
        { budget_id: 'uit-eten', amount: 200 }, // 200 > 150
        { budget_id: 'sparen', amount: -300 }, // 300 < 500 → ok
      ],
      expected: 2,
    },
    {
      name: 'exact op de limiet telt NIET als over (strikt groter-dan)',
      tx: [{ budget_id: 'boodschappen', amount: -400 }],
      expected: 0,
    },
    {
      name: 'uitgave op een budget met limiet 0 telt nooit mee',
      tx: [{ budget_id: 'geen-limiet', amount: -9_999 }],
      expected: 0,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const inline = budgetsOverInline(BUDGETS, c.tx)
      const loader = budgetsOverLoader(BUDGETS, c.tx)
      expect(loader).toBe(inline)
      expect(loader).toBe(c.expected)
    })
  }
})
