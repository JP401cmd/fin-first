import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { buildKernelInputFromApp } from './adapter'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { solveFire, evaluateFireAt, type SolverStatus } from './solver'

/**
 * FASE 6, stap 2 — `evaluateFireAt`-tests. Kernpunt: één geforceerde
 * `runKernelProjection` (geen bisectie) levert HETZELFDE statusblok als de
 * eind-run die `solveFire` op diezelfde leeftijd doet. Deze helper voedt de
 * geforceerde secundaire wat-als-lijnen (bv. de AOW-stop-sim op /toekomst).
 */

const DOB = '1986-01-01'

const PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: DOB,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
}

function makeInput(overrides: Partial<ConvergentieRawProfileRow> = {}) {
  const assets = [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 150_000,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...PROFILE, ...overrides }),
    assets,
    debts: [],
    lifeEvents: [],
    aowRows: [],
  })
}

describe('evaluateFireAt — pariteit met de solver-eind-run', () => {
  it('op de door solveFire gevonden fireAge levert het HETZELFDE statusblok', () => {
    const input = makeInput()
    const solve = solveFire(input)
    const forced = evaluateFireAt(input, solve.fireAge)

    // fireAge gelijk per constructie; het volledige statusblok moet samenvallen.
    expect(forced.fireAge).toBe(solve.fireAge)
    expect(forced.eindleeftijd).toBe(solve.eindleeftijd)
    expect(forced.doelbedrag).toBeCloseTo(solve.doelbedrag, 6)
    expect(forced.modelwaarde).toBeCloseTo(solve.modelwaarde, 6)
    expect(forced.gap).toBeCloseTo(solve.gap, 6)
    expect(forced.status).toBe(solve.status)
    expect(forced.maandHint).toBeCloseTo(solve.maandHint, 6)
    expect(forced.tekortLeningTotEindleeftijd).toBeCloseTo(
      solve.tekortLeningTotEindleeftijd,
      6,
    )
    // Eén geforceerde run — geen bisectie.
    expect(forced.engineRuns).toBe(1)
  })

  it('op een WILLEKEURIG geforceerd moment (deplete op AOW-leeftijd) geeft een coherent statusblok', () => {
    // deplete-eind + geforceerde FIRE = AOW-leeftijd — de vorm van de AOW-stop-sim.
    const input = makeInput({ fire_end_strategy: 'deplete', fire_end_age: 90 })
    const forced = evaluateFireAt(input, 67.25)
    expect(forced.fireAge).toBe(67.25)
    expect(forced.engineRuns).toBe(1)
    const geldig: SolverStatus[] = [
      'reached_now',
      'reached_at',
      'unreachable_within_horizon',
      'pension_shortfall',
    ]
    expect(geldig).toContain(forced.status)
    // De geforceerde run hergebruikt dezelfde projectie-basis als solveFire.
    expect(forced.projection.summary).toBeDefined()
  })
})
