import { describe, expect, it } from 'vitest'
import { BRON_OORZAKEN } from '@/lib/news-sources'
import { bronKlasse, oorzaakVan } from './news-bron-gezondheid'

describe('oorzaakVan', () => {
  it('neemt de vastgelegde oorzaak over', () => {
    expect(oorzaakVan({ oorzaak: 'dns', items: 0 })).toBe('dns')
  })

  it('een regel van vóór ADR 0176 zonder oorzaak: leverde hij iets, dan is het ok', () => {
    expect(oorzaakVan({ items: 3 })).toBe('ok')
    expect(oorzaakVan({ oorzaak: null, items: 3 })).toBe('ok')
  })

  it('een oude regel zonder oorzaak en zonder items blijft onbekend', () => {
    expect(oorzaakVan({ items: 0 })).toBeNull()
  })
})

describe('bronKlasse', () => {
  it('een bron die leverde is goed', () => {
    expect(bronKlasse({ oorzaak: 'ok', items: 4 })).toBe('goed')
  })

  it('niets gevonden, geen model of een storing bij de bron zelf is "let op"', () => {
    expect(bronKlasse({ oorzaak: 'leeg', items: 0 })).toBe('let-op')
    expect(bronKlasse({ oorzaak: 'geen_model', items: 0 })).toBe('let-op')
    expect(bronKlasse({ oorzaak: 'storing', items: 0 })).toBe('let-op')
  })

  it('een onbereikbare of onbruikbare bron is een fout', () => {
    for (const oorzaak of ['http_fout', 'dns', 'timeout', 'netwerk', 'geen_feed', 'adres_geweigerd'] as const) {
      expect(bronKlasse({ oorzaak, items: 0 }), oorzaak).toBe('fout')
    }
  })

  it('zonder oorzaak en zonder items: onbekend', () => {
    expect(bronKlasse({ items: 0 })).toBe('onbekend')
  })

  it('elke bestaande oorzaak valt in precies één klasse', () => {
    for (const oorzaak of BRON_OORZAKEN) {
      expect(['goed', 'let-op', 'fout'], oorzaak).toContain(bronKlasse({ oorzaak, items: 1 }))
    }
  })
})
