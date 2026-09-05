import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { computeConvergentieProjection, type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { solveFireAgeWithoutAnchor } from '@/lib/horizon/scenario-presets'
import { assembleTotaalplan, type TotaalplanRawInputs } from './totaalplan-data'
import type { PersoonlijkPlanProfileRow } from './persoonlijk-plan-assembly'

/**
 * ADR 0129 F3a (J) — het rapport draagt onder een vast anker de drie velden
 * "Gekozen stopmoment" · "Vrij mogelijk vanaf" · "Reikt tot" (labels: F3b), en de
 * aannames-sectie het anker. Fixture: de "schone input"-persona van totaalplan-data.test.ts.
 */
const DOB = '1986-01-01'

const PROFILE: PersoonlijkPlanProfileRow = {
  full_name: 'Test Persoon', date_of_birth: DOB, household_type: 'single', number_of_children: 0,
  net_monthly_income: 4000, estimated_monthly_expenses: 2500, expected_return: 7, inflation_rate: 2, marginaal_tarief: null,
  fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: 0,
  retirement_expense_method: 'current_expenses', retirement_expense_custom_amount: null,
  withdrawal_strategy: 'static', guardrail_floor: null, guardrail_ceiling: null, guardrail_cut_step: null, guardrail_raise_step: null,
  feature_preferences: null,
}

function makeAssets(): Asset[] {
  return [{ id: 'inv', name: 'Beleggingen', asset_type: 'investment', current_value: 150_000, woz_value: null, expected_return: 7, monthly_contribution: 800, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: 0 }] as unknown as Asset[]
}

function kernelContext(plan: Partial<PersoonlijkPlanProfileRow>): ConvergentieRawContext {
  return {
    profile: {
      date_of_birth: DOB, net_monthly_income: 4000, estimated_monthly_expenses: 2500, expected_return: 7, inflation_rate: 2,
      box3_method: 'forfaitair', fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: 0, withdrawal_strategy: 'static',
      housing_strategy_config: { mode: 'include_full' }, retirement_expense_method: 'current_expenses', retirement_expense_custom_amount: null,
      ...plan,
    },
    assets: makeAssets(), debts: [], lifeEvents: [], aowRows: [], yearlyExpenses: 30_000,
  }
}

function raw(plan: Partial<PersoonlijkPlanProfileRow>): TotaalplanRawInputs {
  return {
    generatedAt: '2026-09-05T00:00:00.000Z',
    dailyExpenseRate: 83,
    persoonlijkPlan: { profile: { ...PROFILE, ...plan }, aowRows: [], events: [], budgetRows: [] },
    kernelContext: kernelContext(plan),
    aandachtspunten: [],
  }
}

describe('assembleTotaalplan — het anker in projectie en aannames', () => {
  it('solved: geen anker-velden gevuld, gedrag ongewijzigd', () => {
    const data = assembleTotaalplan(raw({}))
    expect(data.projectie.stopAnchor).toBe('solved')
    expect(data.projectie.gekozenStopmoment).toBeNull()
    expect(data.projectie.vrijMogelijkVanaf).toBeNull()
    expect(data.projectie.reiktTot).toBeNull()
    expect(data.eindstrategie.stopAnchor).toBe('solved')
    expect(data.eindstrategie.stopAge).toBeNull()
  })

  it('age 58,5: het gekozen stopmoment blijft 58,5 (niet ceil), plus vrij-mogelijk-vanaf en reikt-tot uit dezelfde motor', () => {
    const plan = { fire_stop_anchor: 'age', fire_stop_age: 58.5 } as Partial<PersoonlijkPlanProfileRow>
    const data = assembleTotaalplan(raw(plan))
    expect(data.projectie.ok).toBe(true)
    expect(data.projectie.stopAnchor).toBe('age')
    expect(data.projectie.gekozenStopmoment).toBe(58.5)
    expect(data.projectie.fireAge).toBe(59) // ceil — precies waarom gekozenStopmoment een eigen veld is
    // Vrij mogelijk vanaf = de bisectie zónder anker op dezelfde context.
    expect(data.projectie.vrijMogelijkVanaf).toBe(solveFireAgeWithoutAnchor(kernelContext(plan)))
    // Reikt tot: uit dezelfde run als de rijen — een leeftijd op de kernel-tijdas, of het plan-einde.
    const run = computeConvergentieProjection({ rawContext: kernelContext(plan) })
    if (!run.ok) throw new Error('fixture: run niet ok')
    const reikt = data.projectie.reiktTot
    expect(reikt).not.toBeNull()
    if (run.result.kernelDepletionMonth == null) expect(reikt).toBe(run.result.displayEndAge)
    else expect(reikt).toBeGreaterThan(0)
    expect(data.eindstrategie.stopAnchor).toBe('age')
    expect(data.eindstrategie.stopAge).toBe(58.5)
  })

  it('aow: anker in beide secties, stopAge alleen bij age', () => {
    const data = assembleTotaalplan(raw({ fire_stop_anchor: 'aow' } as Partial<PersoonlijkPlanProfileRow>))
    expect(data.projectie.stopAnchor).toBe('aow')
    expect(data.projectie.gekozenStopmoment).not.toBeNull()
    expect(data.eindstrategie.stopAnchor).toBe('aow')
    expect(data.eindstrategie.stopAge).toBeNull()
  })
})
