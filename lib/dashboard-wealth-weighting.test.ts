import { describe, it, expect } from 'vitest'
import {
  inclusionFactor,
  weightedAssetValue,
  computeAssetsByType,
  computeLiquidPot,
  monthsCoveredFrom,
  weightedExpectedReturn,
  INVESTMENT_ASSET_TYPES,
  type WeightableAssetRow,
} from './dashboard-wealth-weighting'
import { computeSovereigntyLevel } from './feature-phases'

// ── Fixture-huishouden ────────────────────────────────────────────────────────
// Een huiseigenaar die het huis voor 50% bezit (gedeeld bezit / partner), plus
// een gedeelde spaarrekening (50%), een 100%-belegging en 100% cash.
// De hypotheek staat óók op 50%.
const HOUSE: WeightableAssetRow = {
  asset_type: 'real_estate',
  current_value: 400_000,
  purchase_value: 300_000,
  expected_return: 2,
  net_worth_inclusion_pct: 50,
}
const SHARED_SAVINGS: WeightableAssetRow = {
  asset_type: 'savings',
  current_value: 20_000,
  purchase_value: 20_000,
  expected_return: 1,
  net_worth_inclusion_pct: 50,
}
const INVESTMENT: WeightableAssetRow = {
  asset_type: 'investment',
  current_value: 100_000,
  purchase_value: 80_000,
  expected_return: 7,
  net_worth_inclusion_pct: 100,
}
const CASH: WeightableAssetRow = {
  asset_type: 'cash',
  current_value: 5_000,
  purchase_value: 5_000,
  expected_return: 0,
  net_worth_inclusion_pct: 100,
}
const ASSETS = [HOUSE, SHARED_SAVINGS, INVESTMENT, CASH]

// Headline-totaal zoals de loader het berekent: Σ current_value × inclusion.
const weightedTotal = ASSETS.reduce((s, a) => s + weightedAssetValue(a), 0)
// = 400k*0.5 + 20k*0.5 + 100k*1 + 5k*1 = 200k + 10k + 100k + 5k = 315.000
const UNWEIGHTED_TOTAL = ASSETS.reduce((s, a) => s + Number(a.current_value), 0) // 525.000

describe('dashboard-wealth-weighting — inclusion factor', () => {
  it('defaults to 100% when net_worth_inclusion_pct is missing', () => {
    expect(inclusionFactor({})).toBe(1)
    expect(inclusionFactor({ net_worth_inclusion_pct: null })).toBe(1)
    expect(inclusionFactor({ net_worth_inclusion_pct: 50 })).toBe(0.5)
    expect(inclusionFactor({ net_worth_inclusion_pct: 80 })).toBe(0.8)
  })

  it('weightedAssetValue applies the factor to current_value', () => {
    expect(weightedAssetValue(HOUSE)).toBe(200_000)
    expect(weightedAssetValue(INVESTMENT)).toBe(100_000)
  })
})

describe('dashboard-wealth-weighting — computeAssetsByType (Punt 1)', () => {
  it('weights value and purchaseValue by net_worth_inclusion_pct', () => {
    const groups = computeAssetsByType(ASSETS)
    const byType = Object.fromEntries(groups.map(g => [g.type, g]))

    // Huis telt op 50%: value 200k, purchaseValue 150k (300k*0.5)
    expect(byType.real_estate.value).toBe(200_000)
    expect(byType.real_estate.purchaseValue).toBe(150_000)
    // Gedeelde spaarrekening op 50%
    expect(byType.savings.value).toBe(10_000)
    // Volle belegging op 100%
    expect(byType.investment.value).toBe(100_000)
  })

  it('INVARIANT: som(assetsByType.value) == inclusion-gewogen headline-totaal', () => {
    const groups = computeAssetsByType(ASSETS)
    const sum = groups.reduce((s, g) => s + g.value, 0)
    expect(sum).toBeCloseTo(weightedTotal, 6) // 315.000
    // En bewijs dat de OUDE (ongewogen) breakdown NIET klopte met het headline.
    expect(weightedTotal).not.toBeCloseTo(UNWEIGHTED_TOTAL, 6)
  })

  it('keeps expectedReturn a correct ratio (weging valt weg in teller én noemer)', () => {
    const groups = computeAssetsByType([INVESTMENT, HOUSE])
    const byType = Object.fromEntries(groups.map(g => [g.type, g]))
    // Eén belegging op 100% → expectedReturn == asset-return (7% = 0,07).
    expect(byType.investment.expectedReturn).toBeCloseTo(0.07, 6)
    // Eén huis op 50% → expectedReturn == asset-return (2% = 0,02), factor cancelt weg.
    expect(byType.real_estate.expectedReturn).toBeCloseTo(0.02, 6)
  })

  // Kaart H1 — "Verwacht rendement 665,5%". `assets.expected_return` staat in de
  // DB als HEEL PERCENTAGE (7 = 7%), `profiles.expected_return` als fractie
  // (0,07). Deze helper leverde de percent-schaal ONGEDEELD door, waarna de
  // widgets er nóg eens ×100 overheen deden → 100× te hoog op /overzicht.
  it('normaliseert de percent-schaal van assets.expected_return naar een 0..1-fractie', () => {
    const groups = computeAssetsByType([INVESTMENT])
    expect(groups[0].expectedReturn).toBeLessThan(1)
    expect(groups[0].expectedReturn).toBeCloseTo(0.07, 10)
  })

  it('sorts groups by weighted value descending', () => {
    const groups = computeAssetsByType(ASSETS)
    const values = groups.map(g => g.value)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })
})

