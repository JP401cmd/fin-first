import { describe, it, expect } from 'vitest'
import {
  buildSliderEvent,
  readSliderValueFromEvents,
  savingsBaselineIncome,
  savingsPpForMonthlyAmount,
  savingsEuroForPp,
  computeSliderUiRange,
} from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

const baseline: WhatIfOverrides = {
  monthlyIncome: 4000,
  workDaysPerWeek: 4,
  savingsRate: 20,
  expectedReturn: 6,
  extraContribution: 0,
}

describe('spaarquote in euro — één som voor event, weergave en antwoorden (spec §2)', () => {
  it('savingsBaselineIncome = maandinkomen × werkdagen/5 (de bestaande som van buildSliderEvent)', () => {
    expect(savingsBaselineIncome(baseline)).toBe(3200)
  })

  it('savingsEuroForPp geeft de euro-delta t.o.v. nu; op de basis is dat 0', () => {
    expect(savingsEuroForPp(baseline, 20)).toBe(0)
    expect(savingsEuroForPp(baseline, 25)).toBe(160)
    expect(savingsEuroForPp(baseline, 15)).toBe(-160)
  })

  it('savingsPpForMonthlyAmount is de inverse: €160 minder uitgeven = 25 pp', () => {
    expect(savingsPpForMonthlyAmount(baseline, 160)).toBeCloseTo(25, 9)
    expect(savingsPpForMonthlyAmount({ ...baseline, monthlyIncome: 0 }, 160)).toBeNull()
  })

  it('round-trip: het event dat buildSliderEvent bouwt voor die pp draagt exact −€160 monthly_cost_change', () => {
    const ev = buildSliderEvent('savings', 25, baseline, 40)
    expect(ev?.monthly_cost_change).toBe(-160)
    expect(readSliderValueFromEvents('savings', ev ? [ev] : [], baseline)).toBeCloseTo(25, 9)
  })

  it('computeSliderUiRange woont in lib (importeerbaar zonder component)', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 0)).toEqual({ min: 0, max: 1500 })
    expect(computeSliderUiRange('savings', 50, 50)).toEqual({ min: 40, max: 60 })
  })
})
