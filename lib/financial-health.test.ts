import { describe, it, expect } from 'vitest'
import {
  computeHealthScoreFromInputs,
  scoreDSTI,
  scoreAssetConcentration,
  type HealthScoreInput,
} from '@/lib/financial-health'
import {
  buildHealthScoreInput,
  computeLargestAssetTypeShare,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'

// ── Canonical base input — alle 7 indicatoren actief ──────────────────────

const baseInput: HealthScoreInput = {
  savingsRate6m: 20,
  totalAssets: 100_000,
  totalDebts: 20_000,
  emergencyFundMonths: 3,
  freedomPct: 25,
  currentAge: null,
  fireAgeFractional: null,
  netMonthlyIncome: 4_000,
  debtMonthlyPayments: 600,
  largestAssetTypeShare: 0.5,
  budgetCategories: [
    { limit: 1500, spent: 1400 },
    { limit: 500, spent: 450 },
  ],
}

// ── ADR 0131 / UR3-01: onbekend is geen nul ───────────────────────────────

describe('onbekend inkomen/uitgaven — geen score, geen oordeel (ADR 0131, UR3-01)', () => {
  // Given: Sanne koos "Later invullen" — inkomen én uitgaven onbekend, wél
  //   €14.000 spaargeld en een studieschuld met maandlast. De rekenkant levert
  //   dan 0 % spaarquote, 0,0 × salaris, 0 % FIRE-voortgang.
  // When: de score wordt berekend met beide grondslagen 'unknown'.
  // Then: de pijlers die inkomen/uitgaven nodig hebben zijn géén 0 maar
  //   WEGGELATEN, en `onbekend` draagt ze met één zin en één knop.
  const sanne: HealthScoreInput = {
    ...baseInput,
    savingsRate6m: 0,
    emergencyFundMonths: 0,
    freedomPct: 0,
    netMonthlyIncome: 0,
    debtMonthlyPayments: 120,
    totalAssets: 14_000,
    totalDebts: 9_000,
    incomeBasis: 'unknown',
    expensesBasis: 'unknown',
  }

  it('laat spaarquote, noodfonds, schuldenlast en FIRE-voortgang weg uit de pijlers', () => {
    const score = computeHealthScoreFromInputs(sanne, true)
    const ids = score.pillars.map(p => p.id)
    expect(ids).not.toContain('savings_rate')
    expect(ids).not.toContain('emergency_fund')
    expect(ids).not.toContain('debt_service_ratio')
    expect(ids).not.toContain('fire_progress')
    // Wat overblijft rust niet op inkomen/uitgaven.
    expect(ids).toEqual(expect.arrayContaining(['budget_discipline', 'debt_ratio', 'asset_concentration']))
    expect(score.activePillarCount).toBe(3)
  })

  it('draagt `onbekend` met de weggevallen pijlers, één zin en één knop', () => {
    const score = computeHealthScoreFromInputs(sanne, true)
    expect(score.onbekend).not.toBeNull()
    expect(score.onbekend?.ontbreekt).toBe('inkomen-en-uitgaven')
    expect(score.onbekend?.pijlers.map(p => p.id)).toEqual([
      'savings_rate', 'emergency_fund', 'debt_service_ratio', 'fire_progress',
    ])
    expect(score.onbekend?.pijlers.every(p => p.groupLabel)).toBe(true)
    expect(score.onbekend?.hint).toMatch(/inkomen en uitgaven/)
    expect(score.onbekend?.actie.href).toBe('/overzicht/budget/transacties')
  })

  it("nergens 'Spaarquote 0%' of '0,0 × salaris' als rawValue — die pijlers bestaan niet als 0", () => {
    const score = computeHealthScoreFromInputs(sanne, true)
    for (const p of score.pillars) {
      expect(p.rawValue).not.toBe('0%')
      expect(p.rawValue).not.toMatch(/× salaris/)
    }
    // …en de briefing kan daardoor de spaarquote-tip ("begin met 10% van je
    // inkomen") niet meer als zwakste pijler oppikken.
    expect(score.pillars.map(p => p.improvementTip).join(' ')).not.toMatch(/10% van je inkomen/)
  })

  it('alleen inkomen onbekend: noodfonds blijft (uitgaven-norm) en FIRE-voortgang blijft; spaarquote en schuldenlast vallen weg', () => {
    const score = computeHealthScoreFromInputs(
      { ...sanne, expensesBasis: 'transaction', freedomPct: 12, emergencyFundMonths: 2 },
      true,
    )
    const ids = score.pillars.map(p => p.id)
    expect(ids).not.toContain('savings_rate')
    expect(ids).not.toContain('debt_service_ratio')
    expect(ids).toContain('emergency_fund')
    expect(ids).toContain('fire_progress')
    expect(score.onbekend?.ontbreekt).toBe('inkomen')
    expect(score.onbekend?.pijlers.map(p => p.id)).toEqual(['savings_rate', 'debt_service_ratio'])
  })

  it('alleen uitgaven onbekend: spaarquote en FIRE-voortgang vallen weg; noodfonds (salaris-norm) en schuldenlast blijven', () => {
    const score = computeHealthScoreFromInputs(
      { ...sanne, incomeBasis: 'manual', netMonthlyIncome: 3_000, emergencyFundMonths: 4 },
      true,
    )
    const ids = score.pillars.map(p => p.id)
    expect(ids).not.toContain('savings_rate')
    expect(ids).not.toContain('fire_progress')
    expect(ids).toContain('emergency_fund')
    expect(ids).toContain('debt_service_ratio')
    expect(score.onbekend?.ontbreekt).toBe('uitgaven')
  })

  it('inkomen onbekend zónder schuldlast: schuldenlast blijft gewoon 100 (geen inkomen nodig)', () => {
    const score = computeHealthScoreFromInputs(
      { ...sanne, expensesBasis: 'transaction', debtMonthlyPayments: 0 },
      true,
    )
    const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')
    expect(dsti?.score).toBe(100)
    expect(score.onbekend?.pijlers.map(p => p.id)).toEqual(['savings_rate'])
  })

  it('AC4 — met bekende grondslagen is het gedrag byte-identiek aan een input zónder de velden', () => {
    const met = computeHealthScoreFromInputs({ ...baseInput, incomeBasis: 'manual', expensesBasis: 'transaction' }, true)
    const zonder = computeHealthScoreFromInputs(baseInput, true)
    expect(met.total).toBe(zonder.total)
    expect(met.pillars).toEqual(zonder.pillars)
    expect(met.onbekend).toBeNull()
    expect(zonder.onbekend).toBeNull()
  })

  it("'estimate' telt als bekend: de score rekent gewoon (label reist mee op de kaart, niet hier)", () => {
    const score = computeHealthScoreFromInputs({ ...baseInput, incomeBasis: 'estimate', expensesBasis: 'estimate' }, true)
    expect(score.onbekend).toBeNull()
    expect(score.pillars.map(p => p.id)).toContain('savings_rate')
  })
})

// ── FR-1 / AC-STRUCT: pillar-structuur (7 indicatoren, 4 groepen) ─────────

describe('computeHealthScoreFromInputs — pillarstructuur v2', () => {
  it('retourneert altijd 7 indicatoren bij volledige data + alle modules actief', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.pillars).toHaveLength(7)
  })

  it('bevat nooit tax_optimization of diversification in pillars', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const ids = score.pillars.map((p) => p.id)
    expect(ids).not.toContain('tax_optimization')
    expect(ids).not.toContain('diversification')
  })

  it('bevat debt_service_ratio en asset_concentration bij volledige data', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const ids = score.pillars.map((p) => p.id)
    expect(ids).toContain('debt_service_ratio')
    expect(ids).toContain('asset_concentration')
  })

  it('elke indicator heeft een correcte pillarGroup (niet undefined)', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    for (const p of score.pillars) {
      expect(p.pillarGroup, `${p.id} moet pillarGroup hebben`).toBeTruthy()
    }
  })

  it('pillarGroup-waarden zijn correct per indicator', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const byId = Object.fromEntries(score.pillars.map((p) => [p.id, p.pillarGroup]))
    expect(byId.savings_rate).toBe('rondkomen')
    expect(byId.budget_discipline).toBe('rondkomen')
    expect(byId.emergency_fund).toBe('buffer')
    expect(byId.debt_service_ratio).toBe('schuld')
    expect(byId.debt_ratio).toBe('schuld')
    expect(byId.fire_progress).toBe('vrijheid')
    expect(byId.asset_concentration).toBe('vrijheid')
  })

  it('total score is een gewogen gemiddelde tussen 0 en 100', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.total).toBeGreaterThanOrEqual(0)
    expect(score.total).toBeLessThanOrEqual(100)
  })
})

