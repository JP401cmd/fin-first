/**
 * Regressietests voor `lib/debt-remaining-term.ts` — de gedeelde bron van de
 * "resterend"-KPI op /overzicht/schulden en /overzicht/schulden/[type].
 *
 * Aanleiding (bug H2): het lineaire pad riep `linearAmortization(balance, rate,
 * 600, now)` aan en negeerde `monthly_payment` volledig. Omdat die functie het
 * saldo in `termMonths` gelijke delen knipt en exact zoveel iteraties draait,
 * kwam het schema per constructie ALTIJD op 600 rijen uit — een schuld van €320
 * bij €80 per maand toonde daardoor "600 mnd resterend" (50 jaar) in plaats van
 * 4 maanden. De fout stond bovendien letterlijk gedupliceerd in
 * `lib/category-kpi.ts`, zodat de categorie-koppen apart stuk bleven.
 *
 * Deze suite vergrendelt de afleiding zelf én beide consumerende oppervlakken.
 */

import { describe, it, expect } from 'vitest'
import { debtRemainingMonths } from './debt-remaining-term'
import { computeDebtKpi } from './debt-kpi'
import { computeDebtCategoryKpis } from './category-kpi'
import type { Debt } from './debt-data'

const NOW = new Date('2026-08-26T12:00:00Z')

function makeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'd-1',
    user_id: 'u-1',
    name: 'Test Debt',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 5000,
    interest_rate: 0,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2024-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  }
}

describe('debtRemainingMonths — lineair pad (bug H2)', () => {
  it('€320 restant bij €80/mnd rentevrij = 4 maanden, niet 600', () => {
    const debt = makeDebt({
      repayment_type: 'lineair',
      current_balance: 320,
      monthly_payment: 80,
      interest_rate: 0,
    })
    expect(debtRemainingMonths(debt, NOW)).toBe(4)
  })

  it('schaalt mee met het maandbedrag in plaats van een vaste 600', () => {
    const base = { repayment_type: 'lineair' as const, current_balance: 1200, interest_rate: 0 }
    expect(debtRemainingMonths(makeDebt({ ...base, monthly_payment: 100 }), NOW)).toBe(12)
    expect(debtRemainingMonths(makeDebt({ ...base, monthly_payment: 200 }), NOW)).toBe(6)
    expect(debtRemainingMonths(makeDebt({ ...base, monthly_payment: 1200 }), NOW)).toBe(1)
  })

  it('rekent de rentecomponent uit het maandbedrag (aflossing = termijn − rente)', () => {
    // €10.000 bij 6% → rente €50 in de eerste maand; aflossing = 550 − 50 = 500.
    // 10.000 / 500 = 20 maanden.
    const debt = makeDebt({
      repayment_type: 'lineair',
      current_balance: 10000,
      monthly_payment: 550,
      interest_rate: 6,
    })
    expect(debtRemainingMonths(debt, NOW)).toBe(20)
  })

  it('geeft null als het maandbedrag de rente niet dekt (lost nooit af)', () => {
    const debt = makeDebt({
      repayment_type: 'lineair',
      current_balance: 100000,
      monthly_payment: 100,
      interest_rate: 10, // rente ≈ €833/mnd > termijn
    })
    expect(debtRemainingMonths(debt, NOW)).toBeNull()
  })

  it('geeft null bij een implausibele looptijd boven de 600-maandshorizon', () => {
    // €60.000 bij €50/mnd rentevrij = 1200 maanden → geen hard getal tonen.
    const debt = makeDebt({
      repayment_type: 'lineair',
      current_balance: 60000,
      monthly_payment: 50,
      interest_rate: 0,
    })
    expect(debtRemainingMonths(debt, NOW)).toBeNull()
  })
})

describe('debtRemainingMonths — overige paden ongewijzigd', () => {
  it('end_date is leidend boven de projectie', () => {
    const debt = makeDebt({
      repayment_type: 'lineair',
      current_balance: 320,
      monthly_payment: 80,
      end_date: '2027-08-26',
    })
    expect(debtRemainingMonths(debt, NOW)).toBe(12)
  })

  it('aflossingsvrij kent geen einde', () => {
    const debt = makeDebt({
      repayment_type: 'aflossingsvrij',
      current_balance: 200000,
      monthly_payment: 500,
    })
    expect(debtRemainingMonths(debt, NOW)).toBeNull()
  })

  it('annuïteit gebruikt het werkelijke maandbedrag', () => {
    const debt = makeDebt({
      repayment_type: 'annuiteit',
      current_balance: 1000,
      monthly_payment: 250,
      interest_rate: 0,
    })
    expect(debtRemainingMonths(debt, NOW)).toBe(4)
  })

  it('geen maandbedrag of geen saldo → geen KPI', () => {
    expect(debtRemainingMonths(makeDebt({ monthly_payment: 0 }), NOW)).toBeNull()
    expect(debtRemainingMonths(makeDebt({ current_balance: 0, monthly_payment: 80 }), NOW)).toBeNull()
  })
})

describe('beide consumerende oppervlakken tonen hetzelfde getal', () => {
  const kleineSchuld = makeDebt({
    debt_type: 'personal_loan',
    repayment_type: 'lineair',
    current_balance: 320,
    monthly_payment: 80,
    interest_rate: 0,
  })

  it('schuld-KPI (/overzicht/schulden) toont "4 mnd resterend"', () => {
    const kpi = computeDebtKpi(kleineSchuld, { now: NOW })
    expect(kpi.secondary?.value).toBe('4 mnd')
    expect(kpi.secondary?.label).toBe('resterend')
  })

  it('categorie-KPI (/overzicht/schulden/[type]) loopt niet uiteen met de schuld-KPI', () => {
    const agg = computeDebtCategoryKpis([kleineSchuld], 'personal_loan', { now: NOW })
    const single = computeDebtKpi(kleineSchuld, { now: NOW })
    expect(agg.secondary?.value).toBe(single.secondary?.value)
    expect(agg.secondary?.value).toBe('4 mnd')
  })

  it('betalingsregeling toont de afgeleide looptijd als primaire KPI', () => {
    const regeling = makeDebt({
      debt_type: 'payment_plan',
      repayment_type: 'lineair',
      current_balance: 600,
      monthly_payment: 150,
      interest_rate: 0,
    })
    expect(computeDebtKpi(regeling, { now: NOW }).primary?.value).toBe('4 mnd')
  })
})
