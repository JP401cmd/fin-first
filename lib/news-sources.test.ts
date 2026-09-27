import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadNewsSources,
  standaardWebBronnen,
  DEFAULT_RSS_FEEDS,
  prinsjesdag,
  lopendBelastingplanJaar,
  belastingplanWettekstenUrl,
  isFoutpagina,
  MAX_RSS_ITEMS,
  normaliseerWebBronnen,
  parseFeed,
  rssPadFilter,
  RSS_PAD_FILTER,
  fetchRssFeed,
  fetchWebPage,
  MAX_REDIRECTS,
  MAX_BODY_BYTES,
} from './news-sources'
import { isVeiligeBronUrl } from './safe-url'
import { stripHtml } from './news-html'
import { BELASTINGDIENST_STORING_HTML, STORING_ZONDER_KOP_HTML } from './news-storing.fixture'

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
    const nu = new Date('2026-09-27T05:23:00.000Z')
    const result = await loadNewsSources(supabase, nu)

    expect(result.webSources).toEqual(standaardWebBronnen(nu))
    // Het moment van de run bepaalt het Belastingplan-jaar in de standaardlijst.
    expect(result.webSources.map((w) => w.url)).toContain('https://www.rijksfinancien.nl/belastingplan-2027')
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

describe('standaardbronnen — één keer grondig bijgewerkt (B28) en herijkt (27 sep 2026)', () => {
  const WEB = standaardWebBronnen(new Date('2026-09-27T05:23:00.000Z'))

  it('geen dode feeds meer; elke webbron draagt een vaste soort', () => {
    const alle = [...WEB.map((w) => w.url), ...DEFAULT_RSS_FEEDS.map((r) => r.url)]
    expect(alle.some((u) => u.includes('feeds.rijksoverheid.nl'))).toBe(false)
    expect(alle.some((u) => /productenoverzicht|publicaties\.rss|overtoeslagen|dsta\.nl|afm\.nl\/rss|cbs\.nl\/nl-nl\/rss\//.test(u))).toBe(false)
    // …maar de échte CBS-feeds (`/rss-feeds/<thema>`, 27 sep) wél: het oude `/rss/<thema>` gaf 500.
    expect(DEFAULT_RSS_FEEDS.every((r) => r.url.startsWith('https://www.cbs.nl/nl-nl/rss-feeds/'))).toBe(true)
    expect(alle.some((u) => /rijksoverheid\.nl\/onderwerpen\/(aow|koopwoning|huurtoeslag|toeslagen|zorgtoeslag)$/.test(u))).toBe(false)
    for (const w of WEB) expect(['web_lijst', 'web_pagina']).toContain(w.soort)
    expect(new Set(alle).size).toBe(alle.length)
    // Elke standaardbron haalt de SSRF-toets van het schrijfpad en de fetch.
    for (const u of alle) expect(isVeiligeBronUrl(u)).toBe(true)
    // DNB-lijsten komen uit JavaScript en leveren server-side niets (release-review 1F, M4).
    expect(alle.some((u) => /dnb\.nl\/(actueel\/algemeen-nieuws|publicaties\/publicaties-dnb|algemeen-nieuws)/.test(u))).toBe(false)
  })

  it('27 sep: de bronnen die live 0 leverden of alleen ruis zijn weg (oorzaak per regel in de bron)', () => {
    const urls = WEB.map((w) => w.url)
    // Themahubs zonder secties (alleen kaarten en teasers).
    expect(urls).not.toContain('https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting')
    expect(urls).not.toContain('https://www.rijksoverheid.nl/themas/werk/pensioen')
    expect(urls).not.toContain('https://www.rijksoverheid.nl/themas/economie/koopkracht')
    // Eén evergreen-sectie → de AOW-leeftijdpagina.
    expect(urls).not.toContain('https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/algemene-ouderdomswet-aow')
    // CBS-themapagina hangt; …/cijfers is een lijst StatLine-tabellen → de CBS-feeds.
    expect(urls.some((u) => u.startsWith('https://www.cbs.nl/'))).toBe(false)
    // Lijsten uit JavaScript of zonder grondslag.
    expect(urls.some((u) => u.includes('ecb.europa.eu'))).toBe(false)
    expect(urls).not.toContain('https://www.afm.nl/nl-nl/consumenten/waarschuwingen')
    // Nooit meer een vast Belastingplan-jaartal.
    expect(urls).not.toContain('https://www.rijksfinancien.nl/belastingplan-2026')
  })

  it('RSS: de CBS-thema-feeds, met het label van de oude lijstbron; de Engelse ECB-feed zonder beschrijving is weg', () => {
    expect(DEFAULT_RSS_FEEDS).toEqual([
      { url: 'https://www.cbs.nl/nl-nl/rss-feeds/prijzen', label: 'CBS — Prijzen (CPI / inflatie)' },
      { url: 'https://www.cbs.nl/nl-nl/rss-feeds/inkomen-en-bestedingen', label: 'CBS — Inkomen en bestedingen' },
    ])
  })

  it('elk rekenend mechanisme heeft minstens één bron waarvan het fragment de parameter letterlijk draagt', () => {
    const urls = WEB.map((w) => w.url)
    const dekking: Record<string, RegExp> = {
      'studieschuld-rente': /duo\.nl\/particulier\/rente\//,
      'eigen-risico': /eigen-risico-zorgverzekering$/,
      'aow-leeftijd': /algemene-ouderdomswet-aow\/aow-leeftijd$/,
      'box1-parameter': /boxen_en_tarieven\/box_1\/box_1$/,
      'box3-parameter': /met-welke-percentages-is-het-fictief-rendement-berekend$/,
      'spaarrente-markt': /dnb\.nl\/de-euro-en-europa\/monetair-beleid-ecb\/ecb-rentetarieven\/$/,
      'hypotheekrente-markt': /dnb\.nl\/actuele-economische-vraagstukken\/rente\/$/,
    }
    for (const [mechanisme, patroon] of Object.entries(dekking)) {
      expect(urls.some((u) => patroon.test(u)), mechanisme).toBe(true)
    }
  })
})

describe('Belastingplan-jaar — schuift mee met Prinsjesdag (derde dinsdag van september)', () => {
  it.each([
    [2024, '2024-09-17'], // 1 sep = zondag
    [2025, '2025-09-16'], // 1 sep = maandag
    [2026, '2026-09-15'], // 1 sep = dinsdag: derde dinsdag is de 15e, de vroegst mogelijke
    [2027, '2027-09-21'], // 1 sep = woensdag: de 21e, de laatst mogelijke
  ])('Prinsjesdag %i = %s', (jaar, datum) => {
    expect(prinsjesdag(jaar).toISOString().slice(0, 10)).toBe(datum)
  })

  it('valt twintig jaar lang altijd op een dinsdag tussen de 15e en de 21e', () => {
    for (let jaar = 2020; jaar <= 2040; jaar++) {
      const d = prinsjesdag(jaar)
      expect(d.getUTCDay()).toBe(2)
      expect(d.getUTCMonth()).toBe(8)
      expect(d.getUTCDate()).toBeGreaterThanOrEqual(15)
      expect(d.getUTCDate()).toBeLessThanOrEqual(21)
    }
  })

  it.each([
    ['2026-01-01T00:00:00.000Z', 2026], // begin van het jaar
    ['2026-09-14T23:59:59.999Z', 2026], // dag vóór Prinsjesdag
    ['2026-09-15T00:00:00.000Z', 2026], // Prinsjesdag zelf, ochtend: stukken nog niet online
    ['2026-09-15T23:59:59.999Z', 2026], // Prinsjesdag zelf, laatste moment
    ['2026-09-16T00:00:00.000Z', 2027], // de dag erna: het nieuwe plan
    ['2026-12-31T23:59:59.999Z', 2027], // eind van het jaar
    ['2027-01-01T00:00:00.000Z', 2027], // jaarwisseling: nog steeds het plan van dit jaar
    ['2027-09-21T12:00:00.000Z', 2027], // Prinsjesdag 2027 (laatst mogelijke datum)
    ['2027-09-22T00:00:00.000Z', 2028],
  ])('op %s is het lopende plan %i', (iso, jaar) => {
    expect(lopendBelastingplanJaar(new Date(iso))).toBe(jaar)
  })

  it('de standaardlijst gebruikt het lopende jaar, vóór en ná Prinsjesdag', () => {
    const url = (iso: string) =>
      standaardWebBronnen(new Date(iso)).find((w) => w.label === 'Rijksfinanciën — Belastingplan wetteksten')?.url
    expect(url('2026-09-15T05:23:00.000Z')).toBe('https://www.rijksfinancien.nl/belastingplan-2026')
    expect(url('2026-09-16T05:23:00.000Z')).toBe('https://www.rijksfinancien.nl/belastingplan-2027')
    expect(belastingplanWettekstenUrl(new Date('2026-09-27T05:23:00.000Z'))).toBe('https://www.rijksfinancien.nl/belastingplan-2027')
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

describe('parseFeed — pad-filter per host (CBS: alleen nieuws, geen maatwerktabellen)', () => {
  const item = (pad: string, i: number) =>
    `<item><title>Item ${i}</title><link>https://www.cbs.nl${pad}${i}</link></item>`

  it('CBS-feeds krijgen het nieuwspad als filter; andere hosts geen', () => {
    expect(rssPadFilter('https://www.cbs.nl/nl-nl/rss-feeds/prijzen')).toBe('/nl-nl/nieuws/')
    expect(rssPadFilter('https://WWW.CBS.NL/nl-nl/rss-feeds/inkomen-en-bestedingen')).toBe('/nl-nl/nieuws/')
    expect(rssPadFilter('https://www.dnb.nl/rss')).toBeNull()
    expect(rssPadFilter('geen url')).toBeNull()
    for (const feed of DEFAULT_RSS_FEEDS.filter((f) => f.url.includes('cbs.nl'))) {
      expect(rssPadFilter(feed.url)).toBe(RSS_PAD_FILTER['www.cbs.nl'])
    }
  })

  it('weert maatwerk-items en filtert vóór de cap: de cap gaat naar nieuws, gewerd telt niet als afgekapt', () => {
    // Eerst MAX_RSS_ITEMS maatwerktabellen, dan 3 nieuwsberichten. Zonder
    // filter-vóór-cap vulden de tabellen de hele cap en viel het nieuws weg.
    const xml = `<rss>${Array.from({ length: MAX_RSS_ITEMS }, (_, i) => item('/nl-nl/maatwerk/2026/39/tabel-', i)).join('')}${[1, 2, 3].map((i) => item('/nl-nl/nieuws/2026/39/bericht-', i)).join('')}</rss>`
    const r = parseFeed(xml, 'CBS', '/nl-nl/nieuws/')
    expect(r.items.map((i) => i.link)).toEqual([1, 2, 3].map((i) => `https://www.cbs.nl/nl-nl/nieuws/2026/39/bericht-${i}`))
    expect(r.afgekapt).toBe(0)
    // Zonder filter: ongewijzigd gedrag.
    expect(parseFeed(xml, 'CBS').items).toHaveLength(MAX_RSS_ITEMS)
  })
})

// ── Storingspagina's en foutpagina's (27 sep 2026) ──────────────────

describe('fetchWebPage — een storingspagina is geen inhoud', () => {
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

  it('de echte onderhoudspagina van de Belastingdienst (200) wordt oorzaak storing, zonder HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(BELASTINGDIENST_STORING_HTML)))
    const r = await fetchWebPage({ url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3' })
    expect(r).toEqual({ ok: false, oorzaak: 'storing' })
  })

  it('ook de variant zonder kop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(STORING_ZONDER_KOP_HTML)))
    expect(await fetchWebPage({ url: 'https://www.belastingdienst.nl/x' })).toEqual({ ok: false, oorzaak: 'storing' })
  })

  it('een gewone pagina blijft gewoon ok', async () => {
    const html = `<main><h1>Box 3</h1><p>${'Over sparen en beleggen in box 3. '.repeat(40)}</p></main>`
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(html)))
    const r = await fetchWebPage({ url: 'https://www.belastingdienst.nl/x' })
    expect(r.ok).toBe(true)
  })

  it('DUO: een redirect naar `/system/error/404.jsp?originalurl=…` is een foutpagina, geen inhoud', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(antwoord('', { status: 302, location: '/particulier/system/error/404.jsp?originalurl=/particulier/home/actueel/' }))
      .mockResolvedValue(antwoord('<main><h1>Foutpagina</h1></main>'))
    vi.stubGlobal('fetch', f)
    const r = await fetchWebPage({ url: 'https://duo.nl/particulier/home/actueel/' })
    expect(r).toMatchObject({ ok: false, oorzaak: 'doorverwezen_naar_fout' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('isFoutpagina — het pad, met of zonder extensie', () => {
  it.each([
    ['https://www.afm.nl/404?item=%2frss', true],
    ['https://duo.nl/particulier/system/error/404.jsp?originalurl=/x', true],
    ['https://x.nl/pagina-niet-gevonden', true],
    ['https://x.nl/not-found/', true],
    ['https://x.nl/nieuws/404-bericht', false],
    ['https://x.nl/rapport-404', false],
    ['https://x.nl/nieuws/2026/09/404.jsperiment', false],
  ])('%s → %s', (url, verwacht) => {
    expect(isFoutpagina(url)).toBe(verwacht)
  })
})
