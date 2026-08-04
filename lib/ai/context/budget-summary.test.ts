import { describe, it, expect } from 'vitest'
import { summarizeBudgets, type BudgetRow, type BudgetTransactionRow } from './budget-summary'

/**
 * De gedeelde budgetgrondslag (fase C2b). Deze regels stonden eerder alleen in
 * `buildKernContext`; ze zijn hierheen verhuisd omdat de lokale Fin-chat exact
 * dezelfde cijfers nodig heeft. Wat hier wordt vastgelegd is dus niet nieuw
 * gedrag maar de bestaande cloud-grondslag, nu toetsbaar.
 */

const BUDGETS: BudgetRow[] = [
  { id: 'p1', parent_id: null, name: 'Vaste lasten', default_limit: 1950, budget_type: 'expense' },
  { id: 'c1', parent_id: 'p1', name: 'Hypotheek', default_limit: 1000, budget_type: 'expense' },
  { id: 'c2', parent_id: 'p1', name: 'Energie', default_limit: 200, budget_type: 'expense' },
  { id: 'p2', parent_id: null, name: 'Inkomen', default_limit: 4000, budget_type: 'income' },
]

describe('summarizeBudgets', () => {
  it('geen budgetten → hasBudgets false', () => {
    expect(summarizeBudgets([], [])).toEqual({ hasBudgets: false, parents: [] })
  })

  it('telt per kind op en rolt naar de ouder', () => {
    const tx: BudgetTransactionRow[] = [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c2', amount: -150 },
      { budget_id: 'c2', amount: -30 },
    ]
    const { parents } = summarizeBudgets(BUDGETS, tx)
    const vasteLasten = parents.find((p) => p.id === 'p1')!

    expect(vasteLasten.children.map((c) => [c.name, c.spent])).toEqual([
      ['Hypotheek', 1000],
      ['Energie', 180],
    ])
    expect(vasteLasten.spent).toBe(1180)
  })

  // Een overboeking naar je eigen spaarrekening is geen uitgave. Zonder deze
  // uitsluiting telt elke interne verschuiving mee en klopt het hele beeld niet.
  it('overboekingen tellen niet als uitgave', () => {
    const tx: BudgetTransactionRow[] = [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c1', amount: -500, transaction_type: 'transfer' },
      { budget_id: 'c1', amount: -500, transaction_type: 'joint_transfer' },
    ]
    const { parents } = summarizeBudgets(BUDGETS, tx)
    expect(parents.find((p) => p.id === 'p1')!.children[0].spent).toBe(1000)
  })

  it('bedragen tellen absoluut — teken van de boeking doet er niet toe', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -600 },
      { budget_id: 'c1', amount: 400 },
    ])
    expect(parents.find((p) => p.id === 'p1')!.children[0].spent).toBe(1000)
  })

  it('telt ook wat rechtstreeks op de ouder geboekt staat', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'p1', amount: -75 },
    ])
    expect(parents.find((p) => p.id === 'p1')!.spent).toBe(1075)
  })

  it('geeft per kind een percentage en een status', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c2', amount: -170 },
    ])
    const kinderen = parents.find((p) => p.id === 'p1')!.children
    expect(kinderen[0]).toMatchObject({ pct: 100, status: 'OVER' })
    expect(kinderen[1]).toMatchObject({ pct: 85, status: 'BIJNA' })
  })

  it('zonder limiet geen percentage en geen valse OVER-status', () => {
    const zonderLimiet: BudgetRow[] = [
      { id: 'p1', parent_id: null, name: 'Los', default_limit: null, budget_type: 'expense' },
      { id: 'c1', parent_id: 'p1', name: 'Kind', default_limit: 0, budget_type: 'expense' },
    ]
    const { parents } = summarizeBudgets(zonderLimiet, [{ budget_id: 'c1', amount: -500 }])
    expect(parents[0].children[0]).toMatchObject({ limit: 0, pct: 0, status: 'OK' })
  })

  it('rijen zonder budget_id worden genegeerd', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: null, amount: -900 },
      { budget_id: 'c1', amount: -100 },
    ])
    expect(parents.find((p) => p.id === 'p1')!.spent).toBe(100)
  })

  // De inkomstencategorie blijft in de samenvatting staan; wie 'm niet wil
  // tonen filtert bij het RENDEREN (zoals kern-context en de lokale prompt doen).
  // Zo hoeft de extractor niet te weten hoe elke consument hem gebruikt.
  it('houdt de inkomsten-ouder in de samenvatting', () => {
    const { parents } = summarizeBudgets(BUDGETS, [])
    expect(parents.map((p) => p.type)).toContain('income')
  })
})
