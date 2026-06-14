import { describe, it, expect } from 'vitest'
import { hasPartner, VALID_HOUSEHOLD_TYPES, type HouseholdType } from '@/lib/household-type'

describe('lib/household-type — hasPartner (canonieke fiscaal-partner-afleiding)', () => {
  describe('canonieke woordenschat (solo | samen | gezin)', () => {
    it('samen → true', () => {
      expect(hasPartner('samen')).toBe(true)
    })
    it('gezin → true', () => {
      expect(hasPartner('gezin')).toBe(true)
    })
    it('solo → false', () => {
      expect(hasPartner('solo')).toBe(false)
    })

    // De kern van de bug: deze drie canonieke waarden moeten correct mappen.
    // Vóór de fix gaf de inline '=== samenwonend || === getrouwd'-vergelijking
    // hier ALTIJD false (= het hele defect).
    it('regressie: alle canonieke partner-typen leveren true', () => {
      for (const t of VALID_HOUSEHOLD_TYPES) {
        const expected = t === 'samen' || t === 'gezin'
        expect(hasPartner(t), `${t}`).toBe(expected)
      }
    })
  })

  describe('back-compat: verouderde woordenschat blijft werken (stale DB-rijen/seeds)', () => {
    it('samenwonend → true', () => {
      expect(hasPartner('samenwonend')).toBe(true)
    })
    it('getrouwd → true', () => {
      expect(hasPartner('getrouwd')).toBe(true)
    })
  })

  describe('edge cases — onbekend/leeg → false', () => {
    it('null → false', () => {
      expect(hasPartner(null)).toBe(false)
    })
    it('undefined → false', () => {
      expect(hasPartner(undefined)).toBe(false)
    })
    it('lege string → false', () => {
      expect(hasPartner('')).toBe(false)
    })
    it('onbekende waarde → false', () => {
      expect(hasPartner('iets-anders')).toBe(false)
    })

    // BELANGRIJK: 'alleenstaand' is het AOW-leefsituatie-enum, GEEN household_type.
    // Het mag hier nooit per ongeluk als partner gelden.
    it('AOW-enum "alleenstaand" → false (geen household_type)', () => {
      expect(hasPartner('alleenstaand')).toBe(false)
    })
  })

  describe('VALID_HOUSEHOLD_TYPES', () => {
    it('bevat exact de drie canonieke typen', () => {
      expect([...VALID_HOUSEHOLD_TYPES].sort()).toEqual(['gezin', 'samen', 'solo'])
    })
  })

  it('HouseholdType-type is bruikbaar als index', () => {
    const t: HouseholdType = 'gezin'
    expect(hasPartner(t)).toBe(true)
  })
})