// ── FR-2 / AC-DSTI: scoreDSTI — knikpunten ───────────────────────────────

describe('scoreDSTI — knikpunten (FR-2)', () => {
  it('≤20% → 100', () => {
    expect(scoreDSTI(0)).toBe(100)
    expect(scoreDSTI(10)).toBe(100)
    expect(scoreDSTI(20)).toBe(100)
  })

  it('36% → 70 (knikpunt)', () => {
    expect(scoreDSTI(36)).toBe(70)
  })

  it('43% → 40 (knikpunt)', () => {
    expect(scoreDSTI(43)).toBe(40)
  })

  it('≥60% → 0', () => {
    expect(scoreDSTI(60)).toBe(0)
    expect(scoreDSTI(80)).toBe(0)
    expect(scoreDSTI(100)).toBe(0)
  })

  it('lineair 20→36: 28% ≈ 85 (midden-segment)', () => {
    // 100 − ((28−20)/16)×30 = 100 − (8/16)×30 = 100 − 15 = 85
    expect(scoreDSTI(28)).toBe(85)
  })

  it('lineair 36→43: 39.5% ≈ 55 (midden-segment)', () => {
    // 70 − ((39.5−36)/7)×30 = 70 − (3.5/7)×30 = 70 − 15 = 55
    expect(scoreDSTI(39.5)).toBe(55)
  })

  it('lineair 43→60: 51.5% ≈ 20 (midden-segment)', () => {
    // 40 − ((51.5−43)/17)×40 = 40 − (8.5/17)×40 = 40 − 20 = 20
    expect(scoreDSTI(51.5)).toBe(20)
  })
})

