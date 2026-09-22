import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadNewsSources,
  DEFAULT_WEB_SOURCES,
  DEFAULT_RSS_FEEDS,
  MAX_RSS_ITEMS,
  normaliseerWebBronnen,
  parseFeed,
  fetchRssFeed,
  fetchWebPage,
  MAX_REDIRECTS,
  MAX_BODY_BYTES,
} from './news-sources'
import { isVeiligeBronUrl } from './safe-url'
import { stripHtml } from './news-html'

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
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld', soort: 'web_lijst' as const }]
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
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld', soort: 'web_pagina' as const }]
    const supabase = makeSupabase({
      news_web_sources: JSON.stringify(customWeb),
      news_rss_feeds: JSON.stringify([]),
    })
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(customWeb)
    expect(result.rssFeeds).toEqual([])
  })

  it('accepteert reeds-geparseerde (jsonb) waarden', async () => {
    const customWeb = [{ url: 'https://example.com', label: 'Voorbeeld', soort: 'web_lijst' as const }]
    const supabase = makeSupabase({
      news_web_sources: customWeb, // already an array, not a JSON string
      news_rss_feeds: [],
    })
    const result = await loadNewsSources(supabase)

    expect(result.webSources).toEqual(customWeb)
    expect(result.rssFeeds).toEqual([])
  })

  it('een opgeslagen webbron van vóór ADR 0176 zonder soort wordt web_pagina (de veilige lezing)', async () => {
    const supabase = makeSupabase({
      news_web_sources: JSON.stringify([{ url: 'https://example.com', label: 'Oud' }, { url: 'https://x.nl', label: 'X', soort: 'onzin' }]),
      news_rss_feeds: '[]',
    })
    const result = await loadNewsSources(supabase)
    expect(result.webSources.map((w) => w.soort)).toEqual(['web_pagina', 'web_pagina'])
    expect(normaliseerWebBronnen('geen lijst')).toEqual([])
  })
})

describe('standaardbronnen — één keer grondig bijgewerkt (B28)', () => {
  it('geen dode feeds meer; elke webbron draagt een vaste soort', () => {
    const alle = [...DEFAULT_WEB_SOURCES.map((w) => w.url), ...DEFAULT_RSS_FEEDS.map((r) => r.url)]
    expect(alle.some((u) => u.includes('feeds.rijksoverheid.nl'))).toBe(false)
    expect(alle.some((u) => /productenoverzicht|publicaties\.rss|overtoeslagen|dsta\.nl|afm\.nl\/rss|cbs\.nl\/nl-nl\/rss/.test(u))).toBe(false)
    expect(alle.some((u) => /rijksoverheid\.nl\/onderwerpen\/(aow|koopwoning|huurtoeslag|toeslagen|zorgtoeslag)$/.test(u))).toBe(false)
    expect(DEFAULT_RSS_FEEDS.map((r) => r.url)).toEqual(['https://www.ecb.europa.eu/rss/press.html'])
    for (const w of DEFAULT_WEB_SOURCES) expect(['web_lijst', 'web_pagina']).toContain(w.soort)
    expect(new Set(alle).size).toBe(alle.length)
    // Elke standaardbron haalt de SSRF-toets van het schrijfpad en de fetch.
    for (const u of alle) expect(isVeiligeBronUrl(u)).toBe(true)
    // DNB-lijsten komen uit JavaScript en leveren server-side niets (release-review 1F, M4).
    expect(alle.some((u) => /dnb\.nl\/(actueel\/algemeen-nieuws|publicaties\/publicaties-dnb)/.test(u))).toBe(false)
  })
})

// ── RSS ─────────────────────────────────────────────────────────────

