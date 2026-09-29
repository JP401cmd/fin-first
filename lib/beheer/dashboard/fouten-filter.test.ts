import { describe, expect, it } from 'vitest'
import { foutenHref } from './doorklik'
import { heeftFilter, leesFoutenFilter, zichtbareSoorten } from './fouten-filter'

const params = (query: string) => new URLSearchParams(query)

describe('leesFoutenFilter', () => {
  it('leest een geldige soort en context', () => {
    expect(leesFoutenFilter(params('soort=0123456789abcdef&context=ai:'))).toEqual({
      soort: '0123456789abcdef',
      context: 'ai:',
    })
  })

  it('zonder parameters is er geen filter', () => {
    const filter = leesFoutenFilter(params(''))
    expect(filter).toEqual({ soort: null, context: null })
    expect(heeftFilter(filter)).toBe(false)
  })

  it('negeert een soort die niet de vorm van een sleutel heeft', () => {
    for (const waarde of ['kort', '0123456789ABCDEF', '0123456789abcdef0', 'zzzzzzzzzzzzzzzz', "' or 1=1 --"]) {
      expect(leesFoutenFilter(params(`soort=${encodeURIComponent(waarde)}`)).soort, waarde).toBeNull()
    }
  })

  it('negeert een context met vreemde tekens of van meer dan veertig tekens', () => {
    for (const waarde of ['<script>', 'ai: drop', '%', ':ai', 'a'.repeat(41)]) {
      expect(leesFoutenFilter(params(`context=${encodeURIComponent(waarde)}`)).context, waarde).toBeNull()
    }
    expect(leesFoutenFilter(params(`context=${'a'.repeat(40)}`)).context).toHaveLength(40)
  })

  it('maakt de context klein, zodat het filter niet op hoofdletters struikelt', () => {
    expect(leesFoutenFilter(params('context=AI:Chat')).context).toBe('ai:chat')
  })

  it('leest terug wat het dashboard schrijft', () => {
    const url = new URL(foutenHref({ soort: '0123456789abcdef', context: 'ai:' }), 'https://voorbeeld.test')
    expect(leesFoutenFilter(url.searchParams)).toEqual({ soort: '0123456789abcdef', context: 'ai:' })
  })
})

describe('zichtbareSoorten', () => {
  const groups = [
    { signature: 'a'.repeat(16), context: 'ai:chat', open: true },
    { signature: 'b'.repeat(16), context: 'AI:briefing', open: false },
    { signature: 'c'.repeat(16), context: 'client:render', open: true },
    { signature: 'd'.repeat(16), context: null, open: false },
  ]
  const ids = (lijst: typeof groups) => lijst.map((g) => g.signature[0]).join('')
  const geen = { soort: null, context: null }

  it('zonder filter: alleen open soorten, of alles met "toon afgehandeld"', () => {
    expect(ids(zichtbareSoorten(groups, geen, false))).toBe('ac')
    expect(ids(zichtbareSoorten(groups, geen, true))).toBe('abcd')
  })

  it('filtert op het begin van de context, ongeacht hoofdletters', () => {
    expect(ids(zichtbareSoorten(groups, { soort: null, context: 'ai:' }, true))).toBe('ab')
    expect(ids(zichtbareSoorten(groups, { soort: null, context: 'ai:' }, false))).toBe('a')
  })

  it('een soort zonder context valt buiten elk contextfilter', () => {
    expect(ids(zichtbareSoorten(groups, { soort: null, context: 'client' }, true))).toBe('c')
  })

  it('de uitgelichte soort blijft zichtbaar, ook als hij is afgehandeld en verborgen zou zijn', () => {
    expect(ids(zichtbareSoorten(groups, { soort: 'd'.repeat(16), context: null }, false))).toBe('acd')
  })

  it('de uitgelichte soort blijft zichtbaar, ook buiten het contextfilter', () => {
    expect(ids(zichtbareSoorten(groups, { soort: 'c'.repeat(16), context: 'ai:' }, false))).toBe('ac')
  })

  it('een uitgelichte soort die niet bestaat verandert de lijst niet', () => {
    expect(ids(zichtbareSoorten(groups, { soort: 'f'.repeat(16), context: null }, false))).toBe('ac')
  })
})
