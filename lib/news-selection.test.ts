import { describe, it, expect } from 'vitest'
import {
  selectSourceArticles,
  filterGroundedItems,
  dedupeSimilarTitles,
  ensureUniqueArticleUrl,
  normalizeUrl,
  type SelectableArticle,
} from './news-selection'

const NOW = new Date('2026-06-11T12:00:00Z')

function article(overrides: Partial<SelectableArticle> & { id: string }): SelectableArticle {
  return {
    title: `Artikel ${overrides.id}`,
    summary: null,
    source_url: `https://example.nl/${overrides.id}`,
    source_name: 'Test',
    category: 'fiscaal',
    published_at: '2026-06-10T00:00:00Z',
    potential_impact: null,
    is_used: false,
    ...overrides,
  }
}

describe('selectSourceArticles', () => {
  it('geeft alles terug (gesorteerd) als er minder artikelen dan de limiet zijn', () => {
    const articles = [
      article({ id: 'a', published_at: '2026-05-01T00:00:00Z' }),
      article({ id: 'b', published_at: '2026-06-10T00:00:00Z' }),
    ]
    const result = selectSourceArticles(articles, { limit: 10, now: NOW })
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('b') // recenter = hoger
  })

  it('spreidt over categorieën via round-robin', () => {
    const articles = [
      ...['f1', 'f2', 'f3', 'f4'].map((id) => article({ id, category: 'fiscaal' })),
      ...['r1', 'r2'].map((id) => article({ id, category: 'rente' })),
      ...['p1', 'p2'].map((id) => article({ id, category: 'pensioen' })),
    ]
    const result = selectSourceArticles(articles, { limit: 6, now: NOW })
    const categories = result.map((a) => a.category)
    // Elke categorie komt aan bod vóór een categorie dubbel pakt
    expect(categories.slice(0, 3).sort()).toEqual(['fiscaal', 'pensioen', 'rente'])
    expect(result).toHaveLength(6)
  })

  it('geeft ongebruikte artikelen en artikelen met impact voorrang', () => {
    const articles = [
      article({ id: 'used', is_used: true }),
      article({ id: 'fresh', is_used: false }),
      article({ id: 'impact', is_used: true, potential_impact: 'Box 3-tarief naar 36% → €120/jaar extra heffing' }),
      article({ id: 'none', is_used: true, potential_impact: 'Geen directe impact' }),
    ]
    const result = selectSourceArticles(articles, { limit: 2, now: NOW })
    expect(result.map((a) => a.id)).toEqual(['impact', 'fresh'])
  })
})

describe('filterGroundedItems', () => {
  const allowed = ['https://example.nl/artikel-1', 'https://nieuws.nl/item/2/']

  it('houdt items met een toegestane bron-URL (tolerant voor trailing slash)', () => {
    const { kept, dropped } = filterGroundedItems(
      [
        { id: 'a', sourceUrl: 'https://example.nl/artikel-1/' },
        { id: 'b', sourceUrl: 'https://nieuws.nl/item/2' },
      ],
      allowed,
    )
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })

  it('verwijdert items met verzonnen of ontbrekende bron-URL', () => {
    const { kept, dropped } = filterGroundedItems(
      [
        { id: 'a', sourceUrl: 'https://verzonnen.nl/nep' },
        { id: 'b' },
        { id: 'c', sourceUrl: 'https://example.nl/artikel-1' },
      ],
      allowed,
    )
    expect(kept.map((i) => i.id)).toEqual(['c'])
    expect(dropped.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('filtert niets als er geen bronnen waren', () => {
    const items: { id: string; sourceUrl?: string }[] = [{ id: 'a' }]
    const { kept, dropped } = filterGroundedItems(items, [])
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })
})

describe('dedupeSimilarTitles', () => {
  it('verwijdert kandidaten die sterk lijken op bestaande titels', () => {
    const { kept, duplicates } = dedupeSimilarTitles(
      [
        { title: 'ECB verlaagt de rente naar 2 procent' },
        { title: 'Huurtoeslag stijgt volgend jaar met 5 procent' },
      ],
      ['ECB verlaagt rente naar 2%'],
    )
    expect(kept.map((k) => k.title)).toEqual(['Huurtoeslag stijgt volgend jaar met 5 procent'])
    expect(duplicates).toHaveLength(1)
  })

  it('dedupet binnen de batch — de eerste wint', () => {
    const { kept, duplicates } = dedupeSimilarTitles([
      { title: 'Box 3 heffing werkelijk rendement uitgesteld tot 2029' },
      { title: 'Heffing box 3 op werkelijk rendement uitgesteld naar 2029' },
      { title: 'AOW-leeftijd blijft 67 jaar in 2031' },
    ])
    expect(kept).toHaveLength(2)
    expect(duplicates).toHaveLength(1)
    expect(kept[0].title).toContain('Box 3')
  })

  it('laat verschillende onderwerpen met overlappende woorden door', () => {
    const { kept } = dedupeSimilarTitles([
      { title: 'Spaarrente bij grootbanken daalt naar 1,2 procent' },
      { title: 'Hypotheekrente stijgt naar hoogste punt sinds 2024' },
    ])
    expect(kept).toHaveLength(2)
  })
})

describe('ensureUniqueArticleUrl', () => {
  it('laat een echte item-URL ongemoeid', () => {
    const url = ensureUniqueArticleUrl(
      'https://dnb.nl/nieuws/artikel-x',
      'https://dnb.nl/nieuws/',
      'Titel',
    )
    expect(url).toBe('https://dnb.nl/nieuws/artikel-x')
  })

  it('maakt een paginale URL uniek met een titel-hash-fragment', () => {
    const a = ensureUniqueArticleUrl('https://dnb.nl/nieuws/', 'https://dnb.nl/nieuws/', 'Titel A')
    const b = ensureUniqueArticleUrl('https://dnb.nl/nieuws/', 'https://dnb.nl/nieuws/', 'Titel B')
    expect(a).not.toBe(b)
    expect(a.startsWith('https://dnb.nl/nieuws/#tf-')).toBe(true)
  })

  it('is stabiel voor dezelfde titel (idempotente upsert-dedupe)', () => {
    const a1 = ensureUniqueArticleUrl('https://x.nl/p', 'https://x.nl/p', 'Zelfde titel')
    const a2 = ensureUniqueArticleUrl('https://x.nl/p', 'https://x.nl/p', 'Zelfde titel')
    expect(a1).toBe(a2)
  })
})

describe('normalizeUrl', () => {
  it('normaliseert host-case en trailing slash', () => {
    expect(normalizeUrl('https://Example.NL/Pad/')).toBe(normalizeUrl('https://example.nl/Pad'))
  })
})
