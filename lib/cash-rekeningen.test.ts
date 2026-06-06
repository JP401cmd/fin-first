import { describe, it, expect } from 'vitest'
import { buildCashRekeningen } from './cash-rekeningen'

describe('buildCashRekeningen', () => {
  const assets = [
    { id: 'a1', name: 'Spaarrekening', current_value: 12000, institution: 'ASN', has_budget_tracking: true },
    { id: 'a2', name: 'Contant geld', current_value: 200, institution: null, has_budget_tracking: false },
  ]
  const banks = [
    { id: 'b1', name: 'ASN Betaal', balance: 12500, iban: 'NL01ASN', bank_name: 'ASN Bank', linked_asset_id: 'a1' },
  ]

  it('koppelt bank_account aan asset en prefereert bank-saldo', () => {
    const rows = buildCashRekeningen(assets, banks)
    const a1 = rows.find((r) => r.assetId === 'a1')!
    expect(a1.bankAccountId).toBe('b1')
    expect(a1.balance).toBe(12500)
    expect(a1.name).toBe('ASN Betaal')
    expect(a1.iban).toBe('NL01ASN')
    expect(a1.budgetTracked).toBe(true)
    expect(a1.source).toBe('bank')
  })

  it('handmatige cash-assets zonder bank_account verschijnen als manual', () => {
    const rows = buildCashRekeningen(assets, banks)
    const a2 = rows.find((r) => r.assetId === 'a2')!
    expect(a2.bankAccountId).toBeNull()
    expect(a2.balance).toBe(200)
    expect(a2.name).toBe('Contant geld')
    expect(a2.source).toBe('manual')
    expect(a2.budgetTracked).toBe(false)
  })

  it('één rij per asset, in invoervolgorde', () => {
    const rows = buildCashRekeningen(assets, banks)
    expect(rows.map((r) => r.assetId)).toEqual(['a1', 'a2'])
  })
})
