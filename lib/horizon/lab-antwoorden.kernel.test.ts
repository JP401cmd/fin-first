import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { toSimResult } from '@/lib/unified-projection'
import { buildSliderEvent, savingsPpForMonthlyAmount } from '@/lib/scenario-events'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { LifeEvent } from '@/lib/horizon-data'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { dekkingVanRun, resolveLabUitkomst } from './lab-uitkomst'
import { resolveLabAntwoorden } from './lab-antwoorden'
import { runForcedStopPath, solveFireAgeWithoutAnchor } from './scenario-presets'

/**
 * KERNEL-BEWIJS — klopt "het antwoord" na "Reken hiermee"? (eindreview I2, 15 sep 2026)
 *
 * De €-antwoorden gebruiken P!B96 (`maandHint = −gap ÷ maanden tot de EINDLEEFTIJD`,
 * lib/horizon-kernel/solver.ts `computeStatusBlok`). De slider-events `slider:extra_inleg`
 * en `slider:savings` lopen echter via het FIRE-gegate salariskanaal en vallen weg op het
 * stopmoment ("SLIDER-WERK-GATE"). Deze test draait de échte motor op een vast `age`-anker
 * met een bescheiden tekort, zet de hefboom op precies het hint-bedrag — exact zoals de
 * scenario-run in `use-horizon-fire-sim` het doet (slider-event bovenop de hoofd-lifeEvents)
 * — en meet de dekking.
 *
 * GEMETEN (15 sep 2026, persona "compleet", deplete tot 90, `yearly_essential_expenses`):
 *  - leeftijd 42, stop 50, €100.000/jr: basis 77,1% · hint ≈ €2.977/mnd
 *      → extra opzij = hint: 94,0% · minder uitgeven = hint: 94,0%   (< 99: NIET gedekt)
 *      → doorwerken tot 52,5 (opgelost 52,5): 100% op het plan-anker én op het stop-pad
 *  - leeftijd 55, stop 58, €100.000/jr: basis 82,0% · hint ≈ €1.784/mnd
 *      → extra opzij = hint: 86,7% · minder uitgeven = hint: 86,7%   (< 99)
 *      → doorwerken tot 60 (opgelost 59,75): 100% op beide paden
 * Breder rooster (leeftijd 42/55 × stop +3/+8 × deplete/perpetual × €60k–€140k): de
 * €-hefboom op het hint-bedrag haalde onder deplete in géén tekortgeval ≥ 99%; onder
 * perpetual alleen wanneer er nog ≥ 8 jaar tot het stopmoment lag. Doorwerken tot het
 * antwoord haalde overal 100%.
 *
 * Gevolg (controller-ruling I2): de twee €-zinnen claimen geen uitkomst meer ("hoort bij
 * een gedekt plan", met "uitgesmeerd tot je eindleeftijd"); "Doorwerken tot X dekt je
 * plan." blijft, want die claim is hier bewezen. Wijzigt de motor zo dat de €-hefboom wél
 * dekt, dan wordt deze test rood — herzie dan de kopij bewust, niet de test.
 */

function context(age: number, stop: number) {
  const fx = buildCompleetHorizonFixture(age)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(age),
    yearly_essential_expenses: 100_000,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    fire_stop_anchor: 'age',
    fire_stop_age: stop,
  }
  const baseline = buildBaselineOverrides(fx.financialInput, fx.grossReturn, null)
  const run = (p: ConvergentieRawProfileRow, extra: WhatIfEvent[] = []) => {
    const out = computeConvergentieProjection({
      rawContext: {
        profile: p,
        assets: fx.assets,
        debts: fx.debts,
        // Zoals resolveScenarioAssetsAndEvents: scenario-events bovenop de hoofd-events.
        lifeEvents: [...fx.lifeEvents, ...(extra as unknown as LifeEvent[])],
        aowRows: [],
        yearlyExpenses: 30_000,
      },
    })
    if (!out.ok) throw new Error(`fixture: kernel-fout — ${out.reason}`)
    return out
  }
  return { fx, profile, baseline, run }
}

