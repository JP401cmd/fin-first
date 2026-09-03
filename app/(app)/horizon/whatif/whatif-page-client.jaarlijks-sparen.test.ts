/**
 * Regressie op "Jaarlijks sparen" in de what-if-vergelijking
 * (UAT WF-REKEN-13-bug3, 2 sep 2026).
 *
 * WAT ER MISGING: met NUL scenario-wijzigingen toonde /toekomst/whatif
 * "Jaarlijks sparen € 42.000/jr (werkelijkheid) vs € 20.400/jr (wat-als)" en in
 * de KPI-strip "€ -21.600/jr" naast de badge "gelijk aan baseline". De
 * baseline-kant las de canonieke grondslag (`baseUnifiedInput.annualSavings`
 * uit buildHorizonInput → resolveSavingsSource: (7.600 − 4.100) × 12), de
 * what-if-kant het deprecated `applyWhatIfOverrides`, dat op
 * Σ assets.monthly_contribution × 12 rekent (1.700 × 12) — een derde grondslag.
 * Bij identieke overrides zijn alle delta's 0, dus het verschil was puur de
 * grondslag, niet het scenario.
 *
 * DE FIX: beide kanten op dezelfde canonieke grondslag; de what-if-kant =
 * `applyWhatIfOverridesToUnified(baseUnifiedInput, overrides, baseline)`
 * (canonieke basis + slider-delta's). Bewust NIET `whatIfUnifiedInput.annualSavings`:
 * buildHorizonInput laat `annualSavings` onafhankelijk van lifeEvents, dus dat
 * veld is áltijd gelijk aan de baseline en zou elke slider-delta verbergen.
 *
 * Twee lagen: (1) de rekenkundige eigenschap op de pure helpers, met de
 * repro-cijfers; (2) een bron-grendel op de pagina-bedrading (de pagina is een
 * groot client-component aan de kernel-bundel; precedent:
 * components/app/horizon/horizon-client.*.test.ts).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyWhatIfOverrides,
  applyWhatIfOverridesToUnified,
  buildBaselineOverrides,
} from '@/lib/whatif-overrides'
import { deriveOverridesFromEvents } from '@/lib/scenario-events'
import type { FinancialInput } from '@/lib/horizon-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'

// Persona "Tessa Compleet" uit de repro: netto € 7.600/mnd (income_source =
// 'manual'), uitgaven € 4.100/mnd, Σ assets.monthly_contribution = € 1.700/mnd.
const TESSA_INPUT: FinancialInput = {
  totalAssets: 250_000,
  totalDebts: 0,
  monthlyIncome: 7_600,
  monthlyExpenses: 4_100,
  monthlyContributions: 1_700,
  yearlyMustExpenses: 49_200,
  dateOfBirth: '1990-01-01',
}
/** Canonieke grondslag zoals buildHorizonInput 'm levert (cashflow-spaarquote). */
const CANONIEK_JAARLIJKS_SPAREN = (7_600 - 4_100) * 12 // 42.000
/** Wat het legacy pad liet zien: Σ monthly_contribution × 12. */
const LEGACY_JAARLIJKS_SPAREN = 1_700 * 12 // 20.400

const GROSS_RETURN = 0.07
const SAVINGS_RATE_6M = 46

/** Alleen de velden die applyWhatIfOverridesToUnified leest. */
const BASE_UNIFIED = {
  annualSavings: CANONIEK_JAARLIJKS_SPAREN,
  monthlySurplus: CANONIEK_JAARLIJKS_SPAREN / 12,
  yearlyExpenses: 49_200,
  monthlyIncome: 7_600,
  grossReturn: GROSS_RETURN,
} as UnifiedProjectionInput

const baseline = buildBaselineOverrides(TESSA_INPUT, GROSS_RETURN, SAVINGS_RATE_6M)