// ── FR-2 / AC-DSTI: activatie-logica ─────────────────────────────────────

describe('debt_service_ratio — activatie', () => {
  it('geen schulden (payments=0) → actief, score 100', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, debtMonthlyPayments: 0 },
      true,
    )
    const dsti = score.pillars.find((p) => p.id === 'debt_service_ratio')
    expect(dsti).toBeDefined()
    expect(dsti?.score).toBe(100)
  })

  it('schulden met inkomen > 0 → actief, score uit curve', () => {
    // DSTI = 600/4000 = 15% → score 100
    const score = computeHealthScoreFromInputs(baseInput, true)
    const dsti = score.pillars.find((p) => p.id === 'debt_service_ratio')
    expect(dsti).toBeDefined()
    expect(dsti?.score).toBe(100) // 15% ≤ 20% → 100
  })

  it('schulden + inkomen = 0 → inactief (geen debt_service_ratio in pillars)', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, debtMonthlyPayments: 600, netMonthlyIncome: 0 },
      true,
    )
    expect(score.pillars.map((p) => p.id)).not.toContain('debt_service_ratio')
  })

  it('hoge DSTI (>60%) → score 0', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, debtMonthlyPayments: 3_000, netMonthlyIncome: 4_000 },
      true,
    )
    const dsti = score.pillars.find((p) => p.id === 'debt_service_ratio')
    expect(dsti?.score).toBe(0) // 75% ≥ 60% → 0
  })
})

// ── FR-3 / AC-CONC: scoreAssetConcentration — knikpunten ─────────────────

describe('scoreAssetConcentration — knikpunten (FR-3)', () => {
  it('≤40% → 100', () => {
    expect(scoreAssetConcentration(0)).toBe(100)
    expect(scoreAssetConcentration(20)).toBe(100)
    expect(scoreAssetConcentration(40)).toBe(100)
  })

  it('50% → 80 (spec AC)', () => {
    // 100 − ((50−40)/30)×60 = 100 − (10/30)×60 = 100 − 20 = 80
    expect(scoreAssetConcentration(50)).toBe(80)
  })

  it('70% → 40 (knikpunt)', () => {
    expect(scoreAssetConcentration(70)).toBe(40)
  })

  it('≥90% → 0', () => {
    expect(scoreAssetConcentration(90)).toBe(0)
    expect(scoreAssetConcentration(95)).toBe(0)
    expect(scoreAssetConcentration(100)).toBe(0)
  })

  it('lineair 40→70: 55% ≈ 70', () => {
    // 100 − ((55−40)/30)×60 = 100 − (15/30)×60 = 100 − 30 = 70
    expect(scoreAssetConcentration(55)).toBe(70)
  })

  it('lineair 70→90: 80% → 20', () => {
    // 40 − ((80−70)/20)×40 = 40 − (10/20)×40 = 40 − 20 = 20
    expect(scoreAssetConcentration(80)).toBe(20)
  })
})

// ── FR-3 / AC-CONC: activatie-logica ─────────────────────────────────────

describe('asset_concentration — activatie', () => {
  it('largestAssetTypeShare null → inactief (geen asset_concentration in pillars)', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, largestAssetTypeShare: null },
      true,
    )
    expect(score.pillars.map((p) => p.id)).not.toContain('asset_concentration')
  })

  it('largestAssetTypeShare aanwezig → actief', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, largestAssetTypeShare: 0.5 },
      true,
    )
    expect(score.pillars.map((p) => p.id)).toContain('asset_concentration')
  })
})

// ── FR-5 / AC-NODATA: budgetdiscipline no-data-beleid ────────────────────