function meet(age: number, stop: number) {
  const { fx, profile, baseline, run } = context(age, stop)
  const base = run(profile)
  const basisSim = toSimResult(base.result)
  const hint = base.kernelMaandHint

  // De productie-afleiding: lab-uitkomst → antwoorden (plan-hint, tweede run).
  const dekking = resolveLabUitkomst({
    planAnchor: { kind: 'age', age: stop },
    currentAge: age,
    basis: basisSim,
    scenario: null,
    stopPad: null,
    kernelMaandHint: hint,
    hasScenario: false,
    hasStopKeuze: false,
  })
  const solvedFireAge = solveFireAgeWithoutAnchor({ profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [] })
  const antwoorden = resolveLabAntwoorden({
    dekking: dekking.kind === 'dekking' ? dekking : null,
    solvedFireAge,
    planMaandHint: hint,
    baseline,
  })

  const extraEv = buildSliderEvent('extra_inleg', hint, baseline, age)
  const pp = savingsPpForMonthlyAmount(baseline, hint)
  const savingsEv = pp == null ? null : buildSliderEvent('savings', pp, baseline, age)
  if (extraEv == null || savingsEv == null) throw new Error('fixture: geen slider-event')

  const doorwerken = antwoorden.find((a) => a.kind === 'doorwerken')
  const tot = doorwerken?.actie.kind === 'stop' ? doorwerken.actie.stopAge : null
  const stopPad =
    tot == null
      ? null
      : runForcedStopPath({
          profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [],
          yearlyExpenses: 30_000, stopAge: tot, fireEndAge: 90, endStrategy: 'inherit',
        })

  return {
    status: base.kernelStatus,
    hint,
    basisPct: dekkingVanRun(basisSim, age),
    antwoorden,
    extraPct: dekkingVanRun(toSimResult(run(profile, [extraEv]).result), age),
    savingsPct: dekkingVanRun(toSimResult(run(profile, [savingsEv]).result), age),
    tot,
    doorwerkenPlanPct: tot == null ? null : dekkingVanRun(toSimResult(run({ ...profile, fire_stop_age: tot }).result), age),
    doorwerkenStopPadPct: stopPad == null ? null : dekkingVanRun(stopPad.result, age),
  }
}

describe('lab-antwoorden × kernel — wat "Reken hiermee" werkelijk oplevert (eindreview I2)', () => {
  for (const [age, stop] of [[42, 50], [55, 58]] as const) {
    describe(`leeftijd ${age}, vast stopmoment ${stop}, bescheiden tekort`, () => {
      const m = meet(age, stop)

      it('de fixture is een bescheiden tekort onder een vast anker, met een positieve plan-hint en drie antwoorden', () => {
        expect(m.status).toBe('anchor_shortfall')
        expect(m.basisPct).not.toBeNull()
        expect(m.basisPct as number).toBeGreaterThanOrEqual(70)
        expect(m.basisPct as number).toBeLessThanOrEqual(95)
        expect(m.hint).toBeGreaterThan(0)
        expect(m.antwoorden.map((a) => a.kind)).toEqual(['doorwerken', 'extra_opzij', 'minder_uitgeven'])
      })

      it('€ hint extra opzij / minder uitgeven helpt, maar dekt het plan NIET (< 99%) — daarom geen uitkomstclaim in de kopij', () => {
        expect(m.extraPct as number).toBeGreaterThan(m.basisPct as number)
        expect(m.savingsPct as number).toBeGreaterThan(m.basisPct as number)
        expect(m.extraPct as number).toBeLessThan(99)
        expect(m.savingsPct as number).toBeLessThan(99)
        for (const a of m.antwoorden.filter((x) => x.kind !== 'doorwerken')) {
          expect(a.zin).toMatch(/uitgesmeerd tot je eindleeftijd, hoort bij een gedekt plan\.$/)
          expect(a.zin).not.toMatch(/dekt je plan/)
        }
      })

      it('doorwerken tot het antwoord dekt het plan wél (≥ 99%) — op het plan-anker én op het stop-pad', () => {
        expect(m.tot).not.toBeNull()
        expect(m.tot as number).toBeGreaterThan(stop)
        expect(m.doorwerkenPlanPct as number).toBeGreaterThanOrEqual(99)
        expect(m.doorwerkenStopPadPct as number).toBeGreaterThanOrEqual(99)
        expect(m.antwoorden[0].zin).toMatch(/^Doorwerken tot .+ dekt je plan\.$/)
      })
    })
  }
})
