import { describe, it, expect } from 'vitest'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildSliderEvent } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'

/**
 * RUN-NIVEAU-fingerprint van de slider-werk-modellek-fix (naast `scenario-baseline-parity`).
 *
 * De adapter-eigenschaps-tests (`adapter/events.test.ts`) bewijzen de mapping met SYNTHETISCHE
 * `scenario_origin`-events. Deze test bewijst de ÉCHTE keten end-to-end, met een event uit de
 * échte builder:
 *
 *   buildSliderEvent('income', …)  [lib/scenario-events.ts]
 *     → extraLifeEvents / lifeEvents (spread/filter, geen field-pick — getraceerd)
 *     → computeConvergentieProjection  [convergentie-router.ts:151 pass-through]
 *     → runKernelUnified → buildKernelInputFromAppWithNotices → buildEventInputs
 *     → adapter-guard `isSliderWorkEvent` (leest `scenario_origin`)
 *     → salaris-kanaal (CF!D, FIRE-gegate)  — NIET CF!H (Geb-baten)
 *
 * FINGERPRINT VAN HET LEK: een `slider:income`-event mag NOOIT als gebeurtenis-baat (CF!H,
 * `row.grossIncomeBySource.gebeurtenisBaten`) verschijnen. CF!H is EVENT-gedreven (AOW/pensioen/
 * Geb-posten) en dus FIRE-timing- én portefeuille-ONAFHANKELIJK → op gelijke leeftijd byte-gelijk
 * tussen basislijn en scenario. Zou het lek terug zijn, dan landt het +inkomen in CF!H en stijgt
 * `gebeurtenisBaten` élk jaar (óók ná FIRE) → deze gelijkheid breekt. Het inkomen hoort in CF!D
 * (`salaris`), dat ná FIRE niet meer naar het vermogen doorwerkt (CF!F sparen = 0 ná FIRE).
 */

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)
// essential_budgets + VAST `yearly_essential_expenses` (48k) ⇒ de uitgave-na-pensioen is
// INKOMENS-ONAFHANKELIJK; het slider-inkomen kan CF!H dus langs geen enkele omweg beïnvloeden.
const profile = buildCompleetKernelProfileBase(PINNED_AGE)

const baseContext: ConvergentieRawContext = {
  profile,
  assets: fx.assets,
  debts: fx.debts,
  lifeEvents: fx.lifeEvents,
  aowRows: [],
  yearlyExpenses: fx.financialInput.yearlyMustExpenses,
}

/** Reële slider-baseline: `monthlyIncome` = profiel-inkomen (werkdagen/spaarquote irrelevant voor de income-slider). */
const whatIfBaseline: WhatIfOverrides = {
  monthlyIncome: profile.net_monthly_income ?? 0,
  workDaysPerWeek: 5,
  savingsRate: 0,
  expectedReturn: (profile.expected_return ?? 0.07) * 100,
  extraContribution: 0,
}

