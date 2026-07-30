import { describe, it, expect } from 'vitest'
import {
  buildCreateBudgetDiff,
  computeBudgetPlanDiff,
  detailFieldsFromBudget,
  NEW_BUDGET_DETAIL_DEFAULTS,
  type CreateBudgetInput,
  type DraftBudget,
} from '@/lib/budget-plan-diff'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

function makeBudget(o: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    user_id: 'u1',
    parent_id: null,
    name: 'Wonen',
    slug: 'wonen',
    icon: 'Home',
    description: null,
    default_limit: 1200,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: true,
    priority_score: 3,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
    ...o,
  }
}

function draft(b: Budget, amount: number | null = null): DraftBudget {
  return {
    id: b.id,
    parentId: b.parent_id,
    name: b.name,
    slug: b.slug,
    icon: b.icon,
    description: b.description,
    budgetType: b.budget_type,
    defaultLimit: Number(b.default_limit),
    isEssential: b.is_essential,
    sortOrder: b.sort_order,
    interval: b.interval,
    rolloverType: b.rollover_type,
    amount,
    ...detailFieldsFromBudget(b),
  }
}

function tree(b: Budget): BudgetWithChildren {
  return { ...b, children: [] }
}

const EFF = '2026-06-01'

describe('computeBudgetPlanDiff — detail-velden & herordening', () => {
  it('een ongewijzigde draft levert geen update op', () => {
    const b = makeBudget()
    const diff = computeBudgetPlanDiff([tree(b)], [draft(b)], [], EFF)
    expect(diff.to_update).toHaveLength(0)
    expect(diff.to_insert).toHaveLength(0)
    expect(diff.to_delete).toHaveLength(0)
  })

  it('detecteert een icoon-wijziging als update', () => {
    const b = makeBudget({ icon: 'Home' })
    const d = { ...draft(b), icon: 'Car' }
    const diff = computeBudgetPlanDiff([tree(b)], [d], [], EFF)
    expect(diff.to_update).toHaveLength(1)
    expect(diff.to_update[0].icon).toBe('Car')
  })

  it('detecteert sort_order-herordening op beide rijen', () => {
    const a = makeBudget({ id: 'a', sort_order: 0 })
    const c = makeBudget({ id: 'c', sort_order: 1 })
    // Swap: a krijgt 1, c krijgt 0 (zoals na een sleepactie).
    const da = { ...draft(a), sortOrder: 1 }
    const dc = { ...draft(c), sortOrder: 0 }
    const diff = computeBudgetPlanDiff([tree(a), tree(c)], [da, dc], [], EFF)
    expect(diff.to_update).toHaveLength(2)
    expect(diff.to_update.find((u) => u.id === 'a')!.sort_order).toBe(1)
    expect(diff.to_update.find((u) => u.id === 'c')!.sort_order).toBe(0)
  })

  it('detecteert detailveld-wijzigingen (prioriteit, doel, limiet)', () => {
    const b = makeBudget({ parent_id: 'p', priority_score: 3, limit_type: 'soft', alert_threshold: 80 })
    const d = {
      ...draft(b),
      priorityScore: 5,
      limitType: 'hard' as const,
      alertThreshold: 90,
      goalType: 'spaardoel',
      goalAmount: 5000,
      goalDate: '2027-01-01',
    }
    const diff = computeBudgetPlanDiff([tree(b)], [d], [], EFF)
    expect(diff.to_update).toHaveLength(1)
    const u = diff.to_update[0]
    expect(u.priority_score).toBe(5)
    expect(u.limit_type).toBe('hard')
    expect(u.alert_threshold).toBe(90)
    expect(u.goal_type).toBe('spaardoel')
    expect(u.goal_amount).toBe(5000)
    expect(u.goal_date).toBe('2027-01-01')
  })

  it('een doel wissen schrijft goal_type=null naar de update', () => {
    const b = makeBudget({ goal_type: 'spaardoel', goal_amount: 5000 })
    const d = { ...draft(b), goalType: null, goalAmount: null }
    const diff = computeBudgetPlanDiff([tree(b)], [d], [], EFF)
    expect(diff.to_update).toHaveLength(1)
    expect(diff.to_update[0].goal_type).toBeNull()
    expect(diff.to_update[0].goal_amount).toBeNull()
  })

  it('een nieuw budget draagt de detail-defaults mee in de insert', () => {
    const d: DraftBudget = {
      id: 'tmp-1', parentId: null, name: 'Nieuw', slug: null, icon: 'Circle',
      description: null, budgetType: 'expense', defaultLimit: 100, isEssential: false,
      sortOrder: 0, interval: 'monthly', rolloverType: 'reset', amount: 100,
      ...NEW_BUDGET_DETAIL_DEFAULTS,
    }
    const diff = computeBudgetPlanDiff([], [d], [], EFF)
    expect(diff.to_insert).toHaveLength(1)
    const ins = diff.to_insert[0]
    expect(ins.priority_score).toBe(3)
    expect(ins.limit_type).toBe('soft')
    expect(ins.alert_threshold).toBe(80)
    expect(ins.is_inflation_indexed).toBe(false)
    expect(ins.goal_type).toBeNull()
  })
})

