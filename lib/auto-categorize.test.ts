import { describe, it, expect } from 'vitest'
import { computeAutoCategorization, computeOwnAccountDetection, type AutoCatContext, type AutoCatTx } from './auto-categorize'
import { BUDGET_SLUGS } from '@/lib/budget-data'
import type { Budget } from '@/lib/budget-data'
import type { CategoryCorrection, FrequencyMatch } from '@/lib/parsers/categorize'

function mockBudget(id: string, name: string, slug: string): Budget {
  return {
    id, name, slug, type: 'expense', parent_id: null, sort_order: 0,
    default_limit: '0', icon: null, color: null, is_income: false,
  } as unknown as Budget
}

const FOOD = mockBudget('food', 'Boodschappen', BUDGET_SLUGS.BOODSCHAPPEN)

function baseContext(overrides: Partial<AutoCatContext> = {}): AutoCatContext {
  return {
    budgets: [FOOD],
    corrections: [],
    freqMap: new Map<string, FrequencyMatch>(),
    ownIbans: new Set(['NL00OWN0000000000']),
    ownNamePatterns: ['mijn spaarpot'],
    eigenRekeningBudgetId: 'eigen',
    ...overrides,
  }
}

const TXS: AutoCatTx[] = [
  { id: 't1', description: 'Albert Heijn 123', counterparty_name: 'Albert Heijn', counterparty_iban: null, amount: -20 },
  { id: 't2', description: 'Overboeking', counterparty_name: null, counterparty_iban: 'NL00 OWN 0000000000', amount: -100 },
  { id: 't3', description: 'Naar pot', counterparty_name: 'Mijn Spaarpot', counterparty_iban: null, amount: -50 },
  { id: 't4', description: 'Qwerty 99999', counterparty_name: 'Qwerty BV', counterparty_iban: null, amount: -10 },
]

describe('computeAutoCategorization', () => {
  it('deelt in op trefwoordregel, eigen-rekening (IBAN + naam) en laat de rest over', () => {
    const r = computeAutoCategorization(TXS, baseContext())
    expect(r.ruleCount).toBe(1)
    expect(r.transferCount).toBe(2)
    expect(r.unmatchedCount).toBe(1)
    expect(r.assignments).toHaveLength(3)

    const a1 = r.assignments.find((a) => a.id === 't1')!
    expect(a1.budget_id).toBe('food')
    expect(a1.category_source).toBe('rule')
    expect(a1.isTransfer).toBe(false)

    const a2 = r.assignments.find((a) => a.id === 't2')!
    expect(a2.budget_id).toBe('eigen')
    expect(a2.category_source).toBe('transfer')
    expect(a2.isTransfer).toBe(true)

    const a3 = r.assignments.find((a) => a.id === 't3')!
    expect(a3.isTransfer).toBe(true)
    expect(a3.budget_id).toBe('eigen')
  })

  it('gebruikt een correctieregel (eerdere toewijzing) → category_source manual', () => {
    const corrections: CategoryCorrection[] = [
      { match_field: 'counterparty_name', match_value: 'Qwerty BV', budget_id: 'food' },
    ]
    const r = computeAutoCategorization(TXS, baseContext({ corrections }))
    const a4 = r.assignments.find((a) => a.id === 't4')!
    expect(a4.budget_id).toBe('food')
    expect(a4.category_source).toBe('manual')
    expect(r.unmatchedCount).toBe(0)
  })

  it('zonder eigen-rekening-budget vallen transfers terug op onmatched', () => {
    const r = computeAutoCategorization(TXS, baseContext({ eigenRekeningBudgetId: null }))
    expect(r.transferCount).toBe(0)
    // t2 en t3 (transfers) konden nergens heen, t4 matcht niet → 3 onmatched
    expect(r.unmatchedCount).toBe(3)
    expect(r.ruleCount).toBe(1)
  })
})

describe('computeOwnAccountDetection', () => {
  it('markeert alleen eigen-rekening-overboekingen (IBAN + naam-patroon)', () => {
    const r = computeOwnAccountDetection(TXS, baseContext())
    expect(r.transferCount).toBe(2)
    expect(r.unmatchedCount).toBe(2)
    expect(r.assignments.map((a) => a.id).sort()).toEqual(['t2', 't3'])
    expect(r.assignments.every((a) => a.isTransfer && a.budget_id === 'eigen' && a.category_source === 'transfer')).toBe(true)
  })

  it('zonder eigen-rekening-budget levert niets op', () => {
    const r = computeOwnAccountDetection(TXS, baseContext({ eigenRekeningBudgetId: null }))
    expect(r.assignments).toHaveLength(0)
    expect(r.transferCount).toBe(0)
  })
})
