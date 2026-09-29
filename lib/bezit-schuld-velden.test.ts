/**
 * Velden die het bewerkscherm toont, moeten ook ergens landen.
 *
 * Aanleiding (veldenonderzoek 29 sep 2026): het bewerkscherm voor bezittingen
 * en schulden droeg invoer die niets opsloeg of die het scherm niet meer
 * terug kon tonen.
 *
 *  - Given een levensverzekering met een einddatum, When die wordt opgeslagen,
 *    Then staat de datum in `lock_end_date` — de kolommen `expiry_date` en
 *    `beneficiary` bestaan niet in de database — en lezen de mijlpaal en de
 *    KPI "resterend" die kolom.
 *  - Given een DGA-vordering met een gekozen deelneming, When die wordt
 *    opgeslagen, Then gaat `linked_asset_id` mee in de opslag.
 *  - Given een autolening die aan een voertuig hangt, When het bewerkscherm
 *    opent, Then is die koppeling zichtbaar en te wijzigen.
 *  - Given een hypotheek met een einddatum of maandbedrag, When de
 *    dashboard-samenvatting hypotheek-vs-beleggen rekent, Then volgt de
 *    restlooptijd uit die schuld en niet uit een kolom die niemand vult.
 */

import { describe, it, expect } from 'vitest'
import { ASSET_TYPE_FIELDS, type Asset } from './asset-data'
import { DEBT_TYPE_FIELDS, type Debt } from './debt-data'
import { computeAssetKpi } from './asset-kpi'
import { computeAssetCategoryKpis } from './category-kpi'
import { deriveNaturalMilestones } from './natural-milestones'
import { hvbRestLooptijdMaanden, HVB_RESTLOOPTIJD_TERUGVAL_MAANDEN } from './debt-remaining-term'
import { readSourceLF } from './test-utils/read-source'

const NOW = new Date('2026-09-29T12:00:00Z')

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a-1',
    user_id: 'u-1',
    name: 'Test',
    asset_type: 'levensverzekering',
    current_value: 20_000,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 1.5,
    monthly_contribution: 0,
    institution: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...overrides,
  }
}

function makeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'd-1',
    user_id: 'u-1',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    original_amount: 300_000,
    current_balance: 200_000,
    interest_rate: 3,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2016-10-01',
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
  } as Debt
}

describe('levensverzekering: einddatum op lock_end_date', () => {
  it('het formulier biedt geen velden aan voor kolommen die niet bestaan', () => {
    expect(ASSET_TYPE_FIELDS.levensverzekering).not.toContain('expiry_date')
    expect(ASSET_TYPE_FIELDS.levensverzekering).not.toContain('beneficiary')
    expect(ASSET_TYPE_FIELDS.levensverzekering).toContain('lock_end_date')
  })

  it('de KPI "resterend" leest lock_end_date', () => {
    const polis = makeAsset({ lock_end_date: '2036-09-29' })
    expect(computeAssetKpi(polis, { now: NOW }).primary?.label).toBe('resterend')
    expect(computeAssetCategoryKpis([polis], 'levensverzekering', { now: NOW }).primary?.label).toBe('resterend')
  })

  it('zonder einddatum vervalt de KPI "resterend"', () => {
    const polis = makeAsset({ lock_end_date: null })
    expect(computeAssetKpi(polis, { now: NOW }).primary).toBeUndefined()
  })

  it('de polis-mijlpaal volgt uit lock_end_date, en precies één keer', () => {
    const polis = makeAsset({ lock_end_date: '2036-09-29' })
    const milestones = deriveNaturalMilestones({
      debts: [],
      assets: [polis],
      simResult: null,
      unifiedRows: null,
      dob: '1980-01-01',
      hasPartner: false,
    }).filter((m) => m.sourceId === polis.id)
    expect(milestones).toHaveLength(1)
    expect(milestones[0].kind).toBe('asset_expiry')
    expect(milestones[0].target_date).toBe('2036-09-29')
  })
})

describe('bezittingenformulier: opslag', () => {
  const bron = readSourceLF('components/core/assets-client.tsx')

  it('de gekoppelde deelneming van een DGA-vordering gaat mee in de opslag', () => {
    // De schrijver leest de formulierstate `linkedAssetId`; een lezer als
    // `linked_asset_id: a.linked_asset_id` telt niet.
    expect(bron).toMatch(/linked_asset_id:[^,]*\(linkedAssetId \|\| null\)/)
  })

  it('er staat geen invoer meer voor einddatum polis of begunstigde op de fantoomkolommen', () => {
    expect(bron).not.toContain('setExpiryDate')
    expect(bron).not.toContain('setBeneficiary')
  })
})

describe('autolening: koppeling aan het voertuig is zichtbaar', () => {
  it('het bewerkscherm toont linked_asset_id voor een autolening', () => {
    expect(DEBT_TYPE_FIELDS.car_loan).toContain('linked_asset_id')
  })
})

describe('hypotheek-vs-beleggen: restlooptijd uit de schuld', () => {
  it('volgt het maandbedrag als dat de schuld aflost', () => {
    // € 200.000 tegen 0% met € 1.000 per maand = 200 maanden.
    const debt = makeDebt({ interest_rate: 0, monthly_payment: 1_000, repayment_type: 'lineair' })
    expect(hvbRestLooptijdMaanden(debt, NOW)).toBe(200)
  })

  it('valt terug op de einddatum als er geen bruikbaar maandbedrag is', () => {
    const debt = makeDebt({ monthly_payment: 0, end_date: '2046-09-29' })
    expect(hvbRestLooptijdMaanden(debt, NOW)).toBe(240)
  })

  it('aflossingsvrij kent geen einde uit het maandbedrag en leest de einddatum', () => {
    const debt = makeDebt({ monthly_payment: 500, repayment_type: 'aflossingsvrij', end_date: '2036-09-29' })
    expect(hvbRestLooptijdMaanden(debt, NOW)).toBe(120)
  })

  it('zonder maandbedrag en zonder einddatum geldt de terugval van 30 jaar', () => {
    const debt = makeDebt({ monthly_payment: 0, end_date: null })
    expect(hvbRestLooptijdMaanden(debt, NOW)).toBe(HVB_RESTLOOPTIJD_TERUGVAL_MAANDEN)
    expect(HVB_RESTLOOPTIJD_TERUGVAL_MAANDEN).toBe(360)
  })

  it('een einddatum in het verleden geeft de terugval, geen nul of negatieve looptijd', () => {
    const debt = makeDebt({ monthly_payment: 0, end_date: '2020-01-01' })
    expect(hvbRestLooptijdMaanden(debt, NOW)).toBe(HVB_RESTLOOPTIJD_TERUGVAL_MAANDEN)
  })

  it('de dashboard-loader leest de ongevulde kolom remaining_term_months niet meer', () => {
    expect(readSourceLF('lib/dashboard-data-loader.ts')).not.toContain('remaining_term_months')
  })
})
