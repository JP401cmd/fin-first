import { describe, it, expect } from 'vitest'
import type { CashBankLink } from '@/lib/bank-connection-status'
import { detailBankAccountIdForAsset } from './cash-detail-target'

/**
 * Tests voor de paneel-keuze van een cash-kaart
 * (specs/bank-connect-doelrekening/plan.md, fase 7).
 *
 * De bug die hier gepind wordt: een via SC-13 gereactiveerde rekening (bezit weer
 * actief, `has_budget_tracking` nog uit) viel buiten de budget-map en opende
 * daardoor het bezitting-bewerk-paneel — precies níet het paneel met de
 * bankverbinding, de statusuitleg en het herstelpad.
 */

function link(overrides: Partial<CashBankLink> = {}): CashBankLink {
  return {
    bankAccountId: 'ba-1',
    assetId: 'asset-1',
    state: 'linked',
    connectionAccountId: 'bca-1',
    providerName: 'ING',
    ...overrides,
  }
}

describe('detailBankAccountIdForAsset', () => {
  it('wijst de rekeningdetail aan zodra er een koppelrij is, óók zonder budget-map', () => {
    // Dit IS het gereactiveerde geval: budgetteren staat uit, dus de map is leeg.
    expect(detailBankAccountIdForAsset([link()], {}, 'asset-1')).toBe('ba-1')
  })

  it('doet dat ook voor een kwijtgeraakte verbinding — dáár is het herstelpad', () => {
    const broken = link({ state: 'linked-broken' })
    expect(detailBankAccountIdForAsset([broken], {}, 'asset-1')).toBe('ba-1')
  })

  it('doet dat ook voor een handmatige rekening MÉT bank_accounts-rij', () => {
    // `loadCashBankLinks` levert die rijen bewust ook als `manual`: er is een
    // rekening, dus er is een rekeningdetail.
    expect(detailBankAccountIdForAsset([link({ state: 'manual' })], {}, 'asset-1')).toBe('ba-1')
  })

  it('valt terug op de budget-map als de koppelbundel leeg is', () => {
    // Leeg = onbekend (host geeft niets mee, of de leesronde faalde). Dan blijft
    // het gedrag exact zoals vóór fase 7.
    expect(detailBankAccountIdForAsset([], { 'asset-1': 'ba-9' }, 'asset-1')).toBe('ba-9')
  })

  it('laat de koppelrij vóórgaan op de budget-map bij tegenspraak', () => {
    expect(detailBankAccountIdForAsset([link()], { 'asset-1': 'ba-9' }, 'asset-1')).toBe('ba-1')
  })

  it('geeft undefined voor een bezit zonder rekening — dan hoort het bewerk-paneel', () => {
    expect(detailBankAccountIdForAsset([link({ assetId: 'asset-2' })], {}, 'asset-1')).toBeUndefined()
  })

  it('negeert koppelrijen zonder bezit (rekening zonder cash-asset)', () => {
    expect(detailBankAccountIdForAsset([link({ assetId: null })], {}, 'asset-1')).toBeUndefined()
  })
})
