/**
 * De gedegradeerde editie: bronkoppen + links (25 sep 2026).
 *
 * REPRO: op 24 sep ~18:00 liep het Anthropic-tegoed leeg. `/api/news` laadde
 * zijn bronartikelen gewoon, maar `streamObject` viel om; de generatie landde
 * als `{ items: [], error }` en de lezer kreeg "Nieuws kon niet worden
 * gegenereerd" — terwijl er 96 bruikbare artikelen in de bak stonden.
 *
 * `bronkoppenEditie` is het B26-patroon één laag hoger: als de verrijking
 * ontbreekt, krijgt de lezer de bronkop met de link in plaats van niets.
 */
import { describe, it, expect } from 'vitest'
import {
  bronkoppenEditie,
  newsItemSchema,
  BRONKOPPEN_EDITIE_MAX,
  BRONKOP_ITEM_PREFIX,
  type Bronartikel,
} from './news-item'

function artikel(over: Partial<Bronartikel> = {}): Bronartikel {
  return {
    id: 'a1',
    title: 'Inflatie stijgt naar 3,3 procent in augustus',
    source_url: 'https://www.cbs.nl/nl-nl/nieuws/2026/37/inflatie',
    source_name: 'CBS — Prijzen',
    category: 'macro',
    published_at: '2026-09-24T06:00:00.000Z',
    ...over,
  }
}

const VANDAAG = '2026-09-25'

describe('bronkoppenEditie', () => {
  it('maakt van een bronartikel een bericht met kop, link en bron — en verder niets', () => {
    const [item] = bronkoppenEditie([artikel()], { vandaag: VANDAAG })

    expect(item).toEqual({
      id: 'news-bron-a1',
      headline: 'Inflatie stijgt naar 3,3 procent in augustus',
      summary: '',
      impactType: 'relevant',
      personalImpact: '',
      impactScore: 1,
      impactDirection: 'neutraal',
      category: 'macro',
      date: '2026-09-24',
      sourceUrl: 'https://www.cbs.nl/nl-nl/nieuws/2026/37/inflatie',
      sourceName: 'CBS — Prijzen',
    })
  })

  it('elk bericht haalt het gedeelde NewsItem-schema', () => {
    // Het degradatiepad mag geen tweede berichtvorm introduceren: dezelfde
    // items gaan door dezelfde persist-validatie als een gewone editie.
    const items = bronkoppenEditie([artikel(), artikel({ id: 'a2' })], { vandaag: VANDAAG })
    for (const item of items) {
      expect(newsItemSchema.safeParse(item).success).toBe(true)
    }
  })

  it('doet GEEN bewering: geen samenvatting, geen impactregel, laagste score', () => {
    // Dit is de kern van B26. Alles wat hier tekst zou krijgen, zou een
    // bewering zijn die niemand heeft gedaan en die niet op de bron te gronden is.
    const [item] = bronkoppenEditie([artikel()], { vandaag: VANDAAG })
    expect(item.summary).toBe('')
    expect(item.personalImpact).toBe('')
    expect(item.impactType).toBe('relevant')
    expect(item.impactScore).toBe(1)
    expect(item.impactDirection).toBe('neutraal')
  })

  it('houdt de volgorde van de aangeleverde selectie aan', () => {
    // `selectSourceArticles` heeft al gesorteerd (recency + spreiding); opnieuw
    // sorteren zou die weging stilletjes overschrijven.
    const items = bronkoppenEditie(
      [artikel({ id: 'a' }), artikel({ id: 'b' }), artikel({ id: 'c' })],
      { vandaag: VANDAAG },
    )
    expect(items.map((i) => i.id)).toEqual(['news-bron-a', 'news-bron-b', 'news-bron-c'])
  })

  // ── De randen van elke tak ──────────────────────────────────────────────

  it('een onbekende of ontbrekende rubriek wordt macro', () => {
    expect(bronkoppenEditie([artikel({ category: null })], { vandaag: VANDAAG })[0].category).toBe('macro')
    expect(bronkoppenEditie([artikel({ category: 'overig' })], { vandaag: VANDAAG })[0].category).toBe('macro')
  })

  it('een bekende rubriek blijft staan', () => {
    expect(bronkoppenEditie([artikel({ category: 'fiscaal' })], { vandaag: VANDAAG })[0].category).toBe('fiscaal')
  })

  it('zonder publicatiedatum valt de datum terug op vandaag', () => {
    expect(bronkoppenEditie([artikel({ published_at: null })], { vandaag: VANDAAG })[0].date).toBe(VANDAAG)
  })

  it('een lege kop levert geen bericht op — een kop is het enige wat dit bericht draagt', () => {
    expect(bronkoppenEditie([artikel({ title: '   ' })], { vandaag: VANDAAG })).toEqual([])
  })

  it('kapt af op BRONKOPPEN_EDITIE_MAX', () => {
    const veel = Array.from({ length: BRONKOPPEN_EDITIE_MAX + 5 }, (_, i) => artikel({ id: `a${i}` }))
    expect(bronkoppenEditie(veel, { vandaag: VANDAAG })).toHaveLength(BRONKOPPEN_EDITIE_MAX)
  })

  it('max 0 en een lege invoer geven beide een lege editie', () => {
    expect(bronkoppenEditie([], { vandaag: VANDAAG })).toEqual([])
    expect(bronkoppenEditie([artikel()], { max: 0, vandaag: VANDAAG })).toEqual([])
  })

  it('een negatieve max valt naar 0, niet naar een slice-vanaf-achteren', () => {
    expect(bronkoppenEditie([artikel(), artikel({ id: 'a2' })], { max: -1, vandaag: VANDAAG })).toEqual([])
  })

  it('het id-voorvoegsel maakt in de leesstatus herkenbaar dat dit een degradatie was', () => {
    const [item] = bronkoppenEditie([artikel({ id: 'abc' })], { vandaag: VANDAAG })
    expect(item.id.startsWith(BRONKOP_ITEM_PREFIX)).toBe(true)
  })
})
