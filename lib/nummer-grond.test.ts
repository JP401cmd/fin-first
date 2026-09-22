import { describe, it, expect } from 'vitest'
import {
  datumTokens,
  isNumericGrounded,
  normalizeNumericToken,
  numericUnitPairs,
  numericValueSet,
  zonderDatums,
} from './nummer-grond'
import * as guard from './ai/local/local-news-guard'

describe('normalizeNumericToken', () => {
  it('brengt nl-NL, en-US en decimale komma tot dezelfde vorm', () => {
    expect(normalizeNumericToken('1.234')).toBe('1234')
    expect(normalizeNumericToken('1,234')).toBe('1234')
    expect(normalizeNumericToken('1.234,56')).toBe('1234.56')
    expect(normalizeNumericToken('3,4')).toBe('3.4')
    expect(normalizeNumericToken('3.40')).toBe('3.4')
    expect(normalizeNumericToken('007')).toBe('7')
  })
})

describe('numericUnitPairs', () => {
  it('herkent de eenheid vóór en ná het getal', () => {
    const pairs = numericUnitPairs('€ 59.357, 1,28 procent, 0,25 procentpunt, 36%, 2027, 1.200 euro')
    expect(pairs).toEqual([
      { value: '59357', unit: 'eur' },
      { value: '1.28', unit: 'pct' },
      { value: '0.25', unit: 'pct' },
      { value: '36', unit: 'pct' },
      { value: '2027', unit: 'bare' },
      { value: '1200', unit: 'eur' },
    ])
  })
})

describe('numericUnitPairs — grootte-woorden', () => {
  it('vermenigvuldigt duizend/miljoen/miljard/k en houdt de eenheid erná', () => {
    expect(numericUnitPairs('36 duizend euro, 1,5 miljard, 60k, 2 mln euro')).toEqual([
      { value: '36000', unit: 'eur' },
      { value: '1500000000', unit: 'bare' },
      { value: '60000', unit: 'bare' },
      { value: '2000000', unit: 'eur' },
    ])
  })

  it('"36 duizend euro" gront niet op "36 procent"', () => {
    const grondslag = numericValueSet('Het tarief is 36 procent.')
    const [claim] = numericUnitPairs('een bedrag van 36 duizend euro')
    expect(isNumericGrounded(grondslag, claim.value, claim.unit)).toBe(false)
  })

  it('een k in een gewoon woord is geen vermenigvuldiger', () => {
    expect(numericUnitPairs('in 2027 komt het kabinet')).toEqual([{ value: '2027', unit: 'bare' }])
  })
})

describe('isNumericGrounded — eenheidsbewust', () => {
  const grondslag = numericValueSet('In 2026 stijgt het tarief naar 36 procent; het bedrag is €2.026.')

  it('een kale claim steunt op elke bron', () => {
    expect(isNumericGrounded(grondslag, '2026', 'bare')).toBe(true)
    expect(isNumericGrounded(grondslag, '36', 'bare')).toBe(true)
  })

  it('een claim mét eenheid steunt alleen op dezelfde eenheid', () => {
    expect(isNumericGrounded(grondslag, '2026', 'eur')).toBe(true) // "€2.026" staat er
    expect(isNumericGrounded(grondslag, '36', 'eur')).toBe(false) // 36 is een percentage
    expect(isNumericGrounded(grondslag, '2026', 'pct')).toBe(false)
  })
})