describe('Jaarlijks sparen — ongewijzigd scenario (WF-REKEN-13-bug3)', () => {
  it('nul scenario-events → afgeleide overrides zijn waarde-identiek aan de baseline', () => {
    // Precies de situatie uit de repro: geen preset, slider of gebeurtenis aangeraakt.
    expect(deriveOverridesFromEvents([], baseline, null)).toEqual(baseline)
  })

  it('repro: het legacy pad rekende op de Σ monthly_contribution-grondslag', () => {
    // Documenteert waaróm die uitvoer de KPI niet meer mag voeden: identieke
    // overrides, en tóch € 20.400 i.p.v. de canonieke € 42.000.
    const { annualSavings } = applyWhatIfOverrides(TESSA_INPUT, baseline, baseline)
    expect(annualSavings).toBe(LEGACY_JAARLIJKS_SPAREN)
    expect(annualSavings).not.toBe(CANONIEK_JAARLIJKS_SPAREN)
  })

  it('fix: op de canonieke grondslag is de what-if-kant exact de baseline (verschil € 0)', () => {
    const overrides = deriveOverridesFromEvents([], baseline, null)
    const whatIf = applyWhatIfOverridesToUnified(BASE_UNIFIED, overrides, baseline).annualSavings
    expect(whatIf).toBe(CANONIEK_JAARLIJKS_SPAREN)
    expect(whatIf - BASE_UNIFIED.annualSavings).toBe(0)
  })
})

describe('Jaarlijks sparen — slider-delta blijft zichtbaar op de canonieke grondslag', () => {
  it('extra inleg € 500/mnd → + € 6.000/jr bovenop de canonieke basis', () => {
    const whatIf = applyWhatIfOverridesToUnified(
      BASE_UNIFIED,
      { ...baseline, extraContribution: 500 },
      baseline,
    ).annualSavings
    expect(whatIf).toBe(CANONIEK_JAARLIJKS_SPAREN + 500 * 12)
  })

  it('inkomen + € 400/mnd stroomt 1:1 door naar sparen', () => {
    const whatIf = applyWhatIfOverridesToUnified(
      BASE_UNIFIED,
      { ...baseline, monthlyIncome: baseline.monthlyIncome + 400 },
      baseline,
    ).annualSavings
    expect(whatIf).toBe(CANONIEK_JAARLIJKS_SPAREN + 400 * 12)
  })
})

describe('whatif-page-client — bedrading van Jaarlijks sparen (bron-grendel)', () => {
  const source = readFileSync(
    join(process.cwd(), 'app', '(app)', 'horizon', 'whatif', 'whatif-page-client.tsx'),
    'utf8',
  )

  it('leidt de what-if-kant af van de canonieke basis + slider-delta\'s', () => {
    expect(source).toContain(
      'applyWhatIfOverridesToUnified(baseUnifiedInput, overrides, baseline).annualSavings',
    )
    // Zonder basis/overrides valt de what-if-kant terug op de baseline — nooit
    // op een eigen som over monthly_contribution.
    expect(source).toMatch(/whatIfAnnualSavings = baseUnifiedInput && overrides && baseline\s*\?/)
  })

  it('consumeert de annualSavings van het legacy applyWhatIfOverrides nergens meer', () => {
    expect(source).not.toContain('whatIfAnnualSavings_sim')
    expect(source).not.toMatch(/annualSavings[^\n]*\}\s*=\s*useMemo[\s\S]{0,200}applyWhatIfOverrides\(/)
    // Het legacy pad blijft alleen voor de dailyExpenses-weergave (adjustedInput).
    expect(source).toContain('applyWhatIfOverrides(input, overrides, baseline).adjustedInput')
  })

  it('valt niet in de val van whatIfUnifiedInput.annualSavings (altijd = baseline)', () => {
    expect(source).not.toMatch(/whatIfAnnualSavings\s*=\s*whatIfUnifiedInput/)
  })

  it('beide kanten delen dezelfde grondslag-bron', () => {
    expect(source).toMatch(/baselineAnnualSavings = baseUnifiedInput\?\.annualSavings/)
  })
})
