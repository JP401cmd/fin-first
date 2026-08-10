import { describe, it, expect } from 'vitest'
import { isResolvableTicker, normalizeTicker } from './yahoo-ticker'

/**
 * De voorbeelden hieronder komen uit een echt account met 109
 * `investment_holdings`-rijen. Ze zijn de reden dat deze helper bestaat: 95 van
 * die rijen dragen een broker-omschrijving in het ticker-veld, geen symbool.
 */
describe('isResolvableTicker', () => {
  describe('wél oplosbaar — echte Yahoo-symbolen uit de dataset', () => {
    const resolvable = [
      'MRVL',      // US-aandeel, geen suffix
      'PLTR',
      'ADYEN.AS',  // Euronext Amsterdam
      'CMCOM.AS',
      'VWRD.L',    // London, één-letter-suffix
      'AIAG.L',
    ]

    for (const ticker of resolvable) {
      it(`accepteert ${ticker}`, () => {
        expect(isResolvableTicker(ticker)).toBe(true)
      })
    }

    it('accepteert een streepje-klasse zoals BRK-B', () => {
      expect(isResolvableTicker('BRK-B')).toBe(true)
    })

    it('accepteert een cijferbasis mét letter-suffix (Hongkong)', () => {
      expect(isResolvableTicker('0700.HK')).toBe(true)
    })
  })

  describe('niet oplosbaar — broker-omschrijvingen uit de dataset', () => {
    const unresolvable = [
      'AEX 485.9SPSOPENG',
      'BNP GOUD TURBO LONG SL 2671.9407 STR 2619.5497 R 10',
      'ADR ON BAIDU, INC. CLASS A',
    ]

    for (const description of unresolvable) {
      it(`weigert "${description}"`, () => {
        expect(isResolvableTicker(description)).toBe(false)
      })
    }
  })

  describe('niet oplosbaar — vormfouten', () => {
    it('weigert leeg en whitespace-only', () => {
      expect(isResolvableTicker('')).toBe(false)
      expect(isResolvableTicker('   ')).toBe(false)
    })

    it('weigert null en undefined', () => {
      expect(isResolvableTicker(null)).toBe(false)
      expect(isResolvableTicker(undefined)).toBe(false)
    })

    it('weigert elke string met een spatie, ook een korte', () => {
      expect(isResolvableTicker('AB CD')).toBe(false)
    })

    it('weigert een komma', () => {
      expect(isResolvableTicker('BIDU,A')).toBe(false)
    })

    it('weigert langer dan 12 tekens', () => {
      expect(isResolvableTicker('ABCDEFGHIJKLM')).toBe(false)
      expect(isResolvableTicker('ABCDEFGHIJKL')).toBe(true) // exact 12 mag nog
    })

    it('weigert een leidende of afsluitende scheider', () => {
      expect(isResolvableTicker('.AS')).toBe(false)
      expect(isResolvableTicker('MRVL.')).toBe(false)
      expect(isResolvableTicker('-B')).toBe(false)
    })

    it('weigert dubbele scheiders', () => {
      expect(isResolvableTicker('MRVL..AS')).toBe(false)
      expect(isResolvableTicker('MRVL--B')).toBe(false)
    })

    it('weigert een waarde zonder enkele letter (prijsfragment)', () => {
      expect(isResolvableTicker('485.9')).toBe(false)
      expect(isResolvableTicker('2671.9407')).toBe(false)
      expect(isResolvableTicker('10')).toBe(false)
    })

    it('weigert een indexsymbool met ^ (holdings zijn geen indices)', () => {
      expect(isResolvableTicker('^AEX')).toBe(false)
    })

    it('weigert overige leestekens', () => {
      expect(isResolvableTicker('MRVL/US')).toBe(false)
      expect(isResolvableTicker('MRVL_US')).toBe(false)
      expect(isResolvableTicker('MRVL+')).toBe(false)
    })
  })

  describe('ISIN — de valstrik die door een naïeve charset-toets glipt', () => {
    // 12 tekens, geen spatie, volledig alfanumeriek: haalt SYMBOL_PATTERN én de
    // lengtegrens. Alleen een expliciete ISIN-uitzondering houdt hem tegen.
    const isins = ['NL0011794037', 'US0378331005', 'IE00B3RBWM25', 'LU1781541179']

    for (const isin of isins) {
      it(`weigert ISIN ${isin}`, () => {
        expect(isResolvableTicker(isin)).toBe(false)
      })
    }
  })

  describe('normalisatie', () => {
    it('trimt omliggende whitespace vóór de toets', () => {
      expect(isResolvableTicker('  ADYEN.AS  ')).toBe(true)
    })

    it('accepteert kleine letters (wordt genormaliseerd, net als de fetch doet)', () => {
      expect(isResolvableTicker('adyen.as')).toBe(true)
    })
  })
})

describe('normalizeTicker', () => {
  it('trimt en uppercased', () => {
    expect(normalizeTicker('  adyen.as ')).toBe('ADYEN.AS')
  })

  it('geeft null bij leeg, whitespace, null en niet-string', () => {
    expect(normalizeTicker('')).toBeNull()
    expect(normalizeTicker('   ')).toBeNull()
    expect(normalizeTicker(null)).toBeNull()
    expect(normalizeTicker(undefined)).toBeNull()
  })

  it('maakt varianten van hetzelfde symbool tot één dedup-sleutel', () => {
    const variants = ['ADYEN.AS', 'adyen.as', ' ADYEN.AS ']
    const unique = new Set(variants.map((v) => normalizeTicker(v)))
    expect(unique.size).toBe(1)
  })
})