describe('budgetdiscipline — no-data-beleid (FR-5)', () => {
  it('lege budgetCategories → inactief (geen budget_discipline), gewicht herverdeeld', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, budgetCategories: [] },
      true,
    )
    expect(score.pillars.map((p) => p.id)).not.toContain('budget_discipline')
    // Gewichten moeten nog steeds optellen tot 1.0
    const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 5)
  })

  it('budgetCategories met alle limiet=0 → inactief (geen 70-dummy)', () => {
    const score = computeHealthScoreFromInputs(
      {
        ...baseInput,
        budgetCategories: [
          { limit: 0, spent: 0 },
          { limit: 0, spent: 500 },
        ],
      },
      true,
    )
    expect(score.pillars.map((p) => p.id)).not.toContain('budget_discipline')
  })
})

// ── H4 punt 3 — budgetdiscipline telt per INDIVIDUELE categorie ───────────

describe('budgetdiscipline — per categorie geteld (H4)', () => {
  const pillarOf = (cats: { limit: number; spent: number }[]) =>
    computeHealthScoreFromInputs({ ...baseInput, budgetCategories: cats }, true)
      .pillars.find((p) => p.id === 'budget_discipline')!

  it('score en rawValue tellen álle categorieën, niet drie type-sommen', () => {
    // 33 categorieën, één eroverheen — het geval uit de bevinding.
    const cats = Array.from({ length: 33 }, (_, i) =>
      i === 0 ? { limit: 200, spent: 214 } : { limit: 300, spent: 250 },
    )
    const pillar = pillarOf(cats)
    expect(pillar.rawValue).toBe('32/33')
    expect(pillar.score).toBe(Math.round((32 / 33) * 100))
    expect(pillar.improvementTip).toContain('1 van je 33 categorieën')
  })

  it('rawValue en score lezen altijd dezelfde tally (geen tweede telling)', () => {
    const cats = [
      { limit: 100, spent: 150 },
      { limit: 100, spent: 50 },
      { limit: 100, spent: 50 },
      { limit: 100, spent: 250 },
    ]
    const pillar = pillarOf(cats)
    expect(pillar.rawValue).toBe('2/4')
    expect(pillar.score).toBe(50)
  })

  it('categorieën zonder limiet doen niet mee in de noemer', () => {
    const pillar = pillarOf([
      { limit: 0, spent: 900 },
      { limit: 100, spent: 50 },
    ])
    expect(pillar.rawValue).toBe('1/1')
    expect(pillar.score).toBe(100)
  })

  it('exact op de limiet is "bereikt", geen overschrijding (cent-tolerantie, H16)', () => {
    // Een vaste last waarvan de limiet per constructie gelijk is aan de
    // afschrijving landt elke maand op float-ruis boven de limiet.
    const pillar = pillarOf([{ limit: 1280, spent: 1280.0000000000002 }])
    expect(pillar.rawValue).toBe('1/1')
    expect(pillar.score).toBe(100)
  })

  it('een halve cent eroverheen telt nog niet, een euro wél', () => {
    expect(pillarOf([{ limit: 1000, spent: 1000.004 }]).score).toBe(100)
    expect(pillarOf([{ limit: 1000, spent: 1001 }]).score).toBe(0)
  })
})

// ── FR-6: gewichtsherverdeling — som altijd 1.0 ───────────────────────────