describe('isNumericGrounded — kaalStreng (opt-in, 1F fase 2)', () => {
  const grondslag = numericValueSet('Het tarief is 36 procent en het bedrag is €450.')

  it('zonder de vlag gront een kale claim óók op een € of % uit de bron (ongewijzigd gedrag)', () => {
    expect(isNumericGrounded(grondslag, '36', 'bare')).toBe(true)
    expect(isNumericGrounded(grondslag, '450', 'bare')).toBe(true)
    expect(isNumericGrounded(grondslag, '36', 'bare', {})).toBe(true)
  })

  it('mét de vlag steunt een kale claim alleen op een kaal brongetal', () => {
    expect(isNumericGrounded(grondslag, '36', 'bare', { kaalStreng: true })).toBe(false)
    expect(isNumericGrounded(grondslag, '450', 'bare', { kaalStreng: true })).toBe(false)
    const metJaartal = numericValueSet('In 2027 verandert de regel; 12 gemeenten doen mee.')
    expect(isNumericGrounded(metJaartal, '2027', 'bare', { kaalStreng: true })).toBe(true)
    expect(isNumericGrounded(metJaartal, '12', 'bare', { kaalStreng: true })).toBe(true)
  })

  it('de vlag verandert niets aan een claim MÉT eenheid', () => {
    for (const streng of [false, true]) {
      expect(isNumericGrounded(grondslag, '36', 'pct', { kaalStreng: streng })).toBe(true)
      expect(isNumericGrounded(grondslag, '36', 'eur', { kaalStreng: streng })).toBe(false)
      expect(isNumericGrounded(grondslag, '450', 'eur', { kaalStreng: streng })).toBe(true)
    }
  })
})

describe('datumTokens', () => {
  it('herkent de vier schrijfwijzen en normaliseert naar ISO', () => {
    const t = datumTokens('Per 2026-01-01, uiterlijk 4-9-2026, ingang 01-01-2026 en op 1 januari 2026.')
    expect(t.map((d) => d.iso)).toEqual(['2026-01-01', '2026-09-04', '2026-01-01', '2026-01-01'])
    expect(t.map((d) => d.tekst)).toEqual(['2026-01-01', '4-9-2026', '01-01-2026', '1 januari 2026'])
  })

  it('een onmogelijke datum is geen datum', () => {
    expect(datumTokens('op 31-02-2026 en 2026-13-01')).toEqual([])
  })

  it('markeert een datum naast een publicatiewerkwoord', () => {
    const [d] = datumTokens('Het kabinet heeft op 1 januari 2026 het pakket Belastingplan 2026 gepubliceerd.')
    expect(d.bijPublicatie).toBe(true)
    const [e] = datumTokens('De regeling gaat op 1 januari 2026 in en geldt voor iedereen met een huurwoning.')
    expect(e.bijPublicatie).toBe(false)
  })

  it('zonderDatums laat de overige getallen op hun plek staan', () => {
    const zonder = zonderDatums('Op 1 januari 2026 gaat het tarief naar 36 procent.')
    expect(zonder).not.toMatch(/januari/)
    expect(zonder).toHaveLength('Op 1 januari 2026 gaat het tarief naar 36 procent.'.length)
    expect(numericUnitPairs(zonder)).toEqual([{ value: '36', unit: 'pct' }])
  })
})

describe('re-export vanuit local-news-guard (B10: lokale pad ongebroken)', () => {
  it('exporteert dezelfde functies, niet een kopie', () => {
    expect(guard.normalizeNumericToken).toBe(normalizeNumericToken)
    expect(guard.numericUnitPairs).toBe(numericUnitPairs)
    expect(guard.numericValueSet).toBe(numericValueSet)
    expect(typeof guard.guardPersonalImpact).toBe('function')
  })

  it('guardPersonalImpact draagt het losse (niet-strenge) gedrag ongewijzigd door', () => {
    // De lokale guard geeft géén opties mee: een kale claim mag op een
    // €-bron steunen, precies zoals vóór 1F fase 2.
    expect(guard.guardPersonalImpact('Dat scheelt 450 per maand.', ['Je betaalt €450 per maand.'])).toBe(
      'Dat scheelt 450 per maand.',
    )
    expect(guard.guardPersonalImpact('Dat scheelt 451 per maand.', ['Je betaalt €450 per maand.'])).toBeNull()
  })
})
