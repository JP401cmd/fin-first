import { describe, it, expect } from 'vitest'
import type {
  AssetBucketDetail,
  UnifiedProjectionRow,
  WithdrawalNeedBreakdown,
} from '@/lib/unified-projection'
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
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
    nettoLiquide: 0,
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
  it('levert altijd 4 assen in vaste volgorde (marktrisico verwijderd tot er een solide bron is)', () => {
    const radar = computeDekkingsradar(baseInput())
    expect(radar.map((a) => a.key)).toEqual([
      'brug-tot-aow',
      'pensioeninkomen',
      'wonen',
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

  it('stop op/na AOW → geen brugperiode nodig → 100 (groen) met uitleg', () => {
    // Given een stopleeftijd op of ná de AOW-leeftijd, When de as berekend wordt,
    // Then is er niets te overbruggen → volledig gedekt (100), niet "niet bepaalbaar".
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(68)], fireAgeFractional: 68, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
    expect(a.detail).toMatch(/geen brugperiode/i)
  })

  it('geen eigen brug-behoefte (Σ totaalNeed ≤ 0, bv. partner dekt alles) → 100 met uitleg', () => {
    const rows = [makeRow(55, { withdrawalNeed: need(0) }), makeRow(60, { withdrawalNeed: need(0) })]
    const a = ax(computeDekkingsradar(baseInput({ rows, fireAgeFractional: 55, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
    expect(a.detail).toMatch(/brug-behoefte/i)
  })

  it('uitschieter wordt op 200 gecapt (presentatie, zoals eindstrategie)', () => {
    // Eén brugjaar met kleine behoefte en een grote pot → rauwe ratio ~1300%.
    const rows = [makeRow(66, { assetBuckets: { investment: bucket(260_000) }, withdrawalNeed: need(20_000) })]
    const a = ax(computeDekkingsradar(baseInput({ rows, fireAgeFractional: 66, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBe(200)
    expect(a.status).toBe('groen')
  })

  it('FIRE onbereikbaar (null) → null, mét reden in detail', () => {
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(60)], fireAgeFractional: null })), 'brug-tot-aow')
    expect(a.pct).toBeNull()
    expect(a.detail).toMatch(/niet bereikbaar/i)
  })

  it('leeg brugvenster (geen rijen tussen stop en AOW) → null, géén vals groen 100', () => {
    // Given alleen rijen buiten [stop, AOW), When de as berekend wordt, Then valt er
    // niets te meten — dat is n.v.t. mét reden, niet "behoefte gedekt".
    const a = ax(computeDekkingsradar(baseInput({ rows: [makeRow(70)], fireAgeFractional: 55, aowAgeFractional: 67 })), 'brug-tot-aow')
    expect(a.pct).toBeNull()
    expect(a.detail).toMatch(/geen jaren tussen/i)
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

  it('stop ná AOW → venster start op de stopleeftijd; werkjaren tellen niet mee', () => {
    // Given een doelscenario met stop 75 (> AOW 67), When de as berekend wordt,
    // Then middelt hij alléén de rijen vanaf 75 — de accumulation-rijen 67–74
    // (dekking ≥ 100 door het spaarquote-effect) vertekenen het pensioenbeeld niet.
    const rows = [
      makeRow(70, { phase: 'accumulation', grossIncome: 60_000, savings: 20_000 }), // dekking 150
      makeRow(76, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 21_000 } }), // dekking 70
    ]
    const a = ax(computeDekkingsradar(baseInput({ rows, fireAgeFractional: 75, aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBe(70)
    expect(a.status).toBe('rood')
    expect(a.detail).toMatch(/stopleeftijd/i)
  })

  it('stop ná AOW zonder rijen ná de stop → null met reden', () => {
    const rows = [makeRow(70, { phase: 'accumulation', grossIncome: 60_000, savings: 20_000 })]
    const a = ax(computeDekkingsradar(baseInput({ rows, fireAgeFractional: 75, aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBeNull()
  })

  it('status volgt het afgeronde percentage (99,5 → "100%" → groen, geen amber-100)', () => {
    // Twee rijen met dekking 100 en 99 → rauw gemiddelde 99,5; de badge toont het
    // afgeronde "100%", dus de status moet daar ook bij horen (groen).
    const rows = [
      makeRow(67, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 30_000 } }),
      makeRow(70, { withdrawalNeed: need(30_000), grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 29_700 } }),
    ]
    const a = ax(computeDekkingsradar(baseInput({ rows, aowAgeFractional: 67 })), 'pensioeninkomen')
    expect(a.pct).toBe(100)
    expect(a.status).toBe('groen')
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
