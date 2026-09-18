import { describe, it, expect } from 'vitest'
import { heeftScenarioOverrides, resolveScenarioContext } from './use-horizon-fire-sim'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

const profile = {
  retirement_expense_method: 'essential_budgets',
  retirement_expense_custom_amount: null,
} as ConvergentieRawProfileRow

describe('heeftScenarioOverrides', () => {
  it('ziet de uitgave-override als actief scenario', () => {
    expect(heeftScenarioOverrides({ extraLifeEvents: [], uitgaveNaPensioenPerJaar: 30_000 })).toBe(true)
  })
  it('is onwaar bij een lege override-set', () => {
    expect(heeftScenarioOverrides({ extraLifeEvents: [] })).toBe(false)
    expect(heeftScenarioOverrides(null)).toBe(false)
  })
})

describe('resolveScenarioContext — profiel', () => {
  it('laat het profiel ONGEWIJZIGD (zelfde referentie) zonder override', () => {
    expect(resolveScenarioContext([], [], { extraLifeEvents: [] }, profile).profile).toBe(profile)
  })

  it('patcht methode en bedrag met de override, zonder te muteren', () => {
    const out = resolveScenarioContext([], [], { extraLifeEvents: [], uitgaveNaPensioenPerJaar: 24_000 }, profile)
    expect(out.profile.retirement_expense_method).toBe('custom_amount')
    expect(out.profile.retirement_expense_custom_amount).toBe(24_000)
    expect(profile.retirement_expense_method).toBe('essential_budgets')
  })
})