const ECB_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Monetary policy decisions</title><link>https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.mp260910~abc.en.html</link><pubDate>Thu, 10 Sep 2026 12:15:00 +0000</pubDate></item>
<item><title><![CDATA[Rente &amp; inflatie]]></title><link>https://www.ecb.europa.eu//press/pr/date/2026/html/b.en.html</link><description><![CDATA[<p>Korte <b>teaser</b></p>]]></description><pubDate>geen datum</pubDate></item>
</channel></rss>`

describe('parseFeed', () => {
  it('bewaart de tijd van pubDate, laat de feed-link letterlijk staan (ECB //press) en markeert een item zonder description', () => {
    const { items, isFeed } = parseFeed(ECB_FEED, 'ECB — Persberichten')
    expect(isFeed).toBe(true)
    expect(items[0]).toEqual({
      title: 'Monetary policy decisions',
      description: null,
      link: 'https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.mp260910~abc.en.html',
      publishedAt: '2026-09-10T12:15:00.000Z',
      sourceName: 'ECB — Persberichten',
    })
    expect(items[1].title).toBe('Rente & inflatie')
    expect(items[1].description).toBe('Korte teaser')
    expect(items[1].publishedAt).toBeNull()
  })

  it('HTML is geen feed; de cap op items is zichtbaar als afgekapt', () => {
    expect(parseFeed('<html><body>Service RSS</body></html>', 'DSTA').isFeed).toBe(false)
    const veel = `<rss>${Array.from({ length: MAX_RSS_ITEMS + 3 }, (_, i) => `<item><title>T${i}</title><link>https://x.nl/${i}</link></item>`).join('')}</rss>`
    const r = parseFeed(veel, 'X')
    expect(r.items).toHaveLength(MAX_RSS_ITEMS)
    expect(r.afgekapt).toBe(3)
  })
})

describe('fetchRssFeed — een oorzaak per bron', () => {
  afterEach(() => vi.unstubAllGlobals())

  const antwoord = (body: string, init: { status?: number; location?: string } = {}) => {
    const status = init.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => (h.toLowerCase() === 'location' ? init.location ?? null : null) },
      text: async () => body,
    }
  }

  it('404, DNS, time-out, HTML, redirect naar /404, leeg en ok zijn zeven verschillende uitkomsten', async () => {
    const feed = { url: 'https://x.nl/feed', label: 'X' }
    const dnsFout = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' })

    const gevallen: [() => Promise<unknown>, string, number?][] = [
      [async () => antwoord('niet gevonden', { status: 404 }), 'http_fout', 404],
      [async () => { throw dnsFout }, 'dns'],
      [async () => { throw timeout }, 'timeout'],
      [async () => antwoord('<html><body>geen feed</body></html>'), 'geen_feed'],
      [async () => antwoord('', { status: 302, location: '/404?item=%2frss' }), 'doorverwezen_naar_fout'],
      [async () => antwoord('<rss><channel></channel></rss>'), 'leeg'],
      [async () => antwoord(ECB_FEED), 'ok'],
    ]
    for (const [impl, oorzaak, status] of gevallen) {
      vi.stubGlobal('fetch', vi.fn(impl))
      const r = await fetchRssFeed(feed)
      expect(r.oorzaak).toBe(oorzaak)
      if (status) expect(r.httpStatus).toBe(status)
    }
  })

  it('fetchWebPage levert HTML waaruit stripHtml script en JSON-LD weert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => antwoord('<script type="application/ld+json">{"a":1}</script><p>Echte tekst</p>')))
    const r = await fetchWebPage({ url: 'https://x.nl' })
    expect(r.ok).toBe(true)
    // `fetchWebContent`/`webTekstVoorDuiding` zijn met 1F fase 2 vervallen: de
    // duidingsstap krijgt geen paginatekst meer. De lezerstekst wordt nu
    // uitsluitend in de ingest gemaakt (lib/news-html.ts, eigen suite).
    expect(r.ok && stripHtml(r.html)).toBe('Echte tekst')
  })
})

// ── SSRF: redirects handmatig, elke hop hertoetst (security-review 1F, S1) ──

describe('fetchWebPage — veilige redirectketen', () => {
  afterEach(() => vi.unstubAllGlobals())

  const antwoord = (body: string, init: { status?: number; location?: string } = {}) => {
    const status = init.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => (h.toLowerCase() === 'location' ? init.location ?? null : null) },
      text: async () => body,
    }
  }

  it('volgt nooit automatisch: elke fetch gaat met redirect: manual', async () => {
    const f = vi.fn(async () => antwoord('<p>ok</p>'))
    vi.stubGlobal('fetch', f)
    await fetchWebPage({ url: 'https://www.cbs.nl/a' })
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('manual')
  })

  it('een geweigerd adres wordt niet eens opgehaald', async () => {
    const f = vi.fn(async () => antwoord('<p>geheim</p>'))
    vi.stubGlobal('fetch', f)
    for (const url of ['http://www.cbs.nl/', 'https://127.0.0.1/', 'https://localhost/', 'https://www.cbs.nl:8080/']) {
      const r = await fetchWebPage({ url })
      expect(r).toEqual({ ok: false, oorzaak: 'adres_geweigerd' })
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('volgt een redirect binnen dezelfde site en geeft het eindadres terug', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(antwoord('', { status: 301, location: '/themas/pensioen' }))
      .mockResolvedValueOnce(antwoord('<p>pensioen</p>'))
    vi.stubGlobal('fetch', f)
    const r = await fetchWebPage({ url: 'https://www.rijksoverheid.nl/onderwerpen/pensioen' })
    expect(r).toEqual({ ok: true, html: '<p>pensioen</p>', finalUrl: 'https://www.rijksoverheid.nl/themas/pensioen' })
  })

  it.each([
    ['een andere site', 'https://elders.nl/pagina'],
    ['een IP-adres (metadata-endpoint)', 'https://169.254.169.254/latest/meta-data'],
    ['http', 'http://www.cbs.nl/a'],
    ['localhost', 'https://localhost/admin'],
  ])('weigert een redirect naar %s: doorverwezen, niets gelezen', async (_naam, location) => {
    const tekst = vi.fn(async () => 'geheim')
    const f = vi.fn()
      .mockResolvedValueOnce(antwoord('', { status: 302, location }))
      .mockResolvedValue({ ...antwoord('geheim'), text: tekst })
    vi.stubGlobal('fetch', f)
    const r = await fetchWebPage({ url: 'https://www.cbs.nl/a' })
    expect(r).toMatchObject({ ok: false, oorzaak: 'doorverwezen' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(tekst).not.toHaveBeenCalled()
  })

  it(`stopt na ${MAX_REDIRECTS} hops`, async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => antwoord('', { status: 302, location: `/hop-${++n}` })))
    const r = await fetchWebPage({ url: 'https://www.cbs.nl/a' })
    expect(r).toMatchObject({ ok: false, oorzaak: 'doorverwezen' })
    expect(n).toBe(MAX_REDIRECTS + 1)
  })

  it('leest de body met een bytecap en breekt de stream daarna af', async () => {
    const brok = new Uint8Array(512 * 1024).fill(97)
    let gelezen = 0
    let geannuleerd = false
    const reader = {
      read: async () => {
        gelezen++
        return gelezen > 100 ? { done: true, value: undefined } : { done: false, value: brok }
      },
      cancel: async () => { geannuleerd = true },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ...antwoord(''), body: { getReader: () => reader } })))
    const r = await fetchWebPage({ url: 'https://www.cbs.nl/a' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.html.length).toBe(MAX_BODY_BYTES)
    expect(geannuleerd).toBe(true)
    expect(gelezen).toBeLessThan(10)
  })
})

describe('parseFeed — strenge feed-links', () => {
  it('weigert een link die geen absolute http(s)-URL is', () => {
    const xml = '<rss><item><title>A</title><link>httpx://x.nl/a</link></item><item><title>B</title><link>javascript:alert(1)</link></item><item><title>C</title><link>https://x.nl/c</link></item></rss>'
    expect(parseFeed(xml, 'X').items.map((i) => i.link)).toEqual(['https://x.nl/c'])
  })
})
