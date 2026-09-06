import { describe, it, expect } from 'vitest'
import { scrubRoute } from './scrub'

/**
 * Corpus-gedreven tests voor scrubRoute — de AVG-garantie van de eigen
 * web-vitals/RUM-collectie (feature 884): id's mogen NOOIT in de `web_vitals`
 * tabel belanden. Zie lib/web-vitals/scrub.ts voor de heuristiek-volgorde
 * (UUID / numeriek / lang hex-token / cijfer+allowlist).
 */

describe('scrubRoute', () => {
  it('vervangt een UUID-segment door [id]', () => {
    expect(scrubRoute('/toekomst/bibliotheek/3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(
      '/toekomst/bibliotheek/[id]',
    )
  })

  it('vervangt een puur numeriek segment door [id]', () => {
    expect(scrubRoute('/overzicht/bezittingen/42')).toBe('/overzicht/bezittingen/[id]')
  })

  it('vervangt een lang hex-token zonder cijfer door [id]', () => {
    expect(scrubRoute('/x/deadbeefdeadbeef')).toBe('/x/[id]')
  })

  describe('bekende cijfer-woorden blijven staan (allowlist-regressie)', () => {
    it.each([
      ['/overzicht/belasting/box3', '/overzicht/belasting/box3'],
      ['/overzicht/belasting/box1', '/overzicht/belasting/box1'],
      ['/overzicht/belasting/box1-income', '/overzicht/belasting/box1-income'],
      ['/overzicht/belasting/box2', '/overzicht/belasting/box2'],
      ['/apps/trading212', '/apps/trading212'],
    ])('%s blijft %s', (input, expected) => {
      expect(scrubRoute(input)).toBe(expected)
    })
  })

  it('knipt query-string en hash af', () => {
    expect(scrubRoute('/overzicht/budget/transacties?maand=3#top')).toBe(
      '/overzicht/budget/transacties',
    )
  })

  it('scrubt een genest dynamisch segment tussen woord-segmenten', () => {
    expect(
      scrubRoute('/overzicht/bezittingen/woning/3fa85f64-5717-4562-b3fc-2c963f66afa6'),
    ).toBe('/overzicht/bezittingen/woning/[id]')
  })

  describe('randgevallen', () => {
    it('lege string → /', () => {
      expect(scrubRoute('')).toBe('/')
    })

    it('/ → /', () => {
      expect(scrubRoute('/')).toBe('/')
    })

    it('leidende/dubbele/afsluitende slashes worden genormaliseerd', () => {
      expect(scrubRoute('//overzicht///bezittingen/')).toBe('/overzicht/bezittingen')
    })

    it('niet-string input valt terug op /', () => {
      // @ts-expect-error — bewust een niet-string doorgeven (defensieve cast-tak)
      expect(scrubRoute(null)).toBe('/')
      // @ts-expect-error
      expect(scrubRoute(undefined)).toBe('/')
      // @ts-expect-error
      expect(scrubRoute(42)).toBe('/')
    })

    it('absurde diepte wordt gecapt op MAX_SEGMENTS (12)', () => {
      const segments = Array.from({ length: 20 }, (_, i) => `seg${i}`)
      const result = scrubRoute('/' + segments.join('/'))
      expect(result.split('/').filter(Boolean).length).toBeLessThanOrEqual(12)
    })

    it('zeer lange route wordt gecapt op ≤512 tekens', () => {
      // 'z' is bewust geen hex-char en bevat geen cijfer, dus het segment
      // overleeft de scrub ongewijzigd — zo test dit echt de MAX_LENGTH-cap
      // en niet (per ongeluk) de hex-token-heuristiek.
      const longSegment = 'z'.repeat(1000)
      const result = scrubRoute(`/foo/${longSegment}`)
      expect(result.length).toBeLessThanOrEqual(512)
    })
  })

  it('AVG-assertion (AC8): geen enkele realistische route lekt de originele id-substring', () => {
    const cases = [
      { path: '/overzicht/bezittingen/9f8e7d6c-5b4a-4321-9876-abcdef012345', leak: '9f8e7d6c-5b4a-4321-9876-abcdef012345' },
      { path: '/overzicht/schulden/1337', leak: '1337' },
      { path: '/toekomst/bibliotheek/scenario-88274611', leak: '88274611' },
      { path: '/overzicht/budget/transacties/deadbeefcafebabe', leak: 'deadbeefcafebabe' },
      { path: '/mijn/huishouden/leden/00000000-0000-4000-8000-000000000001', leak: '00000000-0000-4000-8000-000000000001' },
    ]

    for (const { path, leak } of cases) {
      const result = scrubRoute(path)
      expect(result).not.toContain(leak)
    }
  })
})
