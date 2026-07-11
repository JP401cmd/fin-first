import { describe, it, expect } from 'vitest'
import type {
  AssetBucketDetail,
  UnifiedProjectionRow,
  WithdrawalNeedBreakdown,
} from '@/lib/unified-projection'
import type { MonteCarloResult } from '@/lib/horizon-data'
import { computeDekkingsradar, type DekkingsradarInput, type RadarAsKey } from './dekkingsradar'

function bucket(endValue: number): AssetBucketDetail {
  return { startValue: endValue, growth: 0, contributions: 0, box3Drag: 0, endValue }
}

function need(totaal: number): WithdrawalNeedBreakdown {
  return {
    uitgaveTerm: totaal,
    huurNaVerkoop: 0,
    vervallenHypotheeklast: 0,
    box3: 0,
    partnerBijdrage: 0,
    totaalNeed: totaal,
    restMaandClamp: 0,
    nietGedekt: 0,
  }
}

function makeRow(age: number, extra: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: age - 40,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
    ...extra,
  }
}

function baseInput(over: Partial<DekkingsradarInput> = {}): DekkingsradarInput {
  return {
    rows: [],
    mcResult: null,
    currentAge: 40,
    fireAgeFractional: 55,
    aowAgeFractional: 67,
    requiredFirePortfolio: 250_000,
    targetEndPortfolio: null,
    endStrategy: 'deplete',
    housingStrategy: { mode: 'include_full' },
    hasEigenHuis: false,
    kernelHousingSale: null,
    jaarBesteding: 40_000,
    ...over,
  }
}

const ax = (radar: ReturnType<typeof computeDekkingsradar>, key: RadarAsKey) => radar.find((a) => a.key === key)!

describe('computeDekkingsradar — vorm', () => {
  it('levert altijd 5 assen in vaste volgorde', () => {
    const radar = computeDekkingsradar(baseInput())
    expect(radar.map((a) => a.key)).toEqual([
      'brug-tot-aow',
      'pensioeninkomen',
      'wonen',
      'marktrisico',
      'eindstrategie',
    ])
  })
})

describe('as: brug-tot-aow', () => {
  it('happy — belegbaar@FIRE ÷ Σ behoefte-brug × 100', () => {
    const rows: UnifiedProjectionRow[] = []
    for (let age = 55; age <= 66; age++) {
      rows.push(makeRow(age, {
        assetBuckets: age === 55 ? { investment: bucket(260_000) } : {},
        withdrawalNeed: need(20_000),
      }))
    }
    // 12 brugjaren × 20k = 240k behoefte; belegbaar@55 = 260k → 108% → groen.
    const a = ax(computeDekkingsradar(baseInput({ rows, fireAgeFractional: 55, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBe(108)
    expect(a.status).toBe('groen')
  })

  it('FIRE ≥ AOW → geen brug (null)', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(68)], fireAgeFractional: 68, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBeNull()
    expect(a.status).toBeNull()
    expect(a.detail).toMatch(/geen brug/i)
  })

  it('FIRE onbereikbaar (null) → null', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(60)], fireAgeFractional: null })), 'brug-tot-aow')
    expect(a.pct).toBeNull()
  })
})

describe('as: pensioeninkomen', () => {
  it('happy — gemiddelde dekkingsgraad over post-AOW-rijen', () => {
    // Belegbaar 0 (lege buckets) → veiligeOnttrekking 0 → dekking = gebeurtenisBaten/behoefte.
    const rows = [
      makeRow(67, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 30_000 } }),
      makeRow(70, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 30_000 } }),
    ]
    const a = ax(computeDekkingsradar(baseInput({ rows, aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
  })

  it('krappe dekking → amber', () => {
    const rows = [makeRow(67, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 27_000 } })]
    const a = ax(computeDekkingsradar(baseInput({ rows, aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBe(90)
    expect(a.status).toBe('amber')
  })

  it('geen post-AOW-rijen → null', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(60)], aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBeNull()
  })
})

