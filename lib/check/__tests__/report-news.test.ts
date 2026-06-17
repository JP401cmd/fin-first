/**
 * Unit-tests voor `lib/check/report-news.ts` — de nieuws-datalaag van het
 * publieke Vrijheidscheck-rapport.
 *
 * Twee scopes:
 *  1. `toReportNewsItems` — pure map: veld-mapping, category-passthrough vs.
 *     null-fallback, nl-NL-datumlabel ('17 juni 2026'), lege summary/datum.
 *  2. `buildCheckReportNews` — graceful degradation: lege bron, query-fout en
 *     een werpende client leveren allemaal `{ items: [], sourceNote: '' }`,
 *     zonder te werpen. Geen echte database — de client is gemockt.
 */

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SelectableArticle } from '@/lib/news-selection'
import { toReportNewsItems, buildCheckReportNews, loadCheckNewsArticles } from '../report-news'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function article(overrides: Partial<SelectableArticle> = {}): SelectableArticle {
  return {
    id: 'a1',
    title: 'Hypotheekrente daalt verder',
    summary: 'De gemiddelde hypotheekrente zakte deze week.',
    source_url: 'https://example.nl/rente',
    source_name: 'Voorbeeldkrant',
    category: 'rente',
    published_at: '2026-06-17T08:00:00.000Z',
    potential_impact: null,
    is_used: false,
    ...overrides,
  }
}

/**
 * Mock een service-client waarvan de SELECT-keten
 * `.from().select().gte().order().limit()` op `{ data, error }` resolvet.
 * `limit` is de terminale call in `loadCheckNewsArticles`. De `chain` wordt
 * meegegeven zodat tests op de spies (bv. `gte`-argument) kunnen asserten.
 */
function mockServiceClient(
  rows: SelectableArticle[] | null,
  error: unknown = null,
): { client: SupabaseClient; chain: { gte: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> } } {
  const chain = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
  return { client, chain }
}

// ── 1. toReportNewsItems (puur) ────────────────────────────────────────────────

describe('toReportNewsItems', () => {
  it('mapt alle velden één-op-één en formatteert de datum in nl-NL', () => {
    const [item] = toReportNewsItems([article()])
    expect(item).toEqual({
      category: 'rente',
      headline: 'Hypotheekrente daalt verder',
      summary: 'De gemiddelde hypotheekrente zakte deze week.',
      sourceName: 'Voorbeeldkrant',
      sourceUrl: 'https://example.nl/rente',
      dateLabel: '17 juni 2026',
      impact: null,
    })
  })

  it('mapt potential_impact naar een getrimde impact; leeg/whitespace/null → null', () => {
    expect(
      toReportNewsItems([
        article({ potential_impact: '  Lagere rente verlaagt je maandlasten.  ' }),
      ])[0].impact,
    ).toBe('Lagere rente verlaagt je maandlasten.')
    expect(toReportNewsItems([article({ potential_impact: '   ' })])[0].impact).toBeNull()
    expect(toReportNewsItems([article({ potential_impact: null })])[0].impact).toBeNull()
  })

  it('geeft een toegestane category door', () => {
    for (const cat of ['fiscaal', 'rente', 'woningmarkt', 'beleggingen', 'pensioen', 'macro'] as const) {
      const [item] = toReportNewsItems([article({ category: cat })])
      expect(item.category).toBe(cat)
    }
  })

  it('valt terug op null voor een onbekende of ontbrekende category', () => {
    expect(toReportNewsItems([article({ category: 'sport' })])[0].category).toBeNull()
    expect(toReportNewsItems([article({ category: null })])[0].category).toBeNull()
  })

  it('maakt van een ontbrekende summary een lege string', () => {
    expect(toReportNewsItems([article({ summary: null })])[0].summary).toBe('')
  })

  it('geeft een leeg datumlabel bij ontbrekende of ongeldige published_at', () => {
    expect(toReportNewsItems([article({ published_at: null })])[0].dateLabel).toBe('')
    expect(toReportNewsItems([article({ published_at: 'niet-een-datum' })])[0].dateLabel).toBe('')
  })

  it('formatteert zonder voorloopnul (1 januari 2026)', () => {
    const [item] = toReportNewsItems([article({ published_at: '2026-01-01T12:00:00.000Z' })])
    expect(item.dateLabel).toBe('1 januari 2026')
  })

  it('mapt een lege lijst naar een lege lijst', () => {
    expect(toReportNewsItems([])).toEqual([])
  })
})

// ── 2. buildCheckReportNews (fail-safe) ─────────────────────────────────────────

describe('buildCheckReportNews', () => {
  const now = new Date('2026-06-17T10:00:00.000Z')

  it('bouwt items + sourceNote bij een gevulde bron', async () => {
    const { client } = mockServiceClient([article()])
    const news = await buildCheckReportNews(client, now)

    expect(news.items).toHaveLength(1)
    expect(news.items[0].headline).toBe('Hypotheekrente daalt verder')
    expect(news.sourceNote).toBe('Gebaseerd op de laatste bronnen · bijgewerkt 17 juni 2026')
  })

  it('begrenst tot 3 items, ook bij meer kandidaten', async () => {
    // Vijf kandidaten over meerdere categorieën → de "tot 3"-contractgrens
    // (REPORT_NEWS_LIMIT via selectSourceArticles) moet hard cappen.
    const many = Array.from({ length: 5 }, (_, i) =>
      article({
        id: `a${i}`,
        title: `Artikel ${i}`,
        source_url: `https://example.nl/${i}`,
        category: (['rente', 'fiscaal', 'macro', 'beleggingen', 'pensioen'] as const)[i],
      }),
    )
    const { client } = mockServiceClient(many)
    const news = await buildCheckReportNews(client, now)
    expect(news.items).toHaveLength(3)
  })

  it('filtert het kandidaatvenster op fetched_at >= now − 30 dagen', async () => {
    const { client, chain } = mockServiceClient([article()])
    await loadCheckNewsArticles(client, now)

    const expectedStart = new Date(now)
    expectedStart.setDate(expectedStart.getDate() - 30)
    expect(chain.gte).toHaveBeenCalledWith('fetched_at', expectedStart.toISOString())
  })

  it('degradeert naar lege sectie bij een lege bron (geen rijen)', async () => {
    const news = await buildCheckReportNews(mockServiceClient([]).client, now)
    expect(news).toEqual({ items: [], sourceNote: '' })
  })

  it('degradeert naar lege sectie bij data=null', async () => {
    const news = await buildCheckReportNews(mockServiceClient(null).client, now)
    expect(news).toEqual({ items: [], sourceNote: '' })
  })

  it('degradeert naar lege sectie bij een query-fout', async () => {
    const news = await buildCheckReportNews(
      mockServiceClient(null, { message: 'boom' }).client,
      now,
    )
    expect(news).toEqual({ items: [], sourceNote: '' })
  })

  it('werpt niet wanneer de client zelf gooit — lege sectie terug', async () => {
    const throwingClient = {
      from: vi.fn(() => {
        throw new Error('client kapot')
      }),
    } as unknown as SupabaseClient

    const news = await buildCheckReportNews(throwingClient, now)
    expect(news).toEqual({ items: [], sourceNote: '' })
  })
})
