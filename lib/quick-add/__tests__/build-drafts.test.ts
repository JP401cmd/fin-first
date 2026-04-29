/**
 * Unit tests voor de pure draft-builders in `lib/quick-add/build-drafts.ts`.
 *
 * Valideert per asset/debt-type dat `field3` correct wordt geïnterpreteerd
 * en dat alle smart defaults (expected_return, repayment_type, end_date,
 * is_tax_deductible, include_aflossing_in_savings, …) conform de spec in
 * `docs/ok-we-gaan-een-precious-naur.md` worden gezet.
 */

import { describe, it, expect } from 'vitest'
import { buildAssetDraft, buildDebtDraft } from '../build-drafts'
import { TYPICAL_RETURNS } from '@/lib/asset-data'

// `today` als yyyy-mm-dd — draft-builders gebruiken deze als purchase_date
// en start_date. We leiden hem af via dezelfde expression voor deterministic
// end_date-checks zonder stubben van Date.
function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function addYearsIso(startIso: string, years: number): string {
  const d = new Date(startIso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

describe('buildAssetDraft', () => {
  it('savings: zet bank in institution en gebruikt TYPICAL_RETURNS.savings', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaarrekening ING',
      current_value: 10000,
      field3: 'ING',
    })
    expect(draft.institution).toBe('ING')
    expect(draft.expected_return).toBe(TYPICAL_RETURNS.savings)
    expect(draft.monthly_contribution).toBe(0)
  })

  it('savings: heeft de gedeelde defaults (is_active, ownership, net_worth_pct)', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaar',
      current_value: 5000,
      field3: 'Rabo',
    })
    expect(draft.is_active).toBe(true)
    expect(draft.ownership).toBe('personal')
    expect(draft.net_worth_inclusion_pct).toBe(100)
  })

  it('eigen_huis: parst field3 als WOZ-waarde (currency)', () => {
    const draft = buildAssetDraft({
      asset_type: 'eigen_huis',
      name: 'Koopwoning',
      current_value: 500000,
      field3: '450000',
    })
    expect(draft.woz_value).toBe(450000)
  })

  it('investment: parst field3 als maandelijkse inleg (currency)', () => {
    const draft = buildAssetDraft({
      asset_type: 'investment',
      name: 'ETF portefeuille',
      current_value: 25000,
      field3: 250,
    })
    expect(draft.monthly_contribution).toBe(250)
  })

  it('vehicle: gebruikt field3 als aankoopprijs en zet depreciation_rate=15', () => {
    const draft = buildAssetDraft({
      asset_type: 'vehicle',
      name: 'Tesla Model 3',
      current_value: 35000,
      field3: 50000,
    })
    expect(draft.purchase_value).toBe(50000)
    expect(draft.depreciation_rate).toBe(15)
  })

  it('vordering: parst field3 als rente (%) en overschrijft expected_return', () => {
    const draft = buildAssetDraft({
      asset_type: 'vordering',
      name: 'Lening aan Jan',
      current_value: 20000,
      field3: 4.5,
    })
    expect(draft.expected_return).toBe(4.5)
  })

  it('crypto zonder field3 gebruikt TYPICAL_RETURNS.crypto en monthly_contribution=0', () => {
    const draft = buildAssetDraft({
      asset_type: 'crypto',
      name: 'Bitcoin wallet',
      current_value: 15000,
    })
    expect(draft.expected_return).toBe(TYPICAL_RETURNS.crypto)
    expect(draft.monthly_contribution).toBe(0)
  })
})

describe('buildDebtDraft', () => {
  it('mortgage: default 30j annuiteit, tax-deductible, include_aflossing_in_savings=true', () => {
    const today = todayIso()
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hypotheek',
      current_balance: 300000,
      field3: 3.5,
    })
    expect(draft.repayment_type).toBe('annuiteit')
    expect(draft.is_tax_deductible).toBe(true)
    expect(draft.include_aflossing_in_savings).toBe(true)
    expect(draft.end_date).toBe(addYearsIso(today, 30))
  })

  it('student_loan: repayment_type lineair en is_tax_deductible=false', () => {
    const draft = buildDebtDraft({
      debt_type: 'student_loan',
      name: 'DUO',
      current_balance: 15000,
    })
    expect(draft.repayment_type).toBe('lineair')
    expect(draft.is_tax_deductible).toBe(false)
  })

  it('credit_card: aflossingsvrij, geen einddatum, rente overgenomen uit field3', () => {
    const draft = buildDebtDraft({
      debt_type: 'credit_card',
      name: 'Visa',
      current_balance: 2000,
      field3: 14,
    })
    expect(draft.repayment_type).toBe('aflossingsvrij')
    expect(draft.end_date).toBeNull()
    expect(draft.interest_rate).toBe(14)
  })

  it('personal_loan zonder rente: interest_rate = 0', () => {
    const draft = buildDebtDraft({
      debt_type: 'personal_loan',
      name: 'PL',
      current_balance: 5000,
    })
    expect(draft.interest_rate).toBe(0)
  })

  it('dga_schuld zonder rente: default 2.5 (conform defaultInterestRate)', () => {
    const draft = buildDebtDraft({
      debt_type: 'dga_schuld',
      name: 'Rekening-courant',
      current_balance: 10000,
    })
    expect(draft.interest_rate).toBe(2.5)
  })

  it('linked_asset_id wordt doorgegeven wanneer aangeleverd', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Gekoppelde hypotheek',
      current_balance: 400000,
      field3: 3.5,
      linked_asset_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(draft.linked_asset_id).toBe('00000000-0000-0000-0000-000000000001')
  })
})
