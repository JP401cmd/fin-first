import { describe, expect, it } from 'vitest'
import {
  buildFeeSimInput,
  computeFeeImpactOnFire,
  computeFeeOverHorizon,
  computePortfolioFees,
  computeTotalAnnualFee,
  formatFeeImpactMessage,
  type FeeAnalysis,
  type FeeImpact,
  type FeeSimParams,
} from '@/lib/fee-analysis'
import { DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'

/**
 * Formule-vangrail voor `lib/fee-analysis.ts` (catalogus-entry `portfolio-fees`),
 * aanvullend op `fee-analysis-flag.test.ts` (kernel-A/B) en
 * `fee-analysis-severity.test.ts` (TER-drempels + gating). Hier: de pure
 * rekenkern — gewogen TER met alle randen, de compound-kostenformule, de
 * synthetische kernel-input en de tekstlaag. Geen motorwijziging.
 */

const SIM_PARAMS: FeeSimParams = {
  currentAge: 40,
  endAge: 90,
  currentPortfolio: 300_000,
  yearlyExpenses: 30_000,
  annualSavings: 24_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3',
  inflation: 0.02,
  cashflows: [],
}

describe('computePortfolioFees — randen', () => {
  it('lege portefeuille → alles nul, geen breakdown', () => {
    const a = computePortfolioFees([])
    expect(a).toEqual<FeeAnalysis>({
      weightedTER: 0,
      totalAnnualFee: 0,
      perHoldingBreakdown: [],
      totalPortfolioValue: 0,
      holdingsWithTER: 0,
      holdingsWithoutTER: 0,
    })
  })

  it('holdings met waarde ≤ 0 worden overgeslagen (tellen nergens in mee)', () => {
    const a = computePortfolioFees([
      { name: 'Leeg', units: 0, current_price: 100, avg_purchase_price: 100, ter: 0.01 },
      { name: 'Negatief', units: 1, current_price: -5, avg_purchase_price: 10, ter: 0.01 },
      { name: 'Echt', units: 10, current_price: 100, avg_purchase_price: 90, ter: 0.002 },
    ])
    expect(a.perHoldingBreakdown.map((h) => h.name)).toEqual(['Echt'])
    expect(a.totalPortfolioValue).toBe(1_000)
    expect(a.holdingsWithTER).toBe(1)
    expect(a.holdingsWithoutTER).toBe(0)
  })

  it('zonder koers valt de waardering terug op de gemiddelde aankoopprijs', () => {
    const a = computePortfolioFees([{ name: 'Geen koers', units: 4, current_price: null, avg_purchase_price: 25, ter: 0.005 }])
    expect(a.totalPortfolioValue).toBe(100)
    expect(a.totalAnnualFee).toBeCloseTo(0.5, 10)
  })

  it('TER null, 0 of negatief → behandeld als 0% en geteld als "zonder TER"', () => {
    const a = computePortfolioFees([
      { name: 'Null', units: 1, current_price: 1_000, avg_purchase_price: 1_000, ter: null },
      { name: 'Nul', units: 1, current_price: 1_000, avg_purchase_price: 1_000, ter: 0 },
      { name: 'Negatief', units: 1, current_price: 1_000, avg_purchase_price: 1_000, ter: -0.01 },
      { name: 'Ontbreekt', units: 1, current_price: 1_000, avg_purchase_price: 1_000 },
    ])
    expect(a.holdingsWithoutTER).toBe(4)
    expect(a.holdingsWithTER).toBe(0)
    expect(a.weightedTER).toBe(0)
    expect(a.totalAnnualFee).toBe(0)
    expect(a.perHoldingBreakdown.every((h) => h.ter === 0 && h.annualFee === 0 && h.percentOfTotalFees === 0)).toBe(true)
  })

  it('gewogen TER = Σ(ter×waarde)/Σwaarde en de fee-aandelen sommeren tot 1, duurste eerst', () => {
    const a = computePortfolioFees([
      { name: 'A', units: 2, current_price: 5_000, avg_purchase_price: 4_000, ter: 0.001 }, // 10k → fee 10
      { name: 'B', units: 1, current_price: 20_000, avg_purchase_price: 15_000, ter: 0.004 }, // 20k → fee 80
      { name: 'C', units: 1, current_price: 10_000, avg_purchase_price: 10_000 }, // 10k → fee 0
    ])
    expect(a.totalPortfolioValue).toBe(40_000)
    expect(a.totalAnnualFee).toBeCloseTo(90, 10)
    expect(a.weightedTER).toBeCloseTo(90 / 40_000, 12)
    expect(a.perHoldingBreakdown.map((h) => h.name)).toEqual(['B', 'A', 'C'])
    expect(a.perHoldingBreakdown.map((h) => h.percentOfTotalFees)).toEqual([80 / 90, 10 / 90, 0])
    expect(a.perHoldingBreakdown.reduce((s, h) => s + h.percentOfTotalFees, 0)).toBeCloseTo(1, 12)
    expect(a.perHoldingBreakdown[0].ticker).toBeNull()
  })
})

describe('computeTotalAnnualFee', () => {
  it('is exact de totalAnnualFee van computePortfolioFees op dezelfde invoer (incl. overgeslagen holdings)', () => {
    const holdings = [
      { name: 'A', units: 3, current_price: 100, avg_purchase_price: 80, ter: 0.0022 },
      { name: 'B', units: 0, current_price: 100, avg_purchase_price: 80, ter: 0.05 }, // waarde 0 → overgeslagen
      { name: 'C', units: 5, current_price: null, avg_purchase_price: 40, ter: null },
      { name: 'D', units: 1, current_price: 2_000, avg_purchase_price: 1_000, ter: 0.0075 },
    ]
    expect(computeTotalAnnualFee(holdings)).toBeCloseTo(computePortfolioFees(holdings).totalAnnualFee, 12)
    expect(computeTotalAnnualFee(holdings)).toBeCloseTo(300 * 0.0022 + 2_000 * 0.0075, 12)
    expect(computeTotalAnnualFee([])).toBe(0)
  })
})

describe('computeFeeOverHorizon — samengestelde kosten', () => {
  it('= fee × ((1+r)^n − 1)/r, gelijk aan de som Σ_{k=0}^{n−1} fee×(1+r)^k', () => {
    const fee = 100
    const r = 0.07
    const n = 10
    const closed = fee * (Math.pow(1 + r, n) - 1) / r
    let sum = 0
    for (let k = 0; k < n; k++) sum += fee * Math.pow(1 + r, k)
    expect(computeFeeOverHorizon(fee, n, r)).toBeCloseTo(closed, 8)
    expect(computeFeeOverHorizon(fee, n, r)).toBeCloseTo(sum, 8)
    expect(computeFeeOverHorizon(fee, n, r)).toBeCloseTo(1381.6448, 3)
  })

  it('rendement 0 → lineair fee × jaren', () => {
    expect(computeFeeOverHorizon(100, 10, 0)).toBe(1_000)
  })

  it('één jaar → precies de jaarfee; fee ≤ 0 of jaren ≤ 0 → 0', () => {
    expect(computeFeeOverHorizon(100, 1, 0.07)).toBeCloseTo(100, 10)
    expect(computeFeeOverHorizon(0, 10, 0.07)).toBe(0)
    expect(computeFeeOverHorizon(-5, 10, 0.07)).toBe(0)
    expect(computeFeeOverHorizon(100, 0, 0.07)).toBe(0)
    expect(computeFeeOverHorizon(100, -3, 0.07)).toBe(0)
  })

  it('stijgt strikt met de horizon', () => {
    let prev = 0
    for (const n of [1, 5, 10, 25, 50]) {
      const v = computeFeeOverHorizon(100, n, 0.05)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })
})

describe('buildFeeSimInput — synthetische één-pot-input', () => {
  it('zet de effectieve return als asset-% (decimaal × 100) én als grossReturn (decimaal)', () => {
    const input = buildFeeSimInput(SIM_PARAMS, 0.065)
    expect(input.assets).toHaveLength(1)
    expect(input.assets[0].expected_return).toBeCloseTo(6.5, 10)
    expect(input.grossReturn).toBe(0.065)
    expect(input.assets[0].current_value).toBe(300_000)
    expect(input.assets[0].is_liquid).toBe(true)
    expect(input.assets[0].monthly_contribution).toBe(0)
    expect(input.debts).toEqual([])
  })

  it('leidt inkomen en surplus af uit uitgaven + besparing (spaarquote-grondslag)', () => {
    const input = buildFeeSimInput(SIM_PARAMS, 0.07)
    expect(input.monthlyIncome).toBe((30_000 + 24_000) / 12)
    expect(input.monthlySurplus).toBe(24_000 / 12)
    expect(input.annualSavings).toBe(24_000)
    expect(input.yearlyExpenses).toBe(30_000)
    expect(input.inflationRate).toBe(0.02)
    expect(input.incomeGrowthRate).toBe(0)
    expect(input.box3Method).toBe('forfaitair')
    expect(input.hasPartner).toBe(false)
  })

  it('endAge volgt de strategie (default: DEFAULT_FIRE_STRATEGY met simParams.endAge)', () => {
    expect(buildFeeSimInput(SIM_PARAMS, 0.07).endAge).toBe(90)
    expect(buildFeeSimInput(SIM_PARAMS, 0.07).strategyConfig).toEqual({ ...DEFAULT_FIRE_STRATEGY, endAge: 90 })
    const custom = buildFeeSimInput({ ...SIM_PARAMS, strategyConfig: { ...DEFAULT_FIRE_STRATEGY, endAge: 85 } }, 0.07)
    expect(custom.endAge).toBe(85)
  })

  it('negatief portfolio wordt op 0 geklemd', () => {
    const input = buildFeeSimInput({ ...SIM_PARAMS, currentPortfolio: -10_000 }, 0.07)
    expect(input.assets[0].current_value).toBe(0)
    expect(input.assets[0].purchase_value).toBe(0)
  })
})

describe('computeFeeImpactOnFire — euro-impact los van de kernel', () => {
  it('feeImpactEuros = computeFeeOverHorizon(TER × portfolio, endAge − currentAge, grossReturn), ook zonder tijdas', () => {
    const ter = 0.005
    const impact = computeFeeImpactOnFire(SIM_PARAMS, ter)
    const expected = computeFeeOverHorizon(ter * 300_000, 90 - 40, 0.07)
    expect(impact.feeImpactEuros).toBeCloseTo(expected, 8)
    expect(impact.feeImpactMonths).toBe(0)
    expect(impact.bothReachable).toBe(false)
  })

  it('TER 0 → geen euro-impact', () => {
    expect(computeFeeImpactOnFire(SIM_PARAMS, 0).feeImpactEuros).toBe(0)
  })
})

describe('formatFeeImpactMessage', () => {
  const analysis: FeeAnalysis = {
    weightedTER: 0.0032,
    totalAnnualFee: 80,
    perHoldingBreakdown: [],
    totalPortfolioValue: 25_000,
    holdingsWithTER: 2,
    holdingsWithoutTER: 1,
  }
  const impact = (over: Partial<FeeImpact>): FeeImpact => ({
    fireAgeWithoutFees: 55,
    fireAgeWithFees: 56,
    feeImpactMonths: 0,
    feeImpactEuros: 0,
    bothReachable: true,
    ...over,
  })

  it('basiszin: jaarfee + gewogen TER in nl-NL (komma, twee decimalen)', () => {
    expect(formatFeeImpactMessage(analysis)).toMatch(/^Je fondsen kosten je €\s?80 per jaar \(0,32% gewogen TER\)\.$/)
  })

  it('met euro-impact > 0 → "mis je … aan rendement"', () => {
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactEuros: 18_200 })))
      .toMatch(/Over de horizon mis je €\s?18\.200 aan rendement\./)
  })

  it('maanden-impact met jaren/maanden-grammatica', () => {
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 1 }))).toContain('vertragen je FIRE met 1 maand.')
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 8 }))).toContain('vertragen je FIRE met 8 maanden.')
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 12 }))).toContain('vertragen je FIRE met 1 jaar.')
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 14 }))).toContain('vertragen je FIRE met 1 jaar en 2 maanden.')
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 25 }))).toContain('vertragen je FIRE met 2 jaar en 1 maand.')
  })

  it('0 maanden én beide bereikbaar → "geen meetbaar effect"; 0 maanden onbereikbaar → geen FIRE-zin', () => {
    expect(formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 0, bothReachable: true })))
      .toContain('Fondskosten hebben geen meetbaar effect op je FIRE-datum.')
    const unreachable = formatFeeImpactMessage(analysis, impact({ feeImpactMonths: 0, bothReachable: false }))
    expect(unreachable).not.toContain('FIRE')
  })
})
