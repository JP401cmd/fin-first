import { describe, it, expect } from 'vitest'
import {
  budgetCardStatus,
  transactiesCardStatus,
  vasteLastenCardStatus,
  forecastCardStatus,
} from './cashflow-cards'

// ── budgetCardStatus ───────────────────────────────────────────────────────────

describe('budgetCardStatus — neutral when inactive', () => {
  it('budgetingActive false → neutral regardless of score', () => {
    expect(budgetCardStatus({ budgetingActive: false, expenseLimit: 2000, budgetScore: 90 })).toBe('neutral')
  })

  it('expenseLimit <= 0 → neutral even if budgetingActive', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 0, budgetScore: 90 })).toBe('neutral')
  })

  it('expenseLimit negative → neutral', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: -100, budgetScore: 90 })).toBe('neutral')
  })
})

describe('budgetCardStatus — pillarStatus thresholds (active budget)', () => {
  it('budgetScore >= 70 → good', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 80 })).toBe('good')
  })

  it('budgetScore exactly 70 → good', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 70 })).toBe('good')
  })

  it('budgetScore 100 → good', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 100 })).toBe('good')
  })

  it('budgetScore 55 → warn (>= 50, < 70)', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 55 })).toBe('warn')
  })

  it('budgetScore exactly 50 → warn', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 50 })).toBe('warn')
  })

  it('budgetScore 30 → bad (< 50)', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 30 })).toBe('bad')
  })

  it('budgetScore 0 → bad', () => {
    expect(budgetCardStatus({ budgetingActive: true, expenseLimit: 1000, budgetScore: 0 })).toBe('bad')
  })
})

// ── transactiesCardStatus ──────────────────────────────────────────────────────

describe('transactiesCardStatus — neutral when no transactions', () => {
  it('income 0 and expenses 0 → neutral', () => {
    expect(transactiesCardStatus({ monthlyIncome: 0, monthlyExpenses: 0 })).toBe('neutral')
  })

  it('income 0, expenses > 0 → neutral (rate is null)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 0, monthlyExpenses: 500 })).toBe('neutral')
  })
})

describe('transactiesCardStatus — status by savings rate', () => {
  it('income 1000, expenses 700 → net 300 → 30% → good (>= 20%)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 1000, monthlyExpenses: 700 })).toBe('good')
  })

  it('income 1000, expenses 800 → net 200 → 20% → good (exactly 20%)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 1000, monthlyExpenses: 800 })).toBe('good')
  })

  it('income 1000, expenses 950 → net 50 → 5% → warn (>= 0%, < 20%)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 1000, monthlyExpenses: 950 })).toBe('warn')
  })

  it('income 1000, expenses 1000 → net 0 → 0% → warn (= 0%)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 1000, monthlyExpenses: 1000 })).toBe('warn')
  })

  it('income 1000, expenses 1100 → net -100 → -10% → bad (< 0%)', () => {
    expect(transactiesCardStatus({ monthlyIncome: 1000, monthlyExpenses: 1100 })).toBe('bad')
  })

  it('income 5000, expenses 0 → net 5000 → 100% → good', () => {
    expect(transactiesCardStatus({ monthlyIncome: 5000, monthlyExpenses: 0 })).toBe('good')
  })
})

// ── vasteLastenCardStatus ──────────────────────────────────────────────────────

describe('vasteLastenCardStatus — neutral when no data', () => {
  it('count 0 → neutral regardless of income', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 500, count: 0, monthlyIncome: 2000 })).toBe('neutral')
  })

  it('income 0 → neutral even if count > 0 (ratio null)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 500, count: 5, monthlyIncome: 0 })).toBe('neutral')
  })
})

describe('vasteLastenCardStatus — status by income ratio', () => {
  it('income 2000, totalMonthly 800 → ratio 0.40 → good (< 0.5)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 800, count: 3, monthlyIncome: 2000 })).toBe('good')
  })

  it('ratio exactly 0 → good', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 0, count: 1, monthlyIncome: 2000 })).toBe('good')
  })

  it('income 2000, totalMonthly 1300 → ratio 0.65 → warn (>= 0.5, <= 0.7)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 1300, count: 5, monthlyIncome: 2000 })).toBe('warn')
  })

  it('income 2000, totalMonthly 1000 → ratio 0.5 → warn (exactly 0.5)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 1000, count: 4, monthlyIncome: 2000 })).toBe('warn')
  })

  it('income 2000, totalMonthly 1400 → ratio 0.7 → warn (exactly 0.7)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 1400, count: 6, monthlyIncome: 2000 })).toBe('warn')
  })

  it('income 2000, totalMonthly 1500 → ratio 0.75 → bad (> 0.7)', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 1500, count: 7, monthlyIncome: 2000 })).toBe('bad')
  })

  it('income 2000, totalMonthly 2000 → ratio 1.0 → bad', () => {
    expect(vasteLastenCardStatus({ totalMonthly: 2000, count: 8, monthlyIncome: 2000 })).toBe('bad')
  })
})

// ── forecastCardStatus ─────────────────────────────────────────────────────────

describe('forecastCardStatus — neutral when no forecast', () => {
  it('hasForecast false → neutral regardless of netPerMonth', () => {
    expect(forecastCardStatus({ netPerMonth: 500, hasForecast: false })).toBe('neutral')
  })

  it('hasForecast false with negative net → neutral', () => {
    expect(forecastCardStatus({ netPerMonth: -200, hasForecast: false })).toBe('neutral')
  })
})

describe('forecastCardStatus — status by netPerMonth', () => {
  it('netPerMonth > 0 → good', () => {
    expect(forecastCardStatus({ netPerMonth: 100, hasForecast: true })).toBe('good')
  })

  it('netPerMonth large positive → good', () => {
    expect(forecastCardStatus({ netPerMonth: 5000, hasForecast: true })).toBe('good')
  })

  it('netPerMonth < 0 → bad', () => {
    expect(forecastCardStatus({ netPerMonth: -100, hasForecast: true })).toBe('bad')
  })

  it('netPerMonth large negative → bad', () => {
    expect(forecastCardStatus({ netPerMonth: -3000, hasForecast: true })).toBe('bad')
  })

  it('netPerMonth exactly 0 → warn', () => {
    expect(forecastCardStatus({ netPerMonth: 0, hasForecast: true })).toBe('warn')
  })
})
