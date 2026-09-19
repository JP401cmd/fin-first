/**
 * B-053 — kernel-invariant "geen halt-op-nul" (regressiecase, 19 sep 2026).
 *
 * De keten loader -> `buildSimNetWorthRows` -> kernel is ongeklemd: bij een vast
 * vroeg stopanker met een bewust tekort rekent `prognose.nettoVermogen`
 * (I = D − E) door tot diep negatief, omdat de tekort-lening-pot (`tables/s.ts`,
 * rol `tekortLening`) in `totaalSchulden` oploopt. Deze suite pint dat gedrag
 * vast als de grondslag waarop de Toekomst-grafiek (sim-chart-geometry.ts) en de
 * scenario-varianten (sim-chart.tsx) sinds B-053 ongeklemd tekenen. Hergebruikt
 * het scenario uit geen-tekort-lening.test.ts (a) 'vast anker + vlag AAN' —
 * fire_stop_anchor: 'age', fire_stop_age: 47.
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from './adapter'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { solveFire } from './solver'
import type { KernelInput } from './types'

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const EXTRA_PENSIOEN = {
  id: 'evt-extra-pensioen',
  name: 'Extra pensioen',
  event_type: 'pensioen',
  target_age: 68,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 4000,
  is_active: true,
  sort_order: 9,
  metadata: {},
} as unknown as LifeEvent

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

function makeInput(over: Partial<ConvergentieRawProfileRow> = {}): KernelInput {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...basisProfiel, fire_no_deficit_loan: false, ...over }),
    assets: scaleAssets(0.1),
    debts: fx.debts,
    lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN],
    aowRows: [],
  })
}

describe('B-053 — nettoVermogen bij vast anker (47) + geenTekortLening rekent door onder nul', () => {
  it('prognose.nettoVermogen (I = D−E) wordt negatief en blijft dat tot de laatste rij', () => {
    const anker = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 47 })
    const on = solveFire({ ...anker, geenTekortLening: true })
    expect(on.status).toBe('anchor_shortfall')

    const rows = on.projection.prognose.filter(
      (r): r is Extract<typeof r, { nettoVermogen: number }> => 'nettoVermogen' in r,
    )
    const minRow = rows.reduce((min, r) => (r.nettoVermogen < min.nettoVermogen ? r : min), rows[0])

    // Geen halt-op-nul: het dieptepunt ligt ruim onder nul (≈ −€1,1 mln op dit
    // scenario). Dat de LAATSTE rij weer positief kan zijn is de vorm van de
    // fixture (extra pensioen vanaf 68 vult het gat), geen klem.
    expect(minRow.nettoVermogen).toBeLessThan(0)
    // De schuldkant (tekort-lening) draagt het tekort — bezit is op, schuld loopt op.
    expect(minRow.totaalSchulden).toBeGreaterThan(minRow.totaalBezittingen)
  })
})
