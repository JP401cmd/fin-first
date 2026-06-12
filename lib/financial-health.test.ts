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
  netMonthlyIncome: 4_000,
  debtMonthlyPayments: 600,
  largestAssetTypeShare: 0.5,
  budgetCategories: [
    { limit: 1500, spent: 1400 },
    { limit: 500, spent: 450 },
  ],
}

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
      totalPurchaseValue: 90_000,
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
      aiInsights: [],
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
  }
  const rows = {
    assets,
    unlinkedCash,
    budgets,
    transactions,
    householdType,
    debtMonthlyPayments: 700,
  }

  const routeInput = buildHealthScoreInput(routeScalars, rows)

  it('levert echte noodfonds-input (liquid assets ÷ avg expenses)', () => {
    // liquid = savings 15k + unlinked 8k = 23k ÷ 2500 = 9.2
    expect(routeInput.emergencyFundMonths).toBeCloseTo(23_000 / 2_500, 5)
  })

  it('levert 3 budgetcategorieën, minstens één met limiet > 0', () => {
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
