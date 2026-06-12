import { describe, it, expect } from 'vitest'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'

describe('buildBudgetSpendingMap', () => {
  it('somt |amount| per budget_id', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: -10 },
      { budget_id: 'b', amount: -25 },
    ])
    expect(map).toEqual({ a: 50, b: 25 })
  })

  it('sluit inkomsten uit (is_income)', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: 3000, is_income: true }, // salaris op hetzelfde budget
    ])
    expect(map).toEqual({ a: 40 })
  })

  it('sluit transfers uit (transaction_type)', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: 'a', amount: -40 },
      { budget_id: 'a', amount: -500, transaction_type: 'transfer' },
      { budget_id: 'a', amount: -500, transaction_type: 'joint_transfer' },
    ])
    expect(map).toEqual({ a: 40 })
  })

  it('slaat de parent-rij van een split over en telt de split-bedragen', () => {
    const map = buildBudgetSpendingMap(
      [
        { id: 't1', budget_id: 'a', amount: -100, is_split: true }, // parent-rij: overslaan
        { budget_id: 'b', amount: -20 },
      ],
      [
        { budget_id: 'a', amount: -60 },
        { budget_id: 'c', amount: -40 },
      ],
    )
    expect(map).toEqual({ a: 60, b: 20, c: 40 })
  })

  it('negeert transacties zonder budget_id', () => {
    const map = buildBudgetSpendingMap([
      { budget_id: null, amount: -40 },
      { amount: -10 },
      { budget_id: 'a', amount: -5 },
    ])
    expect(map).toEqual({ a: 5 })
  })
})

describe('spentForBudget — parent-rollup', () => {
  const spending = { parent: 5, kid1: 30, kid2: 70, blad: 12 }

  it('parent met kinderen = som van de kinderen (niet zijn eigen directe besteding)', () => {
    expect(spentForBudget('parent', ['kid1', 'kid2'], spending)).toBe(100)
  })

  it('blad-budget = zijn eigen besteding', () => {
    expect(spentForBudget('blad', [], spending)).toBe(12)
  })

  it('ontbrekend budget = 0', () => {
    expect(spentForBudget('x', [], spending)).toBe(0)
  })
})
