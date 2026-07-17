import { describe, it, expect } from 'vitest'
import {
  hasPartner,
  householdTypeLabel,
  HOUSEHOLD_TYPE_LABELS,
  VALID_HOUSEHOLD_TYPES,
  type HouseholdType,
} from '@/lib/household-type'

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

describe('lib/household-type — householdTypeLabel (NL-labelweergave)', () => {
  // De kern van de bug: de vorige labelmap in de rapportagelaag was gekeyd op
  // single/partner/family/single_parent en matchte dus NOOIT een echte
  // DB-waarde → de ruwe string ("samen") werd getoond.
  describe('canonieke waarden (solo | samen | gezin) → net NL-label', () => {
    it('solo → Alleenstaand', () => {
      expect(householdTypeLabel('solo')).toBe('Alleenstaand')
    })
    it('samen → Samenwonend / getrouwd', () => {
      expect(householdTypeLabel('samen')).toBe('Samenwonend / getrouwd')
    })
    it('gezin → Gezin met kinderen', () => {
      expect(householdTypeLabel('gezin')).toBe('Gezin met kinderen')
    })

    it('regressie: elke canonieke waarde levert een echt label, nooit de ruwe string', () => {
      for (const t of VALID_HOUSEHOLD_TYPES) {
        const label = householdTypeLabel(t)
        expect(label, `${t}`).toBe(HOUSEHOLD_TYPE_LABELS[t])
        // Het label mag nooit gelijk zijn aan de ruwe DB-waarde (= het defect).
        expect(label, `${t} niet ruw`).not.toBe(t)
      }
    })
  })

  describe('back-compat: verouderde woordenschat → zelfde label als samen', () => {
    it('samenwonend → Samenwonend / getrouwd', () => {
      expect(householdTypeLabel('samenwonend')).toBe('Samenwonend / getrouwd')
    })
    it('getrouwd → Samenwonend / getrouwd', () => {
      expect(householdTypeLabel('getrouwd')).toBe('Samenwonend / getrouwd')
    })
  })

  describe('veilige fallback — onbekend/ontbrekend → nette default, nooit ruwe string', () => {
    it('null → Alleenstaand', () => {
      expect(householdTypeLabel(null)).toBe('Alleenstaand')
    })
    it('undefined → Alleenstaand', () => {
      expect(householdTypeLabel(undefined)).toBe('Alleenstaand')
    })
    it('lege string → Alleenstaand', () => {
      expect(householdTypeLabel('')).toBe('Alleenstaand')
    })
    it('dode legacy kolom-default "single" → Alleenstaand (geen ruwe "single")', () => {
      expect(householdTypeLabel('single')).toBe('Alleenstaand')
    })
    it('volledig onbekende waarde → Alleenstaand (geen ruwe string)', () => {
      expect(householdTypeLabel('iets-anders')).toBe('Alleenstaand')
    })
  })

  it('HOUSEHOLD_TYPE_LABELS dekt exact de canonieke set', () => {
    expect(Object.keys(HOUSEHOLD_TYPE_LABELS).sort()).toEqual(['gezin', 'samen', 'solo'])
  })
})