describe('dashboard-wealth-weighting — weightedExpectedReturn (W3)', () => {
  // Zoals data.assetsByType in de bundel: expectedReturn als 0..1-factor.
  // BEWUST via computeAssetsByType afgeleid uit ruwe rijen op percent-schaal —
  // precies het pad dat de loader loopt (dashboard-data-loader.ts:587). Een
  // losstaande, met de hand verzonnen fractie-fixture liet kaart H1 (100×-fout)
  // ongezien passeren omdat ze de schaalconversie oversloeg.
  const GROUP_ROWS: WeightableAssetRow[] = [
    { asset_type: 'investment', current_value: 60_000, purchase_value: 50_000, expected_return: 7 },
    { asset_type: 'crypto', current_value: 40_000, purchase_value: 40_000, expected_return: 0 },
    { asset_type: 'cash', current_value: 25_000, purchase_value: 25_000, expected_return: 0 },
  ]
  const GROUPS = computeAssetsByType(GROUP_ROWS)

  it('weegt op waarde binnen de opgegeven scope (beleggingsportefeuille)', () => {
    // (60k*0,07 + 40k*0) / 100k = 4,2%. Cash valt buiten de scope.
    expect(weightedExpectedReturn(GROUPS, INVESTMENT_ASSET_TYPES)).toBeCloseTo(0.042, 10)
  })

  it('zonder scope weegt over alle groepen (cash verwatert het rendement)', () => {
    // (60k*0,07) / 125k = 3,36%.
    expect(weightedExpectedReturn(GROUPS)).toBeCloseTo(0.0336, 10)
  })

  it('levert 0 bij lege of waardeloze scope (aanroeper vangt lege portefeuille af)', () => {
    expect(weightedExpectedReturn([], INVESTMENT_ASSET_TYPES)).toBe(0)
    expect(weightedExpectedReturn([{ type: 'cash', value: 25_000, expectedReturn: 0 }], INVESTMENT_ASSET_TYPES)).toBe(0)
  })

  // Kaart H1 — regressie op het VOLLEDIGE weergavepad: ruwe rijen (percent-schaal)
  // → computeAssetsByType → weightedExpectedReturn → de widget-formule
  // (`portfolioReturn * 100`, fire-prognose-widget.tsx / beleggingsrendement-widget.tsx).
  // Voorheen: 666,7%. Een jaarrendement boven de 100% is per definitie een
  // schaalfout, geen getal om te tonen — dat is wat deze assert bewaakt.
  it('REGRESSIE H1: de widget-weergaveformule blijft in een realistische range', () => {
    const rows: WeightableAssetRow[] = [
      { asset_type: 'investment', current_value: 60_000, expected_return: 7 },
      { asset_type: 'retirement', current_value: 40_000, expected_return: 6 },
    ]
    const portfolioReturn = weightedExpectedReturn(computeAssetsByType(rows), INVESTMENT_ASSET_TYPES)
    const displayed = portfolioReturn * 100 // exact wat de widgets renderen
    expect(displayed).toBeCloseTo(6.6, 6) // (60k×7% + 40k×6%) / 100k
    expect(displayed).toBeGreaterThan(0)
    expect(displayed).toBeLessThan(100)
  })
})

