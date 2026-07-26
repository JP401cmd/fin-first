import { describe, it, expect } from 'vitest'
import {
  extrapolateAnnualIncome,
  deriveRetirementExpenseBasis,
  type RetirementExpenseBasisParams,
} from './retirement-expense-basis'

// Vaste referentiedatum voor deterministische maand-diffs.
const NOW = new Date('2026-07-15T00:00:00Z') // maand-index 6 (juli)

describe('extrapolateAnnualIncome — all-time-verankerde extrapolatie', () => {
  it('schaalt <12 maanden historie naar een vol jaar op basis van de all-time vroegste datum', () => {
    // Vroegste inkomen 6 maanden terug (jan, index 0) → incomeMonths = 6.
    // €47.427,50 over 6 maanden → geannualiseerd €94.855.
    expect(extrapolateAnnualIncome(47427.5, '2026-01-05', NOW)).toBeCloseTo(94855, 5)
  })

  it('laat ≥12 maanden historie ongeschaald (deler klemt op 12)', () => {
    // Vroegste inkomen 18 maanden terug → incomeMonths klemt op 12 → geen schaling.
    expect(extrapolateAnnualIncome(60000, '2025-01-05', NOW)).toBe(60000)
  })

  it('exact 12 maanden historie → ongeschaald', () => {
    expect(extrapolateAnnualIncome(60000, '2025-07-05', NOW)).toBe(60000)
  })

  it('geen inkomen → 0 (niets te schalen)', () => {
    expect(extrapolateAnnualIncome(0, '2026-01-05', NOW)).toBe(0)
  })

  it('ontbrekende/lege datum → onveranderd last12Income', () => {
    expect(extrapolateAnnualIncome(50000, null, NOW)).toBe(50000)
    expect(extrapolateAnnualIncome(50000, undefined, NOW)).toBe(50000)
  })

  it('kern van WF-TOEK-02-bug2: een te RECENTE (12-maands-vensterbegrensde) datum geeft een ANDER, fout jaarbedrag', () => {
    // All-time anker (jan, 6 mnd) → €94.855. Een venster dat de vroegste datum
    // naar juni (1 mnd) verschoof gaf een absurd hoog jaarbedrag — precies de
    // divergentie die tussen sheet en KPI zichtbaar werd.
    const allTime = extrapolateAnnualIncome(47427.5, '2026-01-05', NOW)
    const windowed = extrapolateAnnualIncome(47427.5, '2026-06-05', NOW)
    expect(allTime).toBeCloseTo(94855, 5)
    expect(windowed).not.toBeCloseTo(allTime, 0)
  })
})

describe('deriveRetirementExpenseBasis — methode-afleiding bovenop de extrapolatie', () => {
  const base: RetirementExpenseBasisParams = {
    method: 'current_income',
    yearlyMustExpenses: 24000,
    last12Income: 47427.5,
    earliestIncomeDate: '2026-01-05',
    customAmount: null,
    estimatedYearlyExpenses: 30000,
    now: NOW,
  }

  it('current_income: gebruikt het geëxtrapoleerde jaarinkomen', () => {
    const { extrapolatedIncome, yearlyRetirementExpenses } = deriveRetirementExpenseBasis(base)
    expect(extrapolatedIncome).toBeCloseTo(94855, 5)
    expect(yearlyRetirementExpenses).toBeCloseTo(94855, 5)
  })

  it('essential_budgets: negeert het inkomen, gebruikt de essentiële jaaruitgaven', () => {
    const { yearlyRetirementExpenses } = deriveRetirementExpenseBasis({
      ...base,
      method: 'essential_budgets',
    })
    expect(yearlyRetirementExpenses).toBe(24000)
  })

  it('custom_amount: gebruikt het handmatige bedrag', () => {
    const { yearlyRetirementExpenses } = deriveRetirementExpenseBasis({
      ...base,
      method: 'custom_amount',
      customAmount: 36000,
    })
    expect(yearlyRetirementExpenses).toBe(36000)
  })

  it('current_income zonder inkomen → valt terug op estimatedYearlyExpenses (canoniek, geen net_monthly_income-fallback)', () => {
    const { extrapolatedIncome, yearlyRetirementExpenses } = deriveRetirementExpenseBasis({
      ...base,
      last12Income: 0,
    })
    expect(extrapolatedIncome).toBe(0)
    expect(yearlyRetirementExpenses).toBe(30000)
  })
})

describe('consistentie: drie call-sites → identieke afleiding bij identieke input', () => {
  // Simuleert dat SSR-loader, horizon-client load()-refresh en de sheet-context-
  // route na de consolidatie exact dezelfde helper met exact dezelfde grondslag
  // aanroepen (transfer-inclusieve last12Income + all-time earliest-datum).
  it('drie identieke aanroepen leveren byte-identieke output', () => {
    const params: RetirementExpenseBasisParams = {
      method: 'current_income',
      yearlyMustExpenses: 24000,
      last12Income: 47427.5,
      earliestIncomeDate: '2026-01-05',
      customAmount: null,
      estimatedYearlyExpenses: 30000,
      now: NOW,
    }
    const ssr = deriveRetirementExpenseBasis(params)
    const client = deriveRetirementExpenseBasis(params)
    const sheet = deriveRetirementExpenseBasis(params)
    expect(ssr).toEqual(client)
    expect(client).toEqual(sheet)
    expect(ssr.yearlyRetirementExpenses).toBeCloseTo(94855, 5)
  })
})
