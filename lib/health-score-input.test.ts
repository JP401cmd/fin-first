/**
 * Tests voor lib/health-score-input.ts — de canonieke input-bouwers voor de
 * gezondheidsscore v2 (ADR 0010).
 *
 * Dekt:
 * - computeLargestAssetTypeShare: null-gevallen, exclusie eigen_huis,
 *   real_estate telt mee, unlinked cash als 'cash'-type, percentage-berekening
 * - buildHealthScoreInput: doorgifte van de 3 nieuwe v2-velden
 *   (netMonthlyIncome, debtMonthlyPayments, largestAssetTypeShare)
 */

import { describe, it, expect } from 'vitest'
import {
  computeLargestAssetTypeShare,
  computeEmergencyFundMonths,
  buildBudgetCategories,
  buildHealthScoreInput,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'

// ── computeLargestAssetTypeShare ──────────────────────────────────────────

describe('computeLargestAssetTypeShare — null-gevallen', () => {
  it('lege assets + geen unlinked cash → null', () => {
    expect(computeLargestAssetTypeShare([], 0)).toBeNull()
  })

  it('totaal excl. eigen_huis ≤ 0 → null', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 400_000 },
    ]
    expect(computeLargestAssetTypeShare(assets, 0)).toBeNull()
  })

  it('grootste type < €10.000 (starter) → null', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'savings', current_value: 5_000 },
      { asset_type: 'investment', current_value: 4_000 },
    ]
    // Totaal 9k maar geen enkel type ≥ 10k → null
    expect(computeLargestAssetTypeShare(assets, 0)).toBeNull()
  })

  it('alles eigen_huis + klein unlinked cash (< 10k) → null', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 300_000 },
    ]
    // unlinked cash 8k → cash-type 8k < 10k → null
    expect(computeLargestAssetTypeShare(assets, 8_000)).toBeNull()
  })
})

describe('computeLargestAssetTypeShare — eigen_huis exclusie', () => {
  it('eigen_huis volledig uitgesloten van grondslag', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 400_000 },
      { asset_type: 'investment', current_value: 50_000 },
    ]
    // Grondslag: alleen investment 50k → share 1.0 (enige type)
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(1.0, 5)
  })

  it('real_estate (beleggingsvastgoed) telt WEL mee', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'eigen_huis', current_value: 400_000 },
      { asset_type: 'real_estate', current_value: 100_000 }, // beleggingsvastgoed
      { asset_type: 'investment', current_value: 100_000 },
    ]
    // Grondslag: real_estate 100k + investment 100k = 200k
    // Grootste: 100k / 200k = 0.5
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.5, 5)
  })
})

describe('computeLargestAssetTypeShare — unlinked cash als "cash"', () => {
  it('unlinked cash > 0 telt mee als cash-type', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'investment', current_value: 30_000 },
    ]
    // investment 30k + cash (unlinked) 30k → 2 types elk 30k → grootste 0.5
    const share = computeLargestAssetTypeShare(assets, 30_000)
    expect(share).toBeCloseTo(0.5, 5)
  })

  it('unlinked cash wordt gesommeerd met bestaand cash-type', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'cash', current_value: 10_000 },
      { asset_type: 'investment', current_value: 30_000 },
    ]
    // cash: 10k + 5k unlinked = 15k; investment 30k; totaal 45k
    // Grootste: investment 30k/45k ≈ 0.667
    const share = computeLargestAssetTypeShare(assets, 5_000)
    expect(share).toBeCloseTo(30_000 / 45_000, 5)
  })

  it('enkel unlinked cash ≥ 10k → cash is enige type → share 1.0', () => {
    const share = computeLargestAssetTypeShare([], 15_000)
    expect(share).toBeCloseTo(1.0, 5)
  })
})