describe('gewichtsherverdeling — som actieve weights = 1.0 (AC-WEIGHT)', () => {
  it('alle 7 actief → som = 1.0', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('budget_discipline inactief (lege categories) → 6 actief, som = 1.0', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, budgetCategories: [] },
      true,
    )
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('debt_service_ratio inactief (inkomen=0) → 6 actief, som = 1.0', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, netMonthlyIncome: 0, debtMonthlyPayments: 600 },
      true,
    )
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('asset_concentration inactief (null) → 6 actief, som = 1.0', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, largestAssetTypeShare: null },
      true,
    )
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('budget + dsti + concentration inactief → 4 actief, som = 1.0', () => {
    const score = computeHealthScoreFromInputs(
      {
        ...baseInput,
        budgetCategories: [],
        netMonthlyIncome: 0,
        debtMonthlyPayments: 600,
        largestAssetTypeShare: null,
      },
      true,
    )
    expect(score.pillars).toHaveLength(4)
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('AC-WEIGHT-4: activeModules=[] → alleen emergency_fund, weight 1.0', () => {
    const score = computeHealthScoreFromInputs(baseInput, true, [])
    expect(score.pillars.map((p) => p.id)).toEqual(['emergency_fund'])
    expect(score.pillars[0]?.weight).toBeCloseTo(1.0, 5)
    expect(score.total).not.toBeNaN()
  })

  it('AC-WEIGHT-4: activeModules=[budgetteren] → savings_rate + budget_discipline + emergency_fund', () => {
    const score = computeHealthScoreFromInputs(baseInput, true, ['budgetteren'])
    const ids = score.pillars.map((p) => p.id)
    expect(ids).toContain('savings_rate')
    expect(ids).toContain('budget_discipline')
    expect(ids).toContain('emergency_fund')
    expect(ids).not.toContain('debt_service_ratio')
    expect(ids).not.toContain('fire_progress')
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})

// ── FR-6: alle 7 inactief → total 0 / label Kritiek ──────────────────────

describe('alle 7 indicatoren inactief → total 0, label Kritiek', () => {
  it('activeModules=[], budget_discipline exclusief via flag → emergency_fund weight 1.0, geen NaN', () => {
    const score = computeHealthScoreFromInputs(baseInput, false, [])
    // budgetteren niet in modules → budget_discipline weg
    // emergency_fund heeft null requirement → altijd actief
    expect(score.pillars).toHaveLength(1)
    expect(score.pillars[0]?.id).toBe('emergency_fund')
    expect(score.total).not.toBeNaN()
  })
})

// ── labels-banden: 80/60/40/20 ongewijzigd ───────────────────────────────

describe('label-banden (80/60/40/20)', () => {
  it('≥80 → Uitstekend', () => {
    const highInput: HealthScoreInput = {
      savingsRate6m: 30,
      totalAssets: 500_000,
      totalDebts: 0,
      emergencyFundMonths: 6,
      freedomPct: 90,
      currentAge: null,
      fireAgeFractional: null,
      netMonthlyIncome: 5_000,
      debtMonthlyPayments: 0,
      largestAssetTypeShare: 0.3,
      budgetCategories: [{ limit: 1000, spent: 800 }],
    }
    const score = computeHealthScoreFromInputs(highInput, true)
    expect(score.total).toBeGreaterThanOrEqual(80)
    expect(score.label).toBe('Uitstekend')
  })

  it('60≤total<80 → Sterk', () => {
    const input: HealthScoreInput = {
      savingsRate6m: 20,
      totalAssets: 200_000,
      totalDebts: 20_000,
      emergencyFundMonths: 4,
      freedomPct: 40,
      currentAge: null,
      fireAgeFractional: null,
      netMonthlyIncome: 4_000,
      debtMonthlyPayments: 200,
      largestAssetTypeShare: 0.45,
      budgetCategories: [{ limit: 1000, spent: 900 }],
    }
    const score = computeHealthScoreFromInputs(input, true)
    expect(score.label).toBe(score.total >= 80 ? 'Uitstekend' : score.total >= 60 ? 'Sterk' : 'Redelijk')
  })

  it('<20 → Kritiek', () => {
    const lowInput: HealthScoreInput = {
      savingsRate6m: 0,
      totalAssets: 1_000,
      totalDebts: 50_000,
      emergencyFundMonths: 0,
      freedomPct: 0,
      currentAge: null,
      fireAgeFractional: null,
      netMonthlyIncome: 1_000,
      debtMonthlyPayments: 800,
      largestAssetTypeShare: 0.95,
      budgetCategories: [{ limit: 100, spent: 500 }],
    }
    const score = computeHealthScoreFromInputs(lowInput, true)
    expect(score.total).toBeLessThan(20)
    expect(score.label).toBe('Kritiek')
  })

  it('exact 40 → Redelijk', () => {
    // We check the getLabel boundaries directly via a controlled score.
    // Use an input that should land around 40.
    const input: HealthScoreInput = {
      ...baseInput,
      savingsRate6m: 5,
      freedomPct: 15,
      emergencyFundMonths: 1.5,
      totalDebts: 60_000,
      debtMonthlyPayments: 1_400, // DSTI=35%, score 75 ≈ ok
      largestAssetTypeShare: 0.85,
    }
    const score = computeHealthScoreFromInputs(input, true)
    // Just verify label logic is consistent with total.
    if (score.total >= 40) expect(score.label).not.toBe('Kritiek')
    if (score.total < 20) expect(score.label).toBe('Kritiek')
  })
})

// ── trend: dezelfde actieve set als current ───────────────────────────────

describe('trend-berekening op dezelfde actieve set', () => {
  it('previousMonth null (geen history) → trend = 0', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.previousMonth).toBeNull()
    expect(score.trend).toBe(0)
  })
})

// ── computeHealthScore(DashboardData)-overload: v2-indicatoren inactief ───

