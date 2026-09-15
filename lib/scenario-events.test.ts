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

describe('event-namen dragen één teken (eindreview M1)', () => {
  it('Meer salaris (+€500) / Minder salaris (−€500) — geen "++" en geen "€-"', () => {
    expect(buildSliderEvent('extra_inleg', 500, baseline, 40)?.name).toBe('Meer salaris (+€500)')
    expect(buildSliderEvent('extra_inleg', -500.4, baseline, 40)?.name).toBe('Minder salaris (−€500)')
  })

  it('Inkomenswijziging (+€250) / (−€250)', () => {
    expect(buildSliderEvent('income', 4250, baseline, 40)?.name).toBe('Inkomenswijziging (+€250)')
    expect(buildSliderEvent('income', 3750, baseline, 40)?.name).toBe('Inkomenswijziging (−€250)')
  })
})

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
    expect(computeSliderUiRange('extra_inleg', 7600, 0)).toEqual({ min: -2300, max: 2300 })
    expect(computeSliderUiRange('savings', 50, 50)).toEqual({ min: 35, max: 65 })
  })
})