describe('computeLargestAssetTypeShare — percentage-berekening', () => {
  it('drie types: grootste is savings (40k / 100k = 0.4)', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'savings', current_value: 40_000 },
      { asset_type: 'investment', current_value: 35_000 },
      { asset_type: 'crypto', current_value: 25_000 },
    ]
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.4, 5)
  })

  it('zelfde type meerdere rijen worden gesommeerd', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'investment', current_value: 30_000 },
      { asset_type: 'investment', current_value: 30_000 }, // zelfde type, gesommeerd → 60k
      { asset_type: 'savings', current_value: 40_000 },
    ]
    // investment 60k / 100k = 0.6
    const share = computeLargestAssetTypeShare(assets, 0)
    expect(share).toBeCloseTo(0.6, 5)
  })

  it('fractie klopt bij dominante asset class (investment 105k / 133k)', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'savings', current_value: 15_000 },
      { asset_type: 'investment', current_value: 105_000 },
      { asset_type: 'crypto', current_value: 5_000 },
    ]
    const share = computeLargestAssetTypeShare(assets, 8_000) // 8k unlinked cash
    // Totaal: 15+105+5+8 = 133k; grootste investment 105k → 105/133
    expect(share).toBeCloseTo(105_000 / 133_000, 5)
  })

  it('null-waarden in current_value worden als 0 geteld', () => {
    const assets: HealthScoreAsset[] = [
      { asset_type: 'investment', current_value: null },
      { asset_type: 'savings', current_value: 20_000 },
    ]
    // investment 0 + savings 20k; grootste savings 20k → share 1.0 (enige non-zero)
    const share = computeLargestAssetTypeShare(assets, 0)
    // Maar: investment is 0k < 10k? Nee — savings is 20k, dat is de grootste.
    expect(share).toBeCloseTo(1.0, 5)
  })
})

// ── computeEmergencyFundMonths ────────────────────────────────────────────

describe('computeEmergencyFundMonths', () => {
  const assets: HealthScoreAsset[] = [
    { asset_type: 'savings', current_value: 10_000 },
    { asset_type: 'checking', current_value: 5_000 },
    { asset_type: 'investment', current_value: 100_000 }, // niet liquide
  ]

  it('liquide pot (savings + checking + cash) + unlinked ÷ netto maandsalaris', () => {
    // liquide: 10k + 5k + 5k unlinked = 20k ÷ 4.000 salaris = 5 maandsalarissen
    expect(computeEmergencyFundMonths(assets, 5_000, 4_000, 2_500)).toBeCloseTo(5, 5)
  })

  it('de maanduitgaven raken de meting niet zolang er salaris is', () => {
    expect(computeEmergencyFundMonths(assets, 5_000, 4_000, 2_500)).toBeCloseTo(
      computeEmergencyFundMonths(assets, 5_000, 4_000, 900),
      10,
    )
  })

  it('geen salaris → terugval op de maanduitgaven', () => {
    // 20k ÷ 2.500 = 8 maanden uitgaven (het oude gedrag, nu enkel de terugval)
    expect(computeEmergencyFundMonths(assets, 5_000, 0, 2_500)).toBeCloseTo(8, 5)
  })

  it('geen salaris én geen uitgaven → 0 maanden (geen divide-by-zero)', () => {
    const only: HealthScoreAsset[] = [{ asset_type: 'savings', current_value: 10_000 }]
    expect(computeEmergencyFundMonths(only, 0, 0, 0)).toBe(0)
  })
})

// ── buildBudgetCategories ─────────────────────────────────────────────────