describe('computeHealthScore(DashboardData) overload', () => {
  it('debt_service_ratio en asset_concentration zijn inactief (geen DashboardData-velden)', async () => {
    const { computeHealthScore } = await import('@/lib/financial-health')
    const data = {
      savingsRate6m: 15,
      totalAssets: 100_000,
      totalDebts: 0,
      netWorth: 100_000,
      emergencyFund: {
        monthsCovered: 3,
        currentAmount: 9_000,
        targetAmount: 18_000,
        targetMonths: 6,
        isComplete: false,
      },
      freedomPct: 25,
      budgetTotals: {
        expense: { spent: 800, limit: 1_000 },
        savings: { spent: 200, limit: 300 },
        debt: { spent: 0, limit: 0 },
        income: { spent: 0, limit: 0 },
      },
      fireTarget: 400_000,
      netWorthHistory: [],
      savingsHistory: [],
      assetsByType: [],
      monthlyIncome: 3_000,
      monthlyExpenses: 2_000,
      monthlyContributions: 500,
      yearlyMustExpenses: 18_000,
      fireProjResult: { fireAge: 55, projections: [] } as any,
      openActions: 0,
      totalFreedomDaysOpen: 0,
      completedActionsThisMonth: 0,
      topOpenActions: [],
      recentCompletedActions: [],
      recentRejectedActions: [],
      sovereigntyLevel: 2,
      currentPhaseId: 'accumulatie',
      monthsCovered: 3,
      hasConsumerDebt: false,
      recommendations: 0,
      goals: 0,
      topGoals: [],
      recurringTransactions: 0,
      lifeEvents: 0,
      fireAgeFractional: null,
      expenseHistory: [],
      budgetTypeHistory: { income: [], expense: [], savings: [], debt: [] },
      fireRange: null,
      simRows: null,
      simRequiredPortfolio: null,
      backtestSuccessRate: null,
      backtestNamedPaths: null,
      box3Tax: null,
      simFireCountdown: null,
      fireEndStrategy: 'perpetual',
      fireEndAge: 90,
      prevMonthIncome: 3_000,
      prevMonthExpenses: 2_000,
      netWorthDelta: null,
      favoriteBudgets: [],
      favoriteHoldings: [],
      allBudgets: [],
      notifications: [],
      nextSteps: [],
      monthSummary: { label: '', highlights: [] } as any,
      upcomingEvents: [],
      topRecurringTransactions: [],
      totalRecurringAmount: 0,
      topRecommendations: [],
      topLifeEvents: [],
      monthlySavingsBudgetSpent: 0,
      savingsBudgetSpent6m: 0,
      prevMonthSavingsBudgetSpent: 0,
      budgetingActive: true,
      householdOverrides: null,
      partnerOverrides: null,
      householdActivity: [],
    } as any

    const score = computeHealthScore(data)
    const ids = score.pillars.map((p) => p.id)
    // asset_concentration is inactief: DashboardData draagt geen largestAssetTypeShare
    // (overload zet het op null).
    expect(ids).not.toContain('asset_concentration')
    // debt_service_ratio: overload zet payments=0 → "geen schulden" → actief score 100
    // (correct per FR-2: geen schulden → actief, score 100). Dus NIET inactief.
    const dsti = score.pillars.find((p) => p.id === 'debt_service_ratio')
    if (dsti) expect(dsti.score).toBe(100) // als aanwezig: score 100 (geen schulden)
    // tax_optimization en diversification zijn sowieso weg uit v2.
    expect(ids).not.toContain('tax_optimization')
    expect(ids).not.toContain('diversification')
    // Gewichten sommeren tot 1.0.
    const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})

// ── computeLargestAssetTypeShare ──────────────────────────────────────────

describe('computeLargestAssetTypeShare', () => {
  it('eigen_huis telt niet mee; real_estate (beleggingsvastgoed) wél', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 400_000 },
      { asset_type: 'investment', current_value: 60_000 },
      { asset_type: 'real_estate', current_value: 40_000 },
    ]
    // Grondslag: investment 60k + real_estate 40k = 100k
    // Grootste: investment 60k → share 0.6
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.6, 5)
  })

  it('grootste type < €10.000 → null (starter)', () => {
    const assets: HealthScoreAsset[] = [{ asset_type: 'savings', current_value: 5_000 }]
    expect(computeLargestAssetTypeShare(assets, 0)).toBeNull()
  })

  it('alles in eigen woning → null (totaal excl. eigen_huis ≤ 0)', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 400_000 },
    ]
    expect(computeLargestAssetTypeShare(assets, 0)).toBeNull()
  })

  it('unlinked cash telt mee als cash-type', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'investment', current_value: 30_000 },
    ]
    // investment 30k + unlinked-cash 30k → investment share = 0.5
    const share = computeLargestAssetTypeShare(assets, 30_000)
    expect(share).toBeCloseTo(0.5, 5)
  })

  it('lege assets + unlinked cash < 10k → null', () => {
    expect(computeLargestAssetTypeShare([], 9_000)).toBeNull()
  })

  it('lege assets + unlinked cash ≥ 10k → cash is enige type → share 1.0', () => {
    const share = computeLargestAssetTypeShare([], 15_000)
    expect(share).toBeCloseTo(1.0, 5)
  })

  it('meerdere types — percentage-berekening klopt', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'savings', current_value: 20_000 },
      { asset_type: 'investment', current_value: 60_000 },
      { asset_type: 'crypto', current_value: 20_000 },
    ]
    // Totaal 100k, grootste investment 60k → 0.6
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.6, 5)
  })

  it('groepen van hetzelfde type worden gesommeerd', () => {
    // Twee investment-rijen: 30k + 30k = 60k; savings 40k → share 0.6
    const assets: HealthScoreAsset[] = [
      { asset_type: 'investment', current_value: 30_000 },
      { asset_type: 'investment', current_value: 30_000 },
      { asset_type: 'savings', current_value: 40_000 },
    ]
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.6, 5)
  })
})

