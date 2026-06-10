import { describe, it, expect } from 'vitest'
import {
  loadNewsSources,
  DEFAULT_WEB_SOURCES,
  DEFAULT_RSS_FEEDS,
} from './news-sources'

/**
 * Tests voor loadNewsSources. De supabase-call wordt gemockt.
 *
 * Kern van de regressie: de beheerpagina toont standaardbronnen wanneer er
 * niets is opgeslagen, maar de ingest-route las puur uit de database. Met een
 * lege database haalde "Bronnen ophalen" dus uit 0 bronnen op. De backend valt
 * nu terug op dezelfde standaardbronnen wanneer er niets is geconfigureerd.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(stored: Record<string, unknown>): any {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col: string, key: string) {
              return {
                maybeSingle: async () => ({
                  data: key in stored ? { value: stored[key] } : null,
                  error: null,
                }),
              }
            },
          }
        },
      }
    },
  }
}

describe('loadNewsSources', () => {
  it('valt terug op standaardbronnen wanneer er niets is opgeslagen', async () => {
    const supabase = makeSupabase({})
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(DEFAULT_WEB_SOURCES)
    expect(result.rssFeeds).toEqual(DEFAULT_RSS_FEEDS)
    expect(result.webSources.length).toBeGreaterThan(0)
    expect(result.rssFeeds.length).toBeGreaterThan(0)
  })

  it('gebruikt opgeslagen bronnen wanneer geconfigureerd (geen terugval)', async () => {
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld' }]
    const customRss = [{ url: 'https://example.com/rss', label: 'Voorbeeld RSS' }]
    const supabase = makeSupabase({
      news_web_sources: JSON.stringify(customWeb),
      news_rss_feeds: JSON.stringify(customRss),
    })
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(customWeb)
    expect(result.rssFeeds).toEqual(customRss)
  })

  it('valt NIET terug zodra ten minste één bron-type is opgeslagen', async () => {
    // Web geconfigureerd, RSS bewust leeg → respecteer de keuze, geen terugval
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld' }]
    const supabase = makeSupabase({
      news_web_sources: JSON.stringify(customWeb),
      news_rss_feeds: JSON.stringify([]),
    })
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(customWeb)
    expect(result.rssFeeds).toEqual([])
  })

  it('accepteert reeds-geparseerde (jsonb) waarden', async () => {
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld' }]
    const supabase = makeSupabase({
      news_web_sources: customWeb, // already an array, not a JSON string
      news_rss_feeds: [],
    })
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(customWeb)
    expect(result.rssFeeds).toEqual([])
  })
})