describe('buildCreateBudgetDiff — één budget aanmaken', () => {
  function input(o: Partial<CreateBudgetInput> = {}): CreateBudgetInput {
    return {
      clientId: 'tmp-nieuw',
      name: 'Boodschappen',
      parentId: null,
      budgetType: 'expense',
      sortOrder: 4,
      monthlyAmount: 350,
      effectiveFrom: EFF,
      ...o,
    }
  }

  it('hoofdbudget: precies één insert, geen updates/deletes, één amount-rij', () => {
    const diff = buildCreateBudgetDiff(input())

    expect(diff.to_insert).toHaveLength(1)
    expect(diff.to_update).toHaveLength(0)
    expect(diff.to_delete).toHaveLength(0)

    const ins = diff.to_insert[0]
    expect(ins.client_id).toBe('tmp-nieuw')
    expect(ins.parent_id).toBeNull()
    expect(ins.parent_client_id).toBeNull()
    expect(ins.name).toBe('Boodschappen')
    expect(ins.slug).toBeNull()
    expect(ins.icon).toBe('Circle')
    expect(ins.description).toBeNull()
    expect(ins.default_limit).toBe(350)
    expect(ins.sort_order).toBe(4)
    expect(ins.interval).toBe('monthly')
    expect(ins.rollover_type).toBe('reset')
    // Detail-defaults reizen mee, gelijk aan de COALESCE-defaults van de RPC.
    expect(ins.priority_score).toBe(NEW_BUDGET_DETAIL_DEFAULTS.priorityScore)
    expect(ins.limit_type).toBe(NEW_BUDGET_DETAIL_DEFAULTS.limitType)
    expect(ins.alert_threshold).toBe(NEW_BUDGET_DETAIL_DEFAULTS.alertThreshold)
    expect(ins.is_inflation_indexed).toBe(NEW_BUDGET_DETAIL_DEFAULTS.isInflationIndexed)
    expect(ins.goal_type).toBeNull()
    expect(ins.goal_amount).toBeNull()
    expect(ins.goal_date).toBeNull()
    expect(ins.goal_frequency).toBeNull()

    expect(diff.amounts).toEqual([
      { budget_id: 'tmp-nieuw', effective_from: EFF, amount: 350 },
    ])
  })

  it('een eigen icoon overschrijft de Circle-default', () => {
    expect(buildCreateBudgetDiff(input({ icon: 'Car' })).to_insert[0].icon).toBe('Car')
  })

  it('subbudget: parent_id is het bestaande UUID en is_essential blijft false', () => {
    const diff = buildCreateBudgetDiff(
      input({ parentId: '11111111-2222-3333-4444-555555555555', budgetType: 'savings' }),
    )
    const ins = diff.to_insert[0]
    expect(ins.parent_id).toBe('11111111-2222-3333-4444-555555555555')
    expect(ins.parent_client_id).toBeNull()
    expect(ins.budget_type).toBe('savings')
    // Essentieel geldt alleen voor hoofdbudgetten — een kind erft dat niet.
    expect(ins.is_essential).toBe(false)
  })

  it('hoofdbudget van type income/savings/debt is essentieel, expense niet', () => {
    const essential = (budgetType: CreateBudgetInput['budgetType']) =>
      buildCreateBudgetDiff(input({ budgetType })).to_insert[0].is_essential
    expect(essential('income')).toBe(true)
    expect(essential('savings')).toBe(true)
    expect(essential('debt')).toBe(true)
    expect(essential('expense')).toBe(false)
  })

  it('to_delete blijft leeg, ongeacht de invoer (nooit afgeleid uit een boom)', () => {
    const varianten: CreateBudgetInput[] = [
      input(),
      input({ parentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
      input({ budgetType: 'income', monthlyAmount: 4200, sortOrder: 0 }),
      input({ clientId: 'tmp-2', icon: 'PiggyBank', budgetType: 'debt' }),
    ]
    for (const v of varianten) {
      expect(buildCreateBudgetDiff(v).to_delete).toEqual([])
    }
  })

  it('weigert onzin-invoer met een duidelijke melding', () => {
    expect(() => buildCreateBudgetDiff(input({ name: '   ' }))).toThrow(/leeg/i)
    expect(() => buildCreateBudgetDiff(input({ monthlyAmount: 0 }))).toThrow(/groter dan nul/i)
    expect(() => buildCreateBudgetDiff(input({ monthlyAmount: -50 }))).toThrow(/groter dan nul/i)
    expect(() => buildCreateBudgetDiff(input({ monthlyAmount: Number.NaN }))).toThrow(/groter dan nul/i)
    expect(() => buildCreateBudgetDiff(input({ budgetType: 'archive' }))).toThrow(/archief/i)
    expect(() => buildCreateBudgetDiff(input({ clientId: 'b1' }))).toThrow(/tmp/i)
  })
})
