/**
 * Financiële gezondheid — de twee oordelen die de gebruiker op 29 jul 2026
 * meldde. Beide gingen over dezelfde klacht: het OORDEEL rekende met een ander
 * getal dan wat de gebruiker zelf op de cashflow-pagina ziet.
 *
 * 1. NOODBUFFER. Het doel was 6 × maanduitgaven; het moet 3 × netto maandsalaris
 *    zijn. De teller blijft de canonieke (inclusion-gewogen) liquide pot —
 *    spaar/betaal/cash — en de dekking wordt in maanden salaris uitgedrukt,
 *    zodat teller en doel op dezelfde grondslag staan. Een noodfonds-DOEL
 *    stuurt de score-target niet meer (eigenaar-besluit 29 jul 2026): de norm
 *    is altijd 3 × salaris.
 *
 * 2. SPAARQUOTE. Zet de gebruiker inkomen/uitgaven handmatig, dan IS het
 *    getoonde percentage al de spaarquote — het instellingenblok onderaan
 *    /overzicht/cashflow toont `(inkomen − uitgaven) / inkomen`. De canonieke
 *    resolver telde daar spaarbudgetten en schuldaflossing NOG EENS bovenop,
 *    waardoor de gezondheidsscore en de FIRE-prognose een hoger percentage
 *    gebruikten dan de gebruiker zelf had ingevoerd.
 *
 * Productie-ijkpunten (beide accounts, gemeten via execute_sql):
 *   gebruiker A .................. 5.000 / 3.500 → 30 %  (was 37,2 % canoniek,
 *                                   49,5 % op de forecast-pagina + in de score)
 *   gebruiker B .................. 5.000 / 3.000 → 40 %  (berekend: 7 %)
 */
import { describe, it, expect } from 'vitest'
import { resolveSavingsSource } from '@/lib/savings-source'
import { resolveEmergencyFund, TARGET_EMERGENCY_SALARY_MONTHS } from '@/lib/emergency-fund'
import { buildHealthScoreInput } from '@/lib/health-score-input'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'

// ── 1. Noodbuffer: doel = 3 × netto maandsalaris ─────────────────────────────

describe('resolveEmergencyFund — doel is 3 × netto maandsalaris', () => {
  it('leidt het doelbedrag af uit het salaris, niet uit de maanduitgaven', () => {
    const r = resolveEmergencyFund({
      liquidPot: 55_001,            // 15.000 betaal + 1 cash + 40.000 spaar
      effectiveMonthlyExpenses: 3_500,
      netMonthlyIncome: 5_000,
    })
    expect(r.targetMonths).toBe(TARGET_EMERGENCY_SALARY_MONTHS) // 3
    expect(r.targetAmount).toBe(15_000)                          // 3 × 5.000
    expect(r.source).toBe('salary')
  })

  it('drukt de dekking uit in maanden salaris — dezelfde grondslag als het doel', () => {
    const r = resolveEmergencyFund({
      liquidPot: 15_000,
      effectiveMonthlyExpenses: 3_500,
      netMonthlyIncome: 5_000,
    })
    expect(r.monthsCovered).toBeCloseTo(3, 10) // 15.000 / 5.000, precies op doel
  })

  it('houdt de leesbare runway (maanden uitgaven) apart beschikbaar', () => {
    const r = resolveEmergencyFund({
      liquidPot: 55_001,
      effectiveMonthlyExpenses: 3_500,
      netMonthlyIncome: 5_000,
    })
    // "hoe lang kun je rondkomen" blijft op uitgaven-basis — die zin moet waar
    // blijven, ook nu de SCORE tegen het salaris-doel meet.
    expect(r.runwayMonths).toBeCloseTo(55_001 / 3_500, 6)
    expect(r.monthsCovered).not.toBeCloseTo(r.runwayMonths, 1)
  })

  it('valt terug op 6 × maanduitgaven wanneer er geen salaris bekend is', () => {
    const r = resolveEmergencyFund({
      liquidPot: 12_000,
      effectiveMonthlyExpenses: 2_000,
      netMonthlyIncome: 0,
    })
    expect(r.source).toBe('expenses')
    expect(r.targetMonths).toBe(6)
    expect(r.targetAmount).toBe(12_000)
    expect(r.monthsCovered).toBeCloseTo(6, 10)
  })

  it('geen salaris én geen uitgaven: geen deling door nul', () => {
    const r = resolveEmergencyFund({
      liquidPot: 5_000,
      effectiveMonthlyExpenses: 0,
      netMonthlyIncome: 0,
    })
    expect(r.monthsCovered).toBe(0)
    expect(r.runwayMonths).toBe(0)
    expect(r.currentAmount).toBe(5_000)
  })
})