describe('dashboard-wealth-weighting — computeLiquidPot (Punt 2 grondslag)', () => {
  it('excludes non-liquid assets (house/investment) from the runway pot', () => {
    const pot = computeLiquidPot(ASSETS, 0)
    // Alleen savings (50%: 10k) + cash (100%: 5k) = 15k. Huis + belegging tellen NIET mee.
    expect(pot).toBe(15_000)
  })

  it('weights shared liquid accounts by inclusion_pct', () => {
    // Spaarrekening op 50% telt maar voor de helft mee.
    expect(computeLiquidPot([SHARED_SAVINGS], 0)).toBe(10_000)
  })

  it('adds unlinked cash (legacy bank accounts) at 100%', () => {
    expect(computeLiquidPot([CASH], 2_500)).toBe(7_500)
  })
})

describe('dashboard-wealth-weighting — top-level monthsCovered (Punt 2)', () => {
  it('runway telt het niet-liquide huis NIET mee', () => {
    const liquidPot = computeLiquidPot(ASSETS, 0) // 15.000
    const monthlyExpenses = 3_000
    // Op liquide pot: 15.000 / 3.000 = 5 maanden.
    expect(monthsCoveredFrom(liquidPot, monthlyExpenses)).toBe(5)

    // Ter contrast: op vol (gewogen) netto vermogen zou dit fors overschatten.
    const grossMonths = monthsCoveredFrom(weightedTotal, monthlyExpenses) // 315k/3k = 105
    expect(grossMonths).toBeGreaterThan(100)
  })

  it('returns 0 when monthly expenses are zero or negative', () => {
    expect(monthsCoveredFrom(50_000, 0)).toBe(0)
    expect(monthsCoveredFrom(50_000, -100)).toBe(0)
  })
})

describe('computeSovereigntyLevel — runway op liquide pot (huis telt niet)', () => {
  const monthlyExpenses = 3_000
  const liquidPot = computeLiquidPot(ASSETS, 0) // 15.000 → 5 maanden buffer
  // netWorth incl. huis (gewogen), minus een 50%-hypotheek van 350k → 175k.
  const netWorth = weightedTotal - 175_000 // 315k - 175k = 140k (ruim positief)

  it('homeowner: level volgt de liquide buffer (5 mnd), niet het vol vermogen', () => {
    // Nieuwe grondslag: monthsCovered = 15k/3k = 5 (>=3, <6), freedomPct laag → level 2.
    const level = computeSovereigntyLevel(netWorth, monthlyExpenses, 5, false, liquidPot)
    expect(level).toBe(2)
  })

  it('zou zónder liquide-pot-grondslag een te hoog niveau geven (regressie-anker)', () => {
    // Oude grondslag (4 args → runwayNetWorth valt terug op netWorth = 140k):
    // 140k/3k ≈ 46 maanden buffer → level 2 op buffer, maar freedomPct duwt hoger.
    // Met freedomPct 30 (momentum) zou de OUDE som level 4 geven, de nieuwe niet.
    const oldLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, 30, false)
    const newLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, 30, false, liquidPot)
    // Oud: 46 mnd buffer + 30% freedom → level 4. Nieuw: buffer haalt de 6-mnd-tier
    // niet (5 mnd) → geblokkeerd op level 2 ondanks 30% freedom.
    expect(oldLevel).toBe(4)
    expect(newLevel).toBe(2)
    expect(newLevel).toBeLessThan(oldLevel)
  })

  it('negatief vermogen blijft recovery, ongeacht de liquide pot', () => {
    // Zelfs met een gevulde liquide pot: negatief netto vermogen → recovery.
    expect(computeSovereigntyLevel(-5_000, monthlyExpenses, 0, false, 30_000)).toBe(-1)
    expect(computeSovereigntyLevel(-5_000, monthlyExpenses, 0, true, 30_000)).toBe(-2)
  })

  it('backward-compat: zonder 5e arg identiek aan de netWorth-grondslag', () => {
    expect(computeSovereigntyLevel(8_000, 2_000, 5, false)).toBe(
      computeSovereigntyLevel(8_000, 2_000, 5, false, 8_000),
    )
  })
})
