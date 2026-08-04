import { describe, it, expect } from 'vitest'
import type { CashBankLink } from '@/lib/bank-connection-status'
import { detailBankAccountIdForAsset } from './cash-detail-target'

/**
 * Tests voor de paneel-keuze van een cash-kaart
 * (specs/bank-connect-doelrekening/plan.md, fase 7).
 *
 * De bug die hier gepind wordt: een rekening mét koppelrij maar zónder
 * budgettracking viel buiten de budget-map en opende daardoor het
 * bezitting-bewerk-paneel — precies níet het paneel met de bankverbinding, de
 * statusuitleg en het herstelpad.
 *
 * Die combinatie ontstond oorspronkelijk uit het SC-13-herstel, dat alléén
 * `assets.is_active` terugzette. Sinds het eigenaarsbesluit van 30 juli zet het
 * herstel béide assen terug, dus dát pad levert 'm niet meer op — maar de regel
 * blijft nodig, want de gebruiker kan budgetteren op een gekoppelde rekening zelf
 * uitzetten (en de budget-write van het herstel kan falen).
 *
 * De regel is daarom "een ÉCHTE koppeling wint van de budget-map", niet "elke
 * koppelrij wint". Dat onderscheid is nodig omdat `loadCashBankLinks` zonder
 * `is_active`-filter leest: een companion die door "budgetteren uit" is
 * gedeactiveerd blijft in de bundel staan als `manual`. Liet ook díé rij het
 * detail winnen, dan opende elke rekening zonder koppeling én zonder budgetteren
 * een leeg rekeningdetail — de bug die deze suite sinds die vondst afdekt.
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
    // Budgetteren staat uit, dus de budget-map is leeg — en tóch is er een rekening.
    expect(detailBankAccountIdForAsset([link()], {}, 'asset-1')).toBe('ba-1')
  })

  it('doet dat ook voor een kwijtgeraakte verbinding — dáár is het herstelpad', () => {
    const broken = link({ state: 'linked-broken' })
    expect(detailBankAccountIdForAsset([broken], {}, 'asset-1')).toBe('ba-1')
  })

  it('wijst GEEN rekeningdetail aan voor een handmatige rekening zonder budgetteren', () => {
    // `loadCashBankLinks` leest `bank_accounts` zonder `is_active`-filter, dus
    // een companion die door "budgetteren uit" gedeactiveerd is blijft in de
    // bundel staan — als `manual`, want er is geen actieve koppelrij. Liet die
    // rij het detail winnen, dan opende de kaart een rekeningdetail dat niets te
    // tonen heeft: geen bankverbinding, geen herstelpad, geen transactie-as.
    // Het bewerk-paneel van de bezitting is dáár het juiste scherm.
    expect(detailBankAccountIdForAsset([link({ state: 'manual' })], {}, 'asset-1')).toBeUndefined()
  })

  it('doet dat wél voor een handmatige rekening MÉT budgetteren', () => {
    // Dezelfde `manual`-rij, maar nu staat de rekening in de budget-map: er is
    // een transactie-as, dus er is een rekeningdetail. Handmatig bijhouden en
    // budgetteren zijn verschillende assen.
    expect(
      detailBankAccountIdForAsset([link({ state: 'manual' })], { 'asset-1': 'ba-1' }, 'asset-1'),
    ).toBe('ba-1')
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