describe('buildBudgetCategories', () => {
  it('lege budgetten → 3 categorieën met limit=0 (inactief-pad)', () => {
    const result = buildBudgetCategories([], [])
    expect(result).toHaveLength(3)
    expect(result.every((c) => c.limit === 0)).toBe(true)
  })

  it('parent-budget met expense-type: limit en spent klopt', () => {
    const budgets: HealthScoreBudget[] = [
      { id: 'exp', parent_id: null, budget_type: 'expense', default_limit: 1500, interval: 'monthly' },
    ]
    const transactions: HealthScoreTransaction[] = [
      { amount: -1200, budget_id: 'exp' },
      { amount: -100, budget_id: 'exp' },
    ]
    const result = buildBudgetCategories(budgets, transactions)
    const exp = result.find((c) => c.limit === 1500)
    expect(exp?.limit).toBe(1500)
    expect(exp?.spent).toBe(1300) // abs(-1200) + abs(-100)
  })

  it('quarterly interval wordt genormaliseerd naar maand (÷3)', () => {
    const budgets: HealthScoreBudget[] = [
      { id: 'q', parent_id: null, budget_type: 'expense', default_limit: 3000, interval: 'quarterly' },
    ]
    const result = buildBudgetCategories(budgets, [])
    const exp = result.find((c) => c.limit > 0)
    expect(exp?.limit).toBe(1000) // 3000/3
  })

  it('yearly interval wordt genormaliseerd naar maand (÷12)', () => {
    const budgets: HealthScoreBudget[] = [
      { id: 'y', parent_id: null, budget_type: 'savings', default_limit: 12000, interval: 'yearly' },
    ]
    const result = buildBudgetCategories(budgets, [])
    const sav = result.find((c) => c.limit === 1000)
    expect(sav?.limit).toBe(1000) // 12000/12
  })
})

// ── buildHealthScoreInput — doorgifte v2-velden ───────────────────────────

describe('buildHealthScoreInput — doorgifte v2-velden', () => {
  const assets: HealthScoreAsset[] = [
    { asset_type: 'savings', current_value: 15_000 },
    { asset_type: 'investment', current_value: 85_000 },
  ]
  const scalars = {
    savingsRate6m: 22,
    totalAssets: 100_000,
    totalDebts: 10_000,
    freedomPct: 30,
    avgMonthlyExpenses: 2_000,
    netMonthlyIncome: 4_200,
    netMonthlySalary: 4_200,
  }
  const rows = {
    assets,
    unlinkedCash: 0,
    budgets: [] as HealthScoreBudget[],
    transactions: [] as HealthScoreTransaction[],
    householdType: 'solo' as const,
    debtMonthlyPayments: 350,
  }

  it('netMonthlyIncome uit scalars wordt correct doorgegeven', () => {
    const input = buildHealthScoreInput(scalars, rows)
    expect(input.netMonthlyIncome).toBe(4_200)
  })

  it('debtMonthlyPayments uit rows wordt correct doorgegeven', () => {
    const input = buildHealthScoreInput(scalars, rows)
    expect(input.debtMonthlyPayments).toBe(350)
  })

  it('largestAssetTypeShare berekend (investment 85k / 100k = 0.85)', () => {
    const input = buildHealthScoreInput(scalars, rows)
    expect(input.largestAssetTypeShare).toBeCloseTo(0.85, 5)
  })

  it('savingsRate6m, totalAssets, totalDebts, freedomPct ongewijzigd doorgegeven', () => {
    const input = buildHealthScoreInput(scalars, rows)
    expect(input.savingsRate6m).toBe(22)
    expect(input.totalAssets).toBe(100_000)
    expect(input.totalDebts).toBe(10_000)
    expect(input.freedomPct).toBe(30)
  })

  it('debtMonthlyPayments 0 → DSTI-pad "geen schulden" werkt via de engine', async () => {
    const rowsNoDebt = { ...rows, debtMonthlyPayments: 0 }
    const { computeHealthScoreFromInputs } = await import('@/lib/financial-health')
    const input = buildHealthScoreInput(scalars, rowsNoDebt)
    const score = computeHealthScoreFromInputs(input, true)
    const dsti = score.pillars.find((p) => p.id === 'debt_service_ratio')
    expect(dsti?.score).toBe(100) // geen schulden → score 100 actief
  })

  it('largestAssetTypeShare null bij te weinig vermogen → asset_concentration inactief', async () => {
    const { computeHealthScoreFromInputs } = await import('@/lib/financial-health')
    const smallAssets: HealthScoreAsset[] = [
      { asset_type: 'savings', current_value: 5_000 },
    ]
    const rowsSmall = { ...rows, assets: smallAssets }
    const input = buildHealthScoreInput(scalars, rowsSmall)
    expect(input.largestAssetTypeShare).toBeNull()
    const score = computeHealthScoreFromInputs(input, true)
    expect(score.pillars.map((p) => p.id)).not.toContain('asset_concentration')
  })
})
