import { describe, it, expect } from 'vitest'
import {
  isNumericGrounded,
  normalizeNumericToken,
  numericUnitPairs,
  numericValueSet,
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

describe('re-export vanuit local-news-guard (B10: lokale pad ongebroken)', () => {
  it('exporteert dezelfde functies, niet een kopie', () => {
    expect(guard.normalizeNumericToken).toBe(normalizeNumericToken)
    expect(guard.numericUnitPairs).toBe(numericUnitPairs)
    expect(guard.numericValueSet).toBe(numericValueSet)
    expect(typeof guard.guardPersonalImpact).toBe('function')
  })
})