describe('scenario slider-werk-gate — run-niveau (modellek-fingerprint)', () => {
  it('een écht buildSliderEvent(income,+€1500) verschijnt NOOIT als gebeurtenis-baat (CF!H) — op geen enkele leeftijd, ook niet ná FIRE', () => {
    const baseline = computeConvergentieProjection({ rawContext: baseContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    // Sanity: de fixture bereikt FIRE op een echte datum (er is dus een onttrekkingsfase).
    expect(baseline.result.fireReachable).toBe(true)
    expect(baseline.result.fireAgeFractional).not.toBeNull()

    // Écht event uit de builder — draagt `scenario_origin: 'slider:income'` (geen synthetiek).
    const sliderEvent = buildSliderEvent('income', (profile.net_monthly_income ?? 0) + 1500, whatIfBaseline, PINNED_AGE)
    expect(sliderEvent).not.toBeNull()
    expect(sliderEvent!.scenario_origin).toBe('slider:income')
    expect(sliderEvent!.monthly_income_change).toBe(1500)
    expect(sliderEvent!.duration_months).toBe(0) // permanent — de bron van het lek

    const scenario = computeConvergentieProjection({
      rawContext: { ...baseContext, lifeEvents: [...fx.lifeEvents, sliderEvent!] },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return

    // ── FINGERPRINT: CF!H (gebeurtenis-baten) op gelijke leeftijd IDENTIEK aan de basislijn. ──
    // Tolerantie = ABSOLUUT (cent): basislijn en scenario zijn per constructie event-identiek
    // (zelfde AOW/pensioen/Geb-events, FIRE-timing-onafhankelijk), dus élk verschil is het lek
    // (grootte ≈ €1500 × 12 ≈ €18k/jaar — ordes boven de cent-tolerantie). Relatief zou hier
    // niet passen: veel jaren hebben `gebeurtenisBaten === 0` (deling door nul).
    let comparedWithdrawalRows = 0
    for (const scRow of scenario.result.rows) {
      const baseRow = baseline.result.rows.find((r) => r.year === scRow.year)
      if (!baseRow) continue
      const scBaten = scRow.grossIncomeBySource?.gebeurtenisBaten ?? 0
      const baseBaten = baseRow.grossIncomeBySource?.gebeurtenisBaten ?? 0
      expect(scBaten).toBeCloseTo(baseBaten, 2)
      if (scRow.phase === 'withdrawal') comparedWithdrawalRows++
    }
    // De fingerprint MOET de onttrekkingsfase dekken — daar manifesteerde het lek zich.
    expect(comparedWithdrawalRows).toBeGreaterThan(0)

    // ── POSITIEVE CONTROLE: het event dóét wél iets via het salaris-kanaal (CF!D). ──
    // Anders zou de fingerprint leeg-groen zijn als het event stilzwijgend genegeerd werd.
    // Het +inkomen verhoogt het pre-FIRE salaris en (via meer sparen) versnelt het FIRE.
    const scEarlySalaris = scenario.result.rows[0].grossIncomeBySource?.salaris ?? 0
    const baseEarlySalaris = baseline.result.rows[0].grossIncomeBySource?.salaris ?? 0
    expect(scEarlySalaris).toBeGreaterThan(baseEarlySalaris)
    expect(scenario.result.rows).not.toEqual(baseline.result.rows)
    // Meer sparen vóór FIRE (gelijk FIRE-doel: essential_budgets is inkomens-onafhankelijk)
    // ⇒ FIRE niet later dan de basislijn.
    expect(scenario.result.fireAgeFractional!).toBeLessThanOrEqual(baseline.result.fireAgeFractional!)
  })

  // ── Extra-inleg-slider: per 13-jul mee-gegate (kaart "Doel lijn grafiek vragen") ──────────
  it('een écht buildSliderEvent(extra_inleg,+€900) verschijnt NOOIT als gebeurtenis-baat (CF!H) — ook niet ná FIRE', () => {
    const baseline = computeConvergentieProjection({ rawContext: baseContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    expect(baseline.result.fireReachable).toBe(true)
    expect(baseline.result.fireAgeFractional).not.toBeNull()

    // Écht event uit de builder — draagt `scenario_origin: 'slider:extra_inleg'`.
    const inlegEvent = buildSliderEvent('extra_inleg', 900, whatIfBaseline, PINNED_AGE)
    expect(inlegEvent).not.toBeNull()
    expect(inlegEvent!.scenario_origin).toBe('slider:extra_inleg')
    expect(inlegEvent!.monthly_income_change).toBe(900)
    expect(inlegEvent!.duration_months).toBe(0)

    const scenario = computeConvergentieProjection({
      rawContext: { ...baseContext, lifeEvents: [...fx.lifeEvents, inlegEvent!] },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return

    // ── FINGERPRINT: extra inleg mag NOOIT als doorlopende Geb-baat (CF!H) landen. ──
    // Deed het dat wél (oude leak), dan stond +€900×12 élk jaar in `gebeurtenisBaten`, óók in
    // de onttrekkingsfase → deze gelijkheid brak. Nu loopt de delta via CF!D (salaris) en stopt
    // die ná FIRE, precies als income/workdays.
    let comparedWithdrawalRows = 0
    for (const scRow of scenario.result.rows) {
      const baseRow = baseline.result.rows.find((r) => r.year === scRow.year)
      if (!baseRow) continue
      const scBaten = scRow.grossIncomeBySource?.gebeurtenisBaten ?? 0
      const baseBaten = baseRow.grossIncomeBySource?.gebeurtenisBaten ?? 0
      expect(scBaten).toBeCloseTo(baseBaten, 2)
      if (scRow.phase === 'withdrawal') comparedWithdrawalRows++
    }
    expect(comparedWithdrawalRows).toBeGreaterThan(0)

    // ── POSITIEVE CONTROLE: de extra inleg dóét wél iets via het salaris-kanaal (CF!D). ──
    const scEarlySalaris = scenario.result.rows[0].grossIncomeBySource?.salaris ?? 0
    const baseEarlySalaris = baseline.result.rows[0].grossIncomeBySource?.salaris ?? 0
    expect(scEarlySalaris).toBeGreaterThan(baseEarlySalaris)
    // Meer sparen vóór FIRE ⇒ FIRE niet later dan de basislijn.
    expect(scenario.result.fireAgeFractional!).toBeLessThanOrEqual(baseline.result.fireAgeFractional!)
  })
})