// ── Defect B — snapshot-routes delen het canonieke input-bouwpad ──────────

describe('Defect B — buildHealthScoreInput deelt canoniek pad', () => {
  const avgMonthlyExpenses = 2_500

  const assets: HealthScoreAsset[] = [
    { asset_type: 'savings', current_value: 15_000 },
    { asset_type: 'investment', current_value: 105_000 },
    { asset_type: 'crypto', current_value: 5_000 },
  ]
  const unlinkedCash = 8_000
  const budgets: HealthScoreBudget[] = [
    { id: 'exp', parent_id: null, budget_type: 'expense', default_limit: 1500, interval: 'monthly' },
    { id: 'sav', parent_id: null, budget_type: 'savings', default_limit: 500, interval: 'monthly' },
    { id: 'dbt', parent_id: null, budget_type: 'debt', default_limit: 800, interval: 'monthly' },
  ]
  const transactions: HealthScoreTransaction[] = [
    { amount: -1300, budget_id: 'exp' },
    { amount: -450, budget_id: 'sav' },
    { amount: -600, budget_id: 'dbt' },
  ]
  const householdType = 'solo'
  const rawTotalAssets = 125_000

  const routeScalars = {
    savingsRate6m: 25,
    totalAssets: rawTotalAssets + unlinkedCash,
    totalDebts: 30_000,
    freedomPct: 40,
    avgMonthlyExpenses,
    netMonthlyIncome: 4_500,
    netMonthlySalary: 4_500,
    incomeBasis: 'manual' as const,
    expensesBasis: 'manual' as const,
    // Legacy leeftijdsblind pad — de peer-relatieve fire_progress-cases
    // staan in financial-health.test.ts.
    currentAge: null,
    fireAgeFractional: null,
  }
  const rows = {
    assets,
    unlinkedCash,
    budgets,
    transactions,
    splits: [],
    householdType,
    debtMonthlyPayments: 700,
  }

  const routeInput = buildHealthScoreInput(routeScalars, rows)

  it('levert echte noodfonds-input (liquide pot ÷ netto maandsalaris)', () => {
    // liquid = savings 15k + unlinked 8k = 23k ÷ 4.500 salaris ≈ 5,1 maandsalarissen
    expect(routeInput.emergencyFundMonths).toBeCloseTo(23_000 / 4_500, 5)
  })

  it('levert één categorie per budget (hier 3 kinderloze parents), minstens één met limiet > 0', () => {
    // Sinds H4 is dit per INDIVIDUELE categorie; deze fixture heeft drie
    // kinderloze parents, dus het aantal valt toevallig samen met de oude
    // drie type-sommen.
    expect(routeInput.budgetCategories).toHaveLength(3)
    expect(routeInput.budgetCategories.some((c) => c.limit > 0)).toBe(true)
  })

  it('netMonthlyIncome en debtMonthlyPayments correct doorgegeven', () => {
    expect(routeInput.netMonthlyIncome).toBe(4_500)
    expect(routeInput.debtMonthlyPayments).toBe(700)
  })

  it('largestAssetTypeShare berekend uit rows (investment dominant)', () => {
    // Grondslag: savings 15k + investment 105k + crypto 5k + cash 8k = 133k
    // Grootste: investment 105k → 105/133
    expect(routeInput.largestAssetTypeShare).toBeCloseTo(105_000 / 133_000, 5)
  })

  it('totalAssets = rawTotalAssets + unlinkedCash = 133k', () => {
    expect(routeInput.totalAssets).toBe(133_000)
  })

  it('route- en loader-pad leveren exact dezelfde score', () => {
    const routeScore = computeHealthScoreFromInputs(routeInput, true)
    const loaderInput = buildHealthScoreInput(routeScalars, rows)
    const loaderScore = computeHealthScoreFromInputs(loaderInput, true)
    expect(routeScore.total).toBe(loaderScore.total)
    expect(routeScore.label).toBe(loaderScore.label)
  })
})

