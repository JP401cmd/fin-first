import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { runScenarioPresetBatch, type ScenarioPresetContext } from './scenario-presets'
import { solveHaalbareUitgave } from './haalbare-uitgave'

function batchCtx(age: number, stop: number | null): ScenarioPresetContext {
  const fx = buildCompleetHorizonFixture(age)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(age),
    yearly_essential_expenses: 100_000,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    ...(stop == null
      ? { fire_stop_anchor: 'solved' as const }
      : { fire_stop_anchor: 'age' as const, fire_stop_age: stop }),
  }
  return {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: 30_000,
    currentAge: age,
    verwachtFireAge: null,
    fireEndAge: 90,
    hasEigenHuis: true,
    downsizeStrategyActief: false,
  }
}

describe('runScenarioPresetBatch — haalbare uitgave', () => {
  it('draagt hetzelfde getal als de losse solve', () => {
    const ctx = batchCtx(42, 50)
    const batch = runScenarioPresetBatch(ctx)
    expect(batch.haalbareUitgave).not.toBeNull()
    expect(batch.haalbareUitgave).toEqual(solveHaalbareUitgave(ctx))
  })

  it('is null zonder vast stopmoment', () => {
    expect(runScenarioPresetBatch(batchCtx(42, null)).haalbareUitgave).toBeNull()
  })
})