describe('gezondheidsscore — noodfonds-pijler scoort tegen de salaris-norm', () => {
  const assets = [
    { asset_type: 'cash', current_value: 15_000 },
    { asset_type: 'cash', current_value: 1 },
    { asset_type: 'savings', current_value: 40_000 },
    { asset_type: 'eigen_huis', current_value: 500_000 },
    { asset_type: 'investment', current_value: 1_200 },
  ]

  const input = (netMonthlySalary: number) =>
    buildHealthScoreInput(
      {
        savingsRate6m: 30,
        totalAssets: 556_201,
        totalDebts: 290_800,
        freedomPct: 12,
        avgMonthlyExpenses: 3_500,
        netMonthlyIncome: 5_000,
        netMonthlySalary,
        incomeBasis: 'manual' as const,
        expensesBasis: 'manual' as const,
        // Legacy leeftijdsblind pad — de peer-relatieve fire_progress-cases
        // staan in financial-health.test.ts.
        currentAge: null,
        fireAgeFractional: null,
      },
      {
        assets,
        unlinkedCash: 0,
        budgets: [],
        transactions: [],
        splits: [],
        householdType: 'solo',
        debtMonthlyPayments: 1_422,
      },
    )

  it('meet de buffer in maanden salaris, met 3 als doel', () => {
    const i = input(5_000)
    expect(i.emergencyFundMonths).toBeCloseTo(55_001 / 5_000, 6) // 11,0
    expect(i.emergencyTargetMonths).toBe(TARGET_EMERGENCY_SALARY_MONTHS)
  })

  it('een buffer onder 3× salaris haalt geen 100 meer, ook al dekt hij >6 mnd uitgaven', () => {
    // 9.000 buffer = 2,6 mnd uitgaven ... maar op een salaris van 10.000 is dat
    // 0,9 maandsalaris → ruim onder de norm van 3.
    const i = buildHealthScoreInput(
      {
        savingsRate6m: 30,
        totalAssets: 9_000,
        totalDebts: 0,
        freedomPct: 5,
        avgMonthlyExpenses: 1_000,
        netMonthlyIncome: 10_000,
        netMonthlySalary: 10_000,
        incomeBasis: 'manual' as const,
        expensesBasis: 'manual' as const,
        // Legacy leeftijdsblind pad — de peer-relatieve fire_progress-cases
        // staan in financial-health.test.ts.
        currentAge: null,
        fireAgeFractional: null,
      },
      {
        assets: [{ asset_type: 'savings', current_value: 9_000 }],
        unlinkedCash: 0,
        budgets: [],
        transactions: [],
        splits: [],
        householdType: 'solo',
        debtMonthlyPayments: 0,
      },
    )
    expect(i.emergencyFundMonths).toBeCloseTo(0.9, 6)
    const score = computeHealthScoreFromInputs(i, false)
    const pillar = score.pillars.find((p) => p.id === 'emergency_fund')
    expect(pillar).toBeDefined()
    expect(pillar!.score).toBeLessThan(100)
  })
})

// ── 2. Spaarquote: handmatig pad = precies wat de kaart toont ─────────────────

describe('resolveSavingsSource — handmatige invoer IS de spaarquote', () => {
  it('telt spaarbudgetten en aflossing niet nóg eens bovenop de handmatige invoer', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'manual',
      netMonthlyIncome: 5_000,
      estimatedAnnualIncome: 95_074,   // transactie-schatting, moet genegeerd worden
      estimatedMonthlyExpenses: 3_500,
      savingsRate6m: 49.5,             // 6-mnd transactiequote, moet genegeerd worden
      monthlyDebtAflossing: 360.21,    // was: hier bovenop → 37,2 %
      monthlySavingsContribution: 0,
    })
    // Precies wat het instellingenblok onderaan /overzicht/cashflow toont.
    expect(r.effectiveSavingsRatePct).toBeCloseTo(30, 6)
    expect(r.baseAnnualSavings).toBeCloseTo(18_000, 4) // 60.000 × 30 %
  })

  it('tweede productie-account: 5.000 / 3.000 blijft 40 %, niet meer', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'manual',
      netMonthlyIncome: 5_000,
      estimatedAnnualIncome: 745_762,
      estimatedMonthlyExpenses: 3_000,
      savingsRate6m: 7,
      monthlyDebtAflossing: 500,
      monthlySavingsContribution: 250,
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(40, 6)
  })

  it('berekend pad blijft ongemoeid: savingsRate6m incl. budget/aflossing-correctie', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'auto',            // "Gebruik berekend" aangeklikt
      netMonthlyIncome: 5_000,
      estimatedAnnualIncome: 745_762,
      estimatedMonthlyExpenses: 3_000,
      savingsRate6m: 7,
      monthlyDebtAflossing: 500,
      monthlySavingsContribution: 250,
    })
    expect(r.effectiveSavingsRatePct).toBe(7)
  })
})
