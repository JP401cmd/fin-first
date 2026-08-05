/**
 * Tests voor de besteedbaar-vermogenslijn (Toekomst-grafiek, Pad-modus).
 *
 * Pinnen twee dingen:
 *  1. de CONDITIE — de tweede lijn verschijnt in ALLE VIER de woonstrategieën
 *     zodra er een eigen woning is, en verdwijnt zonder eigen woning;
 *  2. de MAPPING — de punten komen één-op-één uit `nettoLiquide` op de as-conventie
 *     van de hoofdlijn (`age + 1`), zonder eigen som.
 */
import { describe, it, expect } from 'vitest'
import {
  shouldShowLiquidWealthLine,
  buildLiquidWealthPoints,
  type LiquidWealthRow,
} from './liquid-wealth-line'
import type { HousingContext, HousingStrategyConfig } from '@/lib/housing-strategy'

// ── Fixtures ────────────────────────────────────────────────────────────────

function context(hasEigenHuis: boolean): HousingContext {
  return {
    eigenHuisValue: hasEigenHuis ? 450_000 : 0,
    wozValue: hasEigenHuis ? 430_000 : 0,
    mortgageBalance: hasEigenHuis ? 200_000 : 0,
    mortgageMonthlyPayment: hasEigenHuis ? 950 : 0,
    hasEigenHuis,
    eigenHuisMortgages: [],
    eigenHuisAssets: [],
  }
}

const STRATEGIES: Record<HousingStrategyConfig['mode'], HousingStrategyConfig> = {
  include_full: { mode: 'include_full' },
  exclude_from_fire: { mode: 'exclude_from_fire' },
  downsize: {
    mode: 'downsize',
    trigger: 'fixed_age',
    triggerAge: 70,
    depletionThresholdYears: 2,
    salePricePct: 1,
    salesCostsPct: 0.04,
    newMonthlyHousingCost: null,
  },
  reverse_mortgage: {
    mode: 'reverse_mortgage',
    trigger: 'fixed_age',
    triggerAge: 70,
    depletionThresholdYears: 2,
    maxLoanPct: 0.5,
    interestRate: 0.055,
    monthlyPayout: null,
  },
}

// ── Conditie ────────────────────────────────────────────────────────────────

describe('shouldShowLiquidWealthLine — eigen woning is de enige voorwaarde', () => {
  // Eigenaarsbesluit 2026-08-05: consistentie boven minder ruis. De kernel rekent
  // de woning in élke modus als niet-liquide (Prognose!J = I − niet-liquide bezit),
  // dus de kloof bestaat overal — ook bij include_full en downsize. Deze tests zijn
  // de rem op een latere versmalling naar een subset.

  it('toont de lijn zodra er een eigen woning is', () => {
    expect(shouldShowLiquidWealthLine(context(true))).toBe(true)
  })

  it('toont de lijn NIET zonder eigen woning', () => {
    expect(shouldShowLiquidWealthLine(context(false))).toBe(false)
  })

  it('is ONAFHANKELIJK van de woonstrategie — ook include_full en downsize tonen de lijn', () => {
    // De strategie is bewust géén parameter meer. Deze test bewijst dat langs de
    // enige weg die dat kan: de conditie kent alle vier de modi niet en geeft voor
    // elk van hen dezelfde uitkomst als de kale eigen-woning-vraag.
    expect(shouldShowLiquidWealthLine).toHaveLength(1)
    const uitkomst = shouldShowLiquidWealthLine(context(true))
    for (const mode of Object.keys(STRATEGIES)) {
      expect(uitkomst, `strategie ${mode} hoort de lijn te tonen`).toBe(true)
    }
    // …en de vier modi die we bedoelen zijn ook echt de vier die bestaan.
    expect(Object.keys(STRATEGIES).sort()).toEqual(
      ['downsize', 'exclude_from_fire', 'include_full', 'reverse_mortgage'],
    )
  })
})

// ── Mapping ─────────────────────────────────────────────────────────────────

describe('buildLiquidWealthPoints — consume-only mapping van nettoLiquide', () => {
  const rows: LiquidWealthRow[] = [
    { age: 45, nettoLiquide: 120_000 },
    { age: 46, nettoLiquide: 145_000 },
    { age: 47, nettoLiquide: 138_000 },
  ]

  it('plot elke rijwaarde ongewijzigd op leeftijd + 1 (as van de hoofdlijn)', () => {
    expect(buildLiquidWealthPoints(rows)).toEqual([
      [46, 120_000],
      [47, 145_000],
      [48, 138_000],
    ])
  })

  it('slaat niet-eindige waarden over en levert een lege reeks bij lege invoer', () => {
    expect(
      buildLiquidWealthPoints([
        { age: 45, nettoLiquide: Number.NaN },
        { age: 46, nettoLiquide: 10_000 },
      ]),
    ).toEqual([[47, 10_000]])
    expect(buildLiquidWealthPoints([])).toEqual([])
  })
})
