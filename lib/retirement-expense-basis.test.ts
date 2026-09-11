import { describe, it, expect } from 'vitest'
import {
  extrapolateAnnualIncome,
  deriveRetirementExpenseBasis,
  type RetirementExpenseBasisParams,
} from './retirement-expense-basis'

// Vaste referentiedatum voor deterministische maand-diffs.
const NOW = new Date('2026-07-15T00:00:00Z') // maand-index 6 (juli)

describe('extrapolateAnnualIncome — de CLIENT-terugval, all-time-verankerd (ADR 0138)', () => {
  it('schaalt <12 maanden historie naar een vol jaar op basis van de all-time vroegste datum', () => {
    // Vroegste inkomen 6 afgesloten maanden terug (jan, index 0) → deler 6.
    // €47.427,50 over 6 maanden → geannualiseerd €94.855.
    expect(extrapolateAnnualIncome(47427.5, '2026-01-05', NOW)).toBeCloseTo(94855, 5)
  })

  it('laat ≥12 maanden historie ongeschaald (deler klemt op 12)', () => {
    // Vroegste inkomen 18 maanden terug → deler klemt op 12 → geen schaling.
    expect(extrapolateAnnualIncome(60000, '2025-01-05', NOW)).toBe(60000)
  })

  it('exact 12 maanden historie → ongeschaald', () => {
    expect(extrapolateAnnualIncome(60000, '2025-07-05', NOW)).toBe(60000)
  })

  it('geen inkomen → 0 (niets te schalen)', () => {
    expect(extrapolateAnnualIncome(0, '2026-01-05', NOW)).toBe(0)
  })

  it('ontbrekende/lege datum → onveranderde som', () => {
    expect(extrapolateAnnualIncome(50000, null, NOW)).toBe(50000)
    expect(extrapolateAnnualIncome(50000, undefined, NOW)).toBe(50000)
  })

  it('een vroegste datum in de lopende maand → deler 1 (geen afgesloten maand, geen deling door 0)', () => {
    expect(extrapolateAnnualIncome(1000, '2026-07-02', NOW)).toBe(12000)
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

describe('deriveRetirementExpenseBasis — methode-afleiding bovenop het aangeleverde jaarinkomen', () => {
  const base: RetirementExpenseBasisParams = {
    method: 'current_income',
    yearlyMustExpenses: 24000,
    transactionAnnualIncome: 94855,
    customAmount: null,
    estimatedYearlyExpenses: 30000,
  }

  it('current_income: gebruikt het aangeleverde transactie-jaarinkomen', () => {
    const { extrapolatedIncome, yearlyRetirementExpenses } = deriveRetirementExpenseBasis(base)
    expect(extrapolatedIncome).toBe(94855)
    expect(yearlyRetirementExpenses).toBe(94855)
  })

  it('rekent NIET zelf: het jaarinkomen gaat er ongeschaald doorheen (één schaalformule, één home)', () => {
    const { transactionAnnualIncome } = deriveRetirementExpenseBasis({ ...base, transactionAnnualIncome: 12345 })
    expect(transactionAnnualIncome).toBe(12345)
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
      transactionAnnualIncome: 0,
    })
    expect(extrapolatedIncome).toBe(0)
    expect(yearlyRetirementExpenses).toBe(30000)
  })

  it('een NaN/negatief jaarinkomen wordt 0 — nooit NaN de FIRE-keten in', () => {
    for (const v of [Number.NaN, -5]) {
      const r = deriveRetirementExpenseBasis({ ...base, transactionAnnualIncome: v })
      expect(r.transactionAnnualIncome).toBe(0)
      expect(r.extrapolatedIncome).toBe(0)
      expect(r.yearlyRetirementExpenses).toBe(30000)
    }
  })
})

describe('deriveRetirementExpenseBasis — de gekozen inkomensgrondslag (ADR 0103)', () => {
  const base: RetirementExpenseBasisParams = {
    method: 'current_income',
    yearlyMustExpenses: 24000,
    transactionAnnualIncome: 94855,
    customAmount: null,
    estimatedYearlyExpenses: 30000,
  }

  it('INERT zonder effectiveAnnualIncome: het transactie-jaarinkomen is de grondslag', () => {
    const r = deriveRetirementExpenseBasis(base)
    expect(r.extrapolatedIncome).toBe(94855)
    expect(r.transactionAnnualIncome).toBe(94855)
    expect(r.yearlyRetirementExpenses).toBe(94855)
  })

  it('een budget-/handmatige grondslag wint en verschuift daarmee het FIRE-doel', () => {
    const r = deriveRetirementExpenseBasis({ ...base, effectiveAnnualIncome: 62_400 })
    expect(r.extrapolatedIncome).toBe(62_400)
    expect(r.yearlyRetirementExpenses).toBe(62_400)
    // De rúwe transactiemeting blijft apart beschikbaar.
    expect(r.transactionAnnualIncome).toBe(94855)
  })

  it('een leeg/ongeldig grondslagbedrag valt terug op het transactie-jaarinkomen', () => {
    for (const v of [0, -1, null, undefined, Number.NaN]) {
      const r = deriveRetirementExpenseBasis({ ...base, effectiveAnnualIncome: v })
      expect(r.extrapolatedIncome).toBe(94855)
    }
  })

  it('raakt de andere twee methodes niet', () => {
    expect(
      deriveRetirementExpenseBasis({ ...base, method: 'essential_budgets', effectiveAnnualIncome: 62_400 })
        .yearlyRetirementExpenses,
    ).toBe(24000)
    expect(
      deriveRetirementExpenseBasis({
        ...base, method: 'custom_amount', customAmount: 36000, effectiveAnnualIncome: 62_400,
      }).yearlyRetirementExpenses,
    ).toBe(36000)
  })
})

describe('consistentie: drie call-sites → identieke afleiding bij identieke input', () => {
  // Simuleert dat SSR-loader, horizon-client load()-refresh en de sheet-context-
  // route exact dezelfde helper met exact hetzelfde jaarinkomen aanroepen.
  it('drie identieke aanroepen leveren byte-identieke output', () => {
    const params: RetirementExpenseBasisParams = {
      method: 'current_income',
      yearlyMustExpenses: 24000,
      transactionAnnualIncome: 94855,
      customAmount: null,
      estimatedYearlyExpenses: 30000,
    }
    const ssr = deriveRetirementExpenseBasis(params)
    const client = deriveRetirementExpenseBasis(params)
    const sheet = deriveRetirementExpenseBasis(params)
    expect(ssr).toEqual(client)
    expect(client).toEqual(sheet)
    expect(ssr.yearlyRetirementExpenses).toBe(94855)
  })
})