describe('as: wonen', () => {
  it('geen eigen huis → null (n.v.t.)', () => {
    const a = ax(computeDekkingsradar(baseInput({ hasEigenHuis: false })), 'wonen')
    expect(a.pct).toBeNull()
    expect(a.detail).toMatch(/niet van toepassing/i)
  })

  it('huis, geen verkoop → 100 (groen)', () => {
    const a = ax(computeDekkingsradar(baseInput({ hasEigenHuis: true, kernelHousingSale: null })), 'wonen')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
  })

  it('geplande downsize (fixed_age) → 95', () => {
    const a = ax(computeDekkingsradar(baseInput({
      hasEigenHuis: true,
      kernelHousingSale: { month: 300, age: 65, proceeds: 200_000 },
      housingStrategy: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 65, depletionThresholdYears: 0, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, saleValuationBasis: 'market' },
    })), 'wonen')
    expect(a.pct).toBe(95)
    expect(a.detail).toMatch(/geplande downsize op leeftijd 65/i)
  })

  it('noodverkoop (on_depletion) → 85', () => {
    const a = ax(computeDekkingsradar(baseInput({
      hasEigenHuis: true,
      kernelHousingSale: { month: 360, age: 70, proceeds: 180_000 },
      housingStrategy: { mode: 'downsize', trigger: 'on_depletion', triggerAge: 75, depletionThresholdYears: 0, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, saleValuationBasis: 'market' },
    })), 'wonen')
    expect(a.pct).toBe(85)
    expect(a.detail).toMatch(/afgedwongen/i)
  })
})

describe('as: marktrisico', () => {
  it('geen Monte-Carlo → null met hint', () => {
    const a = ax(computeDekkingsradar(baseInput({ mcResult: null })), 'marktrisico')
    expect(a.pct).toBeNull()
    expect(a.detail).toMatch(/monte-carlo-overlay aan/i)
  })

  it('happy — p10@FIRE ÷ benodigd × 100', () => {
    const p10 = Array.from({ length: 41 }, (_, i) => i * 20_000) // idx 15 = 300k
    const mc: MonteCarloResult = {
      simulations: 1000,
      years: 40,
      percentiles: { p10, p25: p10, p50: p10, p75: p10, p90: p10 },
      fireAges: [],
      fireProb: 0,
      p10FireAge: null,
      p50FireAge: null,
      p90FireAge: null,
    }
    // currentAge 40, fireAge 55 → idx 15 → p10 300k ÷ 250k = 120% → groen.
    const a = ax(computeDekkingsradar(baseInput({ mcResult: mc, currentAge: 40, fireAgeFractional: 55, requiredFirePortfolio: 250_000 })), 'marktrisico')
    expect(a.pct).toBe(120)
    expect(a.status).toBe('groen')
  })

  it('requiredFirePortfolio 0 → null', () => {
    const p10 = [100_000]
    const mc: MonteCarloResult = {
      simulations: 1, years: 0, percentiles: { p10, p25: p10, p50: p10, p75: p10, p90: p10 },
      fireAges: [], fireProb: 0, p10FireAge: null, p50FireAge: null, p90FireAge: null,
    }
    const a = ax(computeDekkingsradar(baseInput({ mcResult: mc, requiredFirePortfolio: 0 })), 'marktrisico')
    expect(a.pct).toBeNull()
  })
})

describe('as: eindstrategie', () => {
  it('deplete met restvermogen → 100+ (groen)', () => {
    // eind 50k, jaarBesteding 40k → +12.5 punten → 113 → groen.
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(90, { netWorth: 50_000 })], endStrategy: 'deplete', jaarBesteding: 40_000 })), 'eindstrategie')
    expect(a.pct).toBe(113)
    expect(a.status).toBe('groen')
  })

  it('deplete met tekort → <100 naar rato', () => {
    // eind −80k, jaarBesteding 40k → −20 punten → 80 → rood (<90).
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(90, { netWorth: -80_000 })], endStrategy: 'deplete', jaarBesteding: 40_000 })), 'eindstrategie')
    expect(a.pct).toBe(80)
    expect(a.status).toBe('rood')
    expect(a.detail).toMatch(/tekort/i)
  })

  it('legacy met doel-eindvermogen → eind ÷ doel × 100', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(90, { netWorth: 120_000 })], endStrategy: 'legacy', targetEndPortfolio: 100_000 })), 'eindstrategie')
    expect(a.pct).toBe(120)
    expect(a.status).toBe('groen')
  })

  it('perpetual zonder doel → behoud t.o.v. de FIRE-pot', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(90, { netWorth: 250_000 })], endStrategy: 'perpetual', targetEndPortfolio: null, requiredFirePortfolio: 250_000 })), 'eindstrategie')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
  })

  it('lege rijen → null', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [] })), 'eindstrategie')
    expect(a.pct).toBeNull()
  })
})
