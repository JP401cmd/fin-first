import { describe, it, expect } from 'vitest'
import { suggestTarget } from './suggest'
import type { AutoCatContext } from '@/lib/auto-categorize'
import type { Budget } from '@/lib/budget-data'

function budget(id: string, parent_id: string | null, overrides: Partial<Budget> = {}): Budget {
  return {
    id,
    user_id: 'u1',
    parent_id,
    name: id,
    slug: id,
    icon: 'Circle',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0.8,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 1,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
  }
}

const budgets = [budget('parent-1', null), budget('child-1', 'parent-1')]

function ctx(overrides: Partial<AutoCatContext> = {}): AutoCatContext {
  return {
    budgets,
    corrections: [],
    freqMap: new Map(),
    ownIbans: new Set(),
    ownNamePatterns: [],
    eigenRekeningBudgetId: 'eigen-1',
    ...overrides,
  }
}

const tx = {
  id: 't1',
  description: 'Betaling',
  counterparty_name: 'Albert Heijn',
  counterparty_iban: null,
  amount: -12.5,
}

describe('suggestTarget', () => {
  it('vertaalt een correction-match naar budget + parent (voor de gloed)', () => {
    const result = suggestTarget(tx, ctx({
      corrections: [{ match_field: 'counterparty_name', match_value: 'Albert Heijn', budget_id: 'child-1' }],
    }))
    expect(result).toEqual({ kind: 'budget', budgetId: 'child-1', parentId: 'parent-1' })
  })

  it('budget zonder parent → parentId is het budget zelf', () => {
    const result = suggestTarget(tx, ctx({
      corrections: [{ match_field: 'counterparty_name', match_value: 'Albert Heijn', budget_id: 'parent-1' }],
    }))
    expect(result).toEqual({ kind: 'budget', budgetId: 'parent-1', parentId: 'parent-1' })
  })

  it('eigen-rekening-detectie → transfer-suggestie', () => {
    const result = suggestTarget(
      { ...tx, counterparty_name: 'PayPal Europe' },
      ctx({ ownNamePatterns: ['paypal'] }),
    )
    expect(result).toEqual({ kind: 'transfer' })
  })

  it('geen match → null', () => {
    expect(suggestTarget({ ...tx, counterparty_name: 'Onbekend BV', description: 'xyzzy' }, ctx())).toBeNull()
  })
})