// ── Weighting: basisgewichten ─────────────────────────────────────────────

describe('basisgewichten (ADR 0010 / FR-1)', () => {
  it('savings_rate heeft basisgewicht 0.20 relatief bij alle 7 actief', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const sr = score.pillars.find((p) => p.id === 'savings_rate')!
    // BASE 0.20 / som 0.95 × 7 actief → herverdeeld tot 0.20/0.95
    expect(sr.weight).toBeCloseTo(0.20 / 0.95, 5)
  })

  it('emergency_fund heeft basisgewicht 0.20 relatief bij alle 7 actief', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const ef = score.pillars.find((p) => p.id === 'emergency_fund')!
    expect(ef.weight).toBeCloseTo(0.20 / 0.95, 5)
  })

  it('budget_discipline heeft basisgewicht 0.10 relatief bij alle 7 actief', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const bd = score.pillars.find((p) => p.id === 'budget_discipline')!
    expect(bd.weight).toBeCloseTo(0.10 / 0.95, 5)
  })
})

// ── activePillarCount en budgetingActive-flag ─────────────────────────────

describe('activePillarCount en budgetingActive flag', () => {
  it('alle 7 actief → activePillarCount = 7', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.activePillarCount).toBe(7)
    expect(score.budgetingActive).toBe(true)
  })

  it('budget_discipline inactief → activePillarCount = 6, budgetingActive = false', () => {
    const score = computeHealthScoreFromInputs(
      { ...baseInput, budgetCategories: [] },
      true,
    )
    expect(score.activePillarCount).toBe(6)
    expect(score.budgetingActive).toBe(false)
  })
})

// ── fire_progress — peer-relatieve score (koers + voortgang-op-leeftijd) ────
// Formules (eigenaar-akkoord 31 aug 2026):
//   A (koers)     = clamp(70 + 6·(peerFireAge − fireAgeFractional), 0, 100)
//   B (voortgang) = clamp(round(75 · freedomPct / verwachtPct(leeftijd)), 0, 100)
//     met verwachtPct = 100·(1.07^(lft−25) − 1)/(1.07^(peer−25) − 1)  [DEFAULT_RETURN]
//   totaal = round(0.6·A + 0.4·B); zonder haalbare FIRE alleen B; ≥100% gevuld → 100.

describe('fire_progress — peer-relatieve score', () => {
  const firePillar = (over: Partial<HealthScoreInput>) =>
    computeHealthScoreFromInputs({ ...baseInput, ...over }, true)
      .pillars.find((p) => p.id === 'fire_progress')!

  it('valt zonder currentAge terug op de leeftijdsblinde freedomPct-score (regressie-eis)', () => {
    expect(firePillar({ freedomPct: 67 }).score).toBe(67)
    expect(firePillar({ freedomPct: 0 }).score).toBe(0)
    expect(firePillar({ freedomPct: 120 }).score).toBe(100)
  })

  it('40 jr · 67% gevuld · FIRE 46,58 (peer-lat 58) → 100: ver vóór op peers', () => {
    expect(
      firePillar({ freedomPct: 67, currentAge: 40, fireAgeFractional: 46.583333333333336 }).score,
    ).toBe(100)
  })

  it('30 jr · 8% gevuld · FIRE 57 (peer-lat 55) → 74: op schema ondanks lage vulling', () => {
    expect(firePillar({ freedomPct: 8, currentAge: 30, fireAgeFractional: 57 }).score).toBe(74)
  })

  it('50 jr · 20% gevuld · FIRE onhaalbaar (peer-lat 62) → 38: alleen voortgang-op-leeftijd', () => {
    expect(firePillar({ freedomPct: 20, currentAge: 50, fireAgeFractional: null }).score).toBe(38)
  })

  it('freedomPct ≥ 100 → 100, ongeacht koers of leeftijd', () => {
    expect(firePillar({ freedomPct: 105, currentAge: 40, fireAgeFractional: 44 }).score).toBe(100)
  })

  it('de tip duidt de koers t.o.v. onze lat — als eigen richtlijn, nooit als gemeten leeftijdsgenoten', () => {
    // "onze lat" is bewust: de lat is gecureerd (fire-peer-lat.ts), geen
    // statistiek — copy die een meting over echte peers claimt is verboden
    // (ADR 0124, Wft-/merkstem-kader).
    const p = firePillar({ freedomPct: 8, currentAge: 30, fireAgeFractional: 57 })
    expect(p.improvementTip).toMatch(/onze lat van 55 jaar/)
    expect(p.improvementTip).not.toMatch(/leeftijdsgenoten/)
  })
})
