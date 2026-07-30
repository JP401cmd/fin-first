import { describe, it, expect } from 'vitest'
import {
  ACCOUNT_TYPES,
  accountTypeToCashSubtype,
  cashSubtypeToAccountType,
} from './account-types'
import { ASSET_SUBTYPE_LABELS } from './asset-data'

/**
 * De brug tussen twee woordenlijsten voor hetzelfde begrip:
 * `bank_accounts.account_type` (CHECK-constraint) en `assets.subtype` voor een
 * cash-bezit (`CashSubtype`). Vier van de zes waarden zijn identiek; 'savings' ↔
 * 'savings_account' en 'other' ↔ 'other_cash' niet.
 *
 * Waarom dit getest wordt en niet "gewoon klopt": `syncBankAccountCompanion`
 * schreef `asset.subtype` rechtstreeks naar `account_type`, dus een bezit met
 * subtype 'savings_account' liet die write op de CHECK-constraint stuklopen — en
 * die fout wordt daar niet gelezen, dus de budgetteringskeuze deed stil niets.
 * Zolang de bankkoppeling élke rekening als 'checking' stempelde was dat pad
 * onbereikbaar; besluit B3 (fase 5) maakt het bereikbaar.
 */

const ALLOWED_ACCOUNT_TYPES = new Set(ACCOUNT_TYPES.map((t) => t.value as string))
const CASH_SUBTYPES = Object.keys(ASSET_SUBTYPE_LABELS.cash ?? {})

describe('cashSubtypeToAccountType', () => {
  it('vertaalt de twee afwijkende namen', () => {
    expect(cashSubtypeToAccountType('savings_account')).toBe('savings')
    expect(cashSubtypeToAccountType('other_cash')).toBe('other')
  })

  it('laat de vier identieke namen ongemoeid', () => {
    expect(cashSubtypeToAccountType('checking')).toBe('checking')
    expect(cashSubtypeToAccountType('joint')).toBe('joint')
    expect(cashSubtypeToAccountType('business')).toBe('business')
    expect(cashSubtypeToAccountType('contant_geld')).toBe('contant_geld')
  })

  it('leeg/ontbrekend subtype → checking (het bestaande companion-gedrag en de kolomdefault)', () => {
    expect(cashSubtypeToAccountType(null)).toBe('checking')
    expect(cashSubtypeToAccountType(undefined)).toBe('checking')
    expect(cashSubtypeToAccountType('')).toBe('checking')
  })

  it('een subtype buiten de cash-woordenlijst → other, niet rauw doorgeschreven', () => {
    // 'deposito' is een geldig subtype voor asset_type 'savings', maar bestaat
    // niet in de account_type-constraint. Rauw doorschrijven = stille
    // CHECK-schending; 'other' is de eerlijke samenvatting.
    expect(cashSubtypeToAccountType('deposito')).toBe('other')
    expect(cashSubtypeToAccountType('etf')).toBe('other')
  })

  it('levert voor ELK cash-subtype een waarde die de CHECK-constraint toestaat', () => {
    expect(CASH_SUBTYPES.length).toBeGreaterThan(0)
    for (const subtype of CASH_SUBTYPES) {
      expect(ALLOWED_ACCOUNT_TYPES.has(cashSubtypeToAccountType(subtype))).toBe(true)
    }
  })
})

describe('accountTypeToCashSubtype', () => {
  it('is de inverse van cashSubtypeToAccountType voor elk cash-subtype', () => {
    for (const subtype of CASH_SUBTYPES) {
      expect(accountTypeToCashSubtype(cashSubtypeToAccountType(subtype))).toBe(subtype)
    }
  })

  it('levert voor ELK toegestaan account_type een bestaand cash-subtype', () => {
    for (const type of ALLOWED_ACCOUNT_TYPES) {
      expect(CASH_SUBTYPES).toContain(accountTypeToCashSubtype(type))
    }
  })

  it('leeg/onbekend account_type → checking respectievelijk other_cash', () => {
    expect(accountTypeToCashSubtype(null)).toBe('checking')
    expect(accountTypeToCashSubtype('')).toBe('checking')
    expect(accountTypeToCashSubtype('iets_nieuws')).toBe('other_cash')
  })
})
