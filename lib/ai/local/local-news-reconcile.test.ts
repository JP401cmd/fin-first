import { describe, it, expect } from 'vitest'
import {
  localNewsClientItemSchema,
  reconcileLocalEdition,
  type LocalNewsClientItem,
} from './local-news-reconcile'
import { LOCAL_NEWS_MAX_ITEMS } from './local-news-select'
import type { LocalNewsSource } from './local-news-source'

function source(id: string, overrides: Partial<LocalNewsSource> = {}): LocalNewsSource {
  return {
    id,
    title: `Artikel ${id}`,
    summary: null,
    sourceUrl: `https://echte-bron.example/${id}`,
    sourceName: 'Rijksoverheid',
    category: 'fiscaal',
    date: '2026-03-07',
    potentialImpact: null,
    ...overrides,
  }
}

function clientItem(articleId: string, overrides: Partial<LocalNewsClientItem> = {}): LocalNewsClientItem {
  return {
    id: `news-local-${articleId}`,
    headline: `Kop ${articleId}`,
    summary: `Samenvatting ${articleId}`,
    personalImpact: 'Iets relevants.',
    impactType: 'relevant',
    impactScore: 4,
    impactDirection: 'neutraal',
    ...overrides,
  }
}

describe('localNewsClientItemSchema — de wire-vorm draagt de invariant', () => {
  it('heeft GEEN veld voor sourceUrl, sourceName, category of date', () => {
    // De sterkst mogelijke vorm van "de bron-URL komt nooit van de client":
    // er is geen sleutel om 'm in te zetten. Zod strip't onbekende velden.
    const parsed = localNewsClientItemSchema.parse({
      ...clientItem('a'),
      sourceUrl: 'https://kwaadaardig.example/phishing',
      sourceName: 'Nepbron',
      category: 'rente',
      date: '1999-01-01',
    })

    expect(parsed).not.toHaveProperty('sourceUrl')
    expect(parsed).not.toHaveProperty('sourceName')
    expect(parsed).not.toHaveProperty('category')
    expect(parsed).not.toHaveProperty('date')
  })
})

describe('reconcileLocalEdition — de server is de beslissende laag', () => {
  it('zet sourceUrl, sourceName, category en date uit de BRONRIJ', () => {
    const sources = [source('a', { sourceUrl: 'https://echt.example/a', sourceName: 'ECB', category: 'rente', date: '2026-02-01' })]
    const { kept } = reconcileLocalEdition([clientItem('a')], sources)

    expect(kept).toHaveLength(1)
    expect(kept[0].sourceUrl).toBe('https://echt.example/a')
    expect(kept[0].sourceName).toBe('ECB')
    expect(kept[0].category).toBe('rente')
    expect(kept[0].date).toBe('2026-02-01')
  })

  it('gooit een bericht weg dat naar een onbekend artikel wijst', () => {
    // Grounding: bestaat het bronartikel niet, dan bestaat het bericht niet.
    const { kept, dropped } = reconcileLocalEdition(
      [clientItem('bestaat-niet')],
      [source('a')],
    )
    expect(kept).toEqual([])
    expect(dropped).toBe(1)
  })

  it('gooit een bericht met een niet-lokaal id weg', () => {
    const { kept, dropped } = reconcileLocalEdition(
      [clientItem('a', { id: 'news-2026-03-07-1' })],
      [source('a')],
    )
    expect(kept).toEqual([])
    expect(dropped).toBe(1)
  })

  it('ontdubbelt op id — de eerste telt', () => {
    const { kept, dropped } = reconcileLocalEdition(
      [clientItem('a', { headline: 'Eerste' }), clientItem('a', { headline: 'Tweede' })],
      [source('a')],
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].headline).toBe('Eerste')
    expect(dropped).toBe(1)
  })

  it('kapt hard af op 8, ook als de client er meer stuurt', () => {
    const sources = Array.from({ length: 20 }, (_, i) => source(`a${i}`))
    const items = sources.map((s) => clientItem(s.id))
    const { kept } = reconcileLocalEdition(items, sources)
    expect(kept).toHaveLength(LOCAL_NEWS_MAX_ITEMS)
  })

  it('klemt een buiten-bereik impactScore op 1-5', () => {
    const sources = [source('a'), source('b')]
    const { kept } = reconcileLocalEdition(
      [
        clientItem('a', { impactScore: 99 }),
        clientItem('b', { impactScore: -4 }),
      ],
      sources,
    )
    const scores = kept.map((k) => k.impactScore).sort()
    expect(scores).toEqual([1, 5])
  })

  it('degradeert "direct" zonder impactzin naar "relevant"', () => {
    const { kept } = reconcileLocalEdition(
      [clientItem('a', { impactType: 'direct', personalImpact: '   ' })],
      [source('a')],
    )
    expect(kept[0].impactType).toBe('relevant')
    expect(kept[0].personalImpact).toBe('')
  })

  it('sorteert direct-impact eerst, daarbinnen op score aflopend', () => {
    const sources = [source('a'), source('b'), source('c')]
    const { kept } = reconcileLocalEdition(
      [
        clientItem('a', { impactType: 'relevant', impactScore: 5 }),
        clientItem('b', { impactType: 'direct', impactScore: 3, personalImpact: 'Concreet.' }),
        clientItem('c', { impactType: 'direct', impactScore: 5, personalImpact: 'Concreet.' }),
      ],
      sources,
    )
    expect(kept.map((k) => k.id)).toEqual(['news-local-c', 'news-local-b', 'news-local-a'])
  })

  it('levert een lege editie op wanneer de client niets stuurt', () => {
    expect(reconcileLocalEdition([], [source('a')])).toEqual({ kept: [], dropped: 0 })
  })
})
