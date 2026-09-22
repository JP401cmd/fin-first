import { describe, it, expect, vi, beforeEach } from 'vitest'

// De fetchers en de bronlijst worden per test gezet; webTekstVoorDuiding en
// de rest van news-sources blijven echt.
vi.mock('@/lib/news-sources', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./news-sources')>()
  return {
    ...echt,
    loadNewsSources: vi.fn(async () => ({ rssFeeds: [], webSources: [] })),
    fetchRssFeed: vi.fn(async () => ({ items: [], oorzaak: 'leeg', afgekapt: 0 })),
    fetchWebPage: vi.fn(async () => ({ ok: false, oorzaak: 'http_fout', httpStatus: 404 })),
  }
})
vi.mock('@/lib/news-enrich', () => ({
  kiesArtikelLinks: vi.fn(async () => ({ indexen: [], geweigerd: 0, afgekapt: 0, ok: true })),
  categorizeArticles: vi.fn(async () => new Map()),
}))
const DUIDING_UITKOMST = { geduid: 2, afgewezen: 1, mislukt: 0, overgeslagen: 0, wacht: 5 }
vi.mock('@/lib/krant/duiding', () => ({
  duidWachtendeArtikelen: vi.fn(async () => ({ geduid: 2, afgewezen: 1, mislukt: 0, overgeslagen: 0, wacht: 5 })),
  LEGE_DUIDING_SUMMARY: { geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 },
}))

import { duidWachtendeArtikelen } from '@/lib/krant/duiding'
import { loadNewsSources, fetchRssFeed, fetchWebPage } from '@/lib/news-sources'
import { kiesArtikelLinks, categorizeArticles } from '@/lib/news-enrich'
import {
  runNewsIngest,
  ARTICLE_RETENTION_DAYS,
  inhoudHash,
  sectieArtikelUrl,
  ontdubbelBatch,
  rssKandidaat,
  type SourceHealth,
} from './news-ingest'

// ── Nep-client: een in-memory news_articles met een unieke index op source_url ──

type Rij = Record<string, unknown> & { source_url: string }
interface Stap { m: string; args: unknown[] }

function maakClient(opties: { racePerUrl?: Set<string>; hashLeesFout?: boolean } = {}) {
  const rijen: Rij[] = []
  const stappen: { table: string; stappen: Stap[] }[] = []
  let volgnummer = 0
  const client = {
    from(table: string) {
      const q = { table, stappen: [] as Stap[] }
      stappen.push(q)
      let modus: 'select' | 'upsert' | 'delete' | 'update' | 'overig' = 'overig'
      let updateVelden: Record<string, unknown> = {}
      let kolom = ''
      let inFilter: { kolom: string; waarden: string[] } | null = null
      let upsertRij: Rij | null = null
      const chain: Record<string, unknown> = {}
      const stap = (m: string, impl?: (...args: unknown[]) => void) => (...args: unknown[]) => {
        q.stappen.push({ m, args })
        impl?.(...args)
        return chain
      }
      chain.select = stap('select', (k) => {
        if (modus === 'overig') { modus = 'select'; kolom = String(k) }
      })
      chain.in = stap('in', (k, v) => { inFilter = { kolom: String(k), waarden: v as string[] } })
      chain.upsert = stap('upsert', (r) => { modus = 'upsert'; upsertRij = r as Rij })
      chain.delete = stap('delete', () => { modus = 'delete' })
      chain.update = stap('update', (v) => { modus = 'update'; updateVelden = v as Record<string, unknown> })
      for (const m of ['eq', 'lt', 'gte', 'order', 'limit']) chain[m] = stap(m)
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        let uitkomst: unknown = { data: [], error: null }
        if (table === 'news_articles' && modus === 'select' && inFilter) {
          const f = inFilter as { kolom: string; waarden: string[] }
          uitkomst = opties.hashLeesFout && f.kolom === 'inhoud_hash'
            ? { data: null, error: { message: 'nep: inhoudcontrole faalt' } }
            : { data: rijen.filter((r) => f.waarden.includes(r[f.kolom] as string)).map((r) => ({ [kolom]: r[kolom] })), error: null }
        } else if (table === 'news_articles' && modus === 'update' && inFilter) {
          const f = inFilter as { kolom: string; waarden: string[] }
          for (const r of rijen) if (f.waarden.includes(r[f.kolom] as string)) Object.assign(r, updateVelden)
        } else if (table === 'news_articles' && modus === 'upsert' && upsertRij) {
          const rij = upsertRij as Rij
          const bestaat = rijen.some((r) => r.source_url === rij.source_url)
          if (!bestaat && opties.racePerUrl?.has(rij.source_url)) {
            // Een parallelle run schreef dezelfde sleutel net tussen voorcontrole en upsert.
            rijen.push({ ...rij, id: `race-${++volgnummer}` })
            uitkomst = { data: [], error: null }
          } else if (bestaat) {
            uitkomst = { data: [], error: null } // ON CONFLICT DO NOTHING → geen RETURNING
          } else {
            const id = `id-${++volgnummer}`
            rijen.push({ ...rij, id })
            uitkomst = { data: [{ id }], error: null }
          }
        }
        return Promise.resolve(uitkomst).then(res, rej)
      }
      return chain
    },
  }
  return { client, rijen, stappen }
}

function dagenTerug(iso: string, vanaf: Date): number {
  return Math.round((vanaf.getTime() - new Date(iso).getTime()) / 86_400_000)
}

// ── Bronnen ────────────────────────────────────────────────────────

const FEED = { url: 'https://www.ecb.europa.eu/rss/press.html', label: 'ECB — Persberichten' }
const LIJST = { url: 'https://www.cbs.nl/nl-nl/economie/prijzen', label: 'CBS — Prijzen', soort: 'web_lijst' as const }
const PAGINA = { url: 'https://www.rijksoverheid.nl/themas/werk/pensioen', label: 'Rijksoverheid — Pensioen', soort: 'web_pagina' as const }

const LIJST_HTML = `<main><ul>
<li><a href="/nl-nl/nieuws/2026/36/woninghuur-stijgt-gemiddeld-met-4-4-procent">Woninghuur stijgt gemiddeld met 4,4 procent</a> 4-9-2026 06:30</li>
<li><a href="/nl-nl/nieuws/2026/37/inflatie-stijgt-naar-3-3-procent-in-augustus">Inflatie stijgt naar 3,3 procent in augustus</a> 8-9-2026 06:30</li>
</ul></main>`

const PAGINA_HTML = `<script type="application/ld+json">{"dateModified":"2026-09-17T10:30:00+02:00"}</script>
<main><h1>Pensioen</h1><p>Het nieuwe pensioenstelsel gaat uiterlijk op 1 januari 2028 in voor alle pensioenfondsen in Nederland.</p>
<h2>Wat verandert er?</h2><p>Werkgevers en werknemers leggen voortaan een premie in die voor iedereen even hoog is, in een persoonlijk pensioenvermogen.</p></main>`

const FEED_ITEMS = [
  { title: 'Monetary policy decisions', description: null, link: 'https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.mp260910.en.html', publishedAt: '2026-09-10T12:15:00.000Z', sourceName: FEED.label },
]

function zetBronnen() {
  vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [FEED], webSources: [LIJST, PAGINA] })
  vi.mocked(fetchRssFeed).mockResolvedValue({ items: FEED_ITEMS, oorzaak: 'ok', afgekapt: 0 })
  vi.mocked(fetchWebPage).mockImplementation(async (s) =>
    s.url === LIJST.url
      ? { ok: true, html: LIJST_HTML, finalUrl: LIJST.url }
      : { ok: true, html: PAGINA_HTML, finalUrl: PAGINA.url },
  )
}

const MODEL = { modelId: 'nep' }
const NU = new Date('2026-09-22T05:25:00.000Z')

beforeEach(() => {
  vi.mocked(duidWachtendeArtikelen).mockClear()
  vi.mocked(kiesArtikelLinks).mockReset()
  vi.mocked(kiesArtikelLinks).mockResolvedValue({ indexen: [], geweigerd: 0, afgekapt: 0, ok: true })
  vi.mocked(categorizeArticles).mockReset()
  vi.mocked(categorizeArticles).mockImplementation(async (arts) =>
    new Map(arts.map((_, i) => [i, { category: 'macro', summary: `Modelsamenvatting ${Math.random()}`, potentialImpact: 'Geen directe impact' }])),
  )
  vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [] })
})

// ── Idempotentie: dezelfde bron tweemaal ─────────────────────────

describe('runNewsIngest — idempotent: dezelfde invoer tweemaal verandert niets (ADR 0176)', () => {
  it('tweede run: 0 nieuw, alles "al bekend", geen categorisatie-call — ook als het model andere links in een andere volgorde kiest', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [0, 1], geweigerd: 0, afgekapt: 0, ok: true })
    const een = await runNewsIngest(client as never, MODEL, { now: NU })
    // 1 feed-item + 2 links + 2 secties
    expect(een.summary.inserted).toBe(5)
    expect(rijen).toHaveLength(5)
    expect(een.summary.perSoort).toEqual({ rss: 1, web_lijst: 2, web_pagina: 2 })

    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [1, 0], geweigerd: 0, afgekapt: 0, ok: true })
    vi.mocked(categorizeArticles).mockClear()
    const twee = await runNewsIngest(client as never, MODEL, { now: new Date('2026-09-23T05:25:00.000Z') })
    expect(twee.summary.inserted).toBe(0)
    expect(twee.summary.alBekend).toBe(5)
    expect(rijen).toHaveLength(5)
    expect(categorizeArticles).not.toHaveBeenCalled()
  })

  it('de sleutel is nooit modeltekst: kop = bronkop, geen modeldatum, raw_content = bronfragment', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [0], geweigerd: 0, afgekapt: 0, ok: true })
    await runNewsIngest(client as never, MODEL, { now: NU })

    const rss = rijen.find((r) => r.bron_soort === 'rss')!
    expect(rss.source_url).toBe(FEED_ITEMS[0].link) // letterlijk, //press blijft staan
    expect(rss.published_at).toBe('2026-09-10T12:15:00.000Z')
    expect(rss.published_bron).toBe('feed')
    expect(rss.bron_fragment).toBeNull()

    const lijst = rijen.find((r) => r.bron_soort === 'web_lijst')!
    expect(lijst.source_url).toBe('https://www.cbs.nl/nl-nl/nieuws/2026/36/woninghuur-stijgt-gemiddeld-met-4-4-procent')
    expect(lijst.title).toBe('Woninghuur stijgt gemiddeld met 4,4 procent')
    expect(lijst.title).toBe(lijst.bron_kop)
    expect(lijst.raw_content).toBe('Woninghuur stijgt gemiddeld met 4,4 procent 4-9-2026 06:30')
    expect(lijst.published_bron).toBe('eerste_gezien')
    expect(lijst.published_at).toBe(NU.toISOString()) // mét tijd, niet 00:00
    expect(String(lijst.summary)).toMatch(/^Modelsamenvatting/) // modeltekst mag alleen in summary

    const secties = rijen.filter((r) => r.bron_soort === 'web_pagina')
    expect(secties.map((r) => r.title)).toEqual(['Pensioen', 'Wat verandert er?'])
    for (const s of secties) {
      expect(s.published_bron).toBe('meta')
      expect(s.published_at).toBe('2026-09-17T08:30:00.000Z')
      expect(s.source_url).toBe(sectieArtikelUrl(PAGINA.url, s.inhoud_hash as string))
      expect(s.bron_pagina_url).toBe(PAGINA.url)
    }
  })

  it('een gewijzigde sectie geeft precies één nieuwe rij; de ongewijzigde niet', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    const voor = rijen.length
    vi.mocked(fetchWebPage).mockImplementation(async (s) =>
      s.url === LIJST.url
        ? { ok: true, html: LIJST_HTML, finalUrl: LIJST.url }
        : { ok: true, html: PAGINA_HTML.replace('1 januari 2028', '1 januari 2029'), finalUrl: PAGINA.url },
    )
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.inserted).toBe(1)
    expect(rijen.length).toBe(voor + 1)
  })
})

describe('runNewsIngest — eerlijke telling', () => {
  it('inserted telt wat de database teruggaf: een conflict (parallelle run) is "al bekend", geen "nieuw"', async () => {
    zetBronnen()
    const { client } = maakClient({ racePerUrl: new Set([FEED_ITEMS[0].link]) })
    const { summary, health } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.inserted).toBe(2) // alleen de twee secties; de feed-rij verloor de race
    expect(summary.alBekend).toBe(1)
    const feed = health.sources.find((s) => s.soort === 'rss')!
    expect(feed.items).toBe(1)
    expect(feed.nieuw).toBe(0)
  })

  it('geweigerde linknummers van het model worden geteld en in de gezondheid getoond', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [1], geweigerd: 2, afgekapt: 0, ok: true })
    const { summary, health } = await runNewsIngest(client as never, MODEL, { now: NU })
    expect(summary.linksGeweigerd).toBe(2)
    expect(health.sources.find((s) => s.url === LIJST.url)!.geweigerd).toBe(2)
    expect(rijen.filter((r) => r.bron_soort === 'web_lijst').map((r) => r.source_url)).toEqual([
      'https://www.cbs.nl/nl-nl/nieuws/2026/37/inflatie-stijgt-naar-3-3-procent-in-augustus',
    ])
  })

  it('een feeddatum in de toekomst wordt het run-moment; een te lange kop wordt op 300 tekens gekapt', () => {
    const rij = rssKandidaat(
      { title: 'K'.repeat(400), description: null, link: 'https://x.nl/a', publishedAt: '2027-01-01T00:00:00.000Z', sourceName: 'X' },
      'https://x.nl/feed',
      NU.toISOString(),
    )
    expect(rij.published_at).toBe(NU.toISOString())
    expect(rij.published_bron).toBe('feed')
    expect(rij.bron_kop).toHaveLength(300)
    expect(rij.title).toHaveLength(300)
  })

  it('knipt kop en fragment op codepoints: een emoji op de knipgrens wordt nooit gehalveerd (Postgres 22P02)', () => {
    const titel = 'K'.repeat(299) + '📈' + 'rest'
    const beschrijving = 'x'.repeat(7999) + '💶' + 'y'
    const rij = rssKandidaat({ title: titel, description: beschrijving, link: 'https://x.nl/e', publishedAt: null, sourceName: 'X' }, 'https://x.nl/feed', NU.toISOString())
    expect([...rij.bron_kop]).toHaveLength(300)
    expect(rij.bron_kop.endsWith('📈')).toBe(true)
    expect([...(rij.bron_fragment ?? '')]).toHaveLength(8000)
    expect((rij.bron_fragment ?? '').endsWith('💶')).toBe(true)
    // Geen losse surrogaat: elk codepoint is een geheel teken.
    for (const t of [rij.bron_kop, rij.bron_fragment ?? '']) {
      for (const cp of t) expect(cp.codePointAt(0)! < 0xd800 || cp.codePointAt(0)! > 0xdfff).toBe(true)
    }
  })

  it('dezelfde inhoud onder twee sleutels telt als dubbel, niet als twee artikelen', () => {
    const k = (url: string, hash: string) => ({ rij: { source_url: url, inhoud_hash: hash } })
    const { uniek, dubbel } = ontdubbelBatch([k('a', 'h1'), k('b', 'h1'), k('a', 'h2'), k('c', 'h3')])
    expect(uniek.map((u) => u.rij.source_url)).toEqual(['a', 'c'])
    expect(dubbel).toBe(2)
    expect(inhoudHash('  Zelfde   tekst ')).toBe(inhoudHash('Zelfde tekst'))
    expect(inhoudHash('3,3 procent')).not.toBe(inhoudHash('3,2 procent'))
  })
})

describe('runNewsIngest — brongezondheid met oorzaak', () => {
  it('elke bron krijgt een oorzaak; zonder model kiest een lijstpagina niets (geen_model)', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [FEED], webSources: [LIJST, PAGINA] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], oorzaak: 'dns', afgekapt: 0 })
    vi.mocked(fetchWebPage).mockImplementation(async (s) =>
      s.url === LIJST.url ? { ok: true, html: LIJST_HTML, finalUrl: LIJST.url } : { ok: false, oorzaak: 'http_fout', httpStatus: 404 },
    )
    const { client, stappen } = maakClient()
    const { health } = await runNewsIngest(client as never, null, { now: NU })
    const per = Object.fromEntries(health.sources.map((s) => [s.url, s]))
    expect(per[FEED.url]).toMatchObject({ soort: 'rss', type: 'rss', oorzaak: 'dns', items: 0 })
    expect(per[LIJST.url]).toMatchObject({ soort: 'web_lijst', type: 'web', oorzaak: 'geen_model' })
    expect(per[PAGINA.url]).toMatchObject({ soort: 'web_pagina', oorzaak: 'http_fout', httpStatus: 404 })

    // De gezondheid landt in app_settings en bevat geen artikeltekst.
    const opgeslagen = stappen.find((q) => q.table === 'app_settings')!.stappen.find((s) => s.m === 'upsert')!
    const waarde = JSON.parse((opgeslagen.args[0] as { value: string }).value) as SourceHealth
    expect(JSON.stringify(waarde)).not.toMatch(/Woninghuur|pensioenstelsel/)
  })
})

// ── Bestaand gedrag: bewaren op tijd + duidingsstap ──────────────

describe('runNewsIngest — bewaren op tijd, geen grens op aantal (ADR 0171)', () => {
  it('ruimt op wat ARTICLE_RETENTION_DAYS niet meer gezien is (laatst_gezien_at) en verwijdert nooit op aantal', async () => {
    const { client, stappen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })

    const deletes = stappen.filter((q) => q.table === 'news_articles' && q.stappen.some((s) => s.m === 'delete'))
    expect(deletes).toHaveLength(1)
    const lt = deletes[0].stappen.find((s) => s.m === 'lt')!
    expect(lt.args[0]).toBe('laatst_gezien_at')
    expect(dagenTerug(lt.args[1] as string, NU)).toBe(ARTICLE_RETENTION_DAYS)
    expect(deletes[0].stappen.some((s) => s.m === 'in')).toBe(false)
  })

  it('een artikel dat nog op de bron staat, krijgt bij "al bekend" een nieuwe laatst_gezien_at (M2)', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    expect(rijen.every((r) => r.laatst_gezien_at === NU.toISOString())).toBe(true)
    const later = new Date('2026-12-01T05:25:00.000Z')
    await runNewsIngest(client as never, null, { now: later })
    expect(rijen.every((r) => r.laatst_gezien_at === later.toISOString())).toBe(true)
    // fetched_at (het moment van eerste binnenkomst) blijft staan.
    expect(rijen.every((r) => r.fetched_at === NU.toISOString())).toBe(true)
  })
})

describe('runNewsIngest — categorisatie per brok, met tijdbudget (H1)', () => {
  const veelLinks = (n: number) =>
    `<main><ul>${Array.from({ length: n }, (_, i) => `<li><a href="/nl-nl/nieuws/2026/38/bericht-nummer-${i}">Een nieuwsbericht met nummer ${i}</a></li>`).join('')}</ul></main>`

  it('schrijft per brok meteen; na het budget start geen nieuw brok en komt het restant de volgende run', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(50), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    // De klok springt bij elke categorisatie-call 60 s vooruit.
    let tijd = 0
    const klok = () => tijd
    vi.mocked(categorizeArticles).mockImplementation(async (arts) => {
      tijd += 60_000
      return new Map(arts.map((_, i) => [i, { category: 'macro', summary: 'x', potentialImpact: 'Geen directe impact' }]))
    })
    const { client, rijen } = maakClient()
    const een = await runNewsIngest(client as never, MODEL, { now: NU, klok, categorisatieTijdBudgetMs: 90_000 })
    // Twee werkers pakken samen de eerste twee brokken van 20 (vóór de deadline); het derde valt erbuiten.
    expect(een.summary.inserted).toBe(40)
    expect(een.summary.uitgesteld).toBe(10)
    expect(rijen).toHaveLength(40)
    expect(rijen.every((r) => r.category === 'macro')).toBe(true)

    tijd = 0
    const twee = await runNewsIngest(client as never, MODEL, { now: NU, klok, categorisatieTijdBudgetMs: 90_000 })
    expect(twee.summary.inserted).toBe(10)
    expect(twee.summary.alBekend).toBe(40)
    expect(twee.summary.uitgesteld).toBe(0)
    expect(rijen).toHaveLength(50)
  })

  it('een budget van 0 laat toch het eerste brok door: elke run legt iets vast', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(30), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, categorisatieTijdBudgetMs: 0 })
    expect(summary.inserted).toBeGreaterThanOrEqual(20)
    expect(summary.inserted + summary.uitgesteld).toBe(30)
  })

  it('faalt alleen de inhoudcontrole, dan blijft de sleutelcontrole gelden: al bekend wordt niet opnieuw gecategoriseerd', async () => {
    zetBronnen()
    const eerste = maakClient()
    await runNewsIngest(eerste.client as never, null, { now: NU })
    const { client, rijen } = maakClient({ hashLeesFout: true })
    rijen.push(...eerste.rijen)
    vi.mocked(categorizeArticles).mockClear()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [0, 1], geweigerd: 0, afgekapt: 0, ok: true })
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU })
    // Alles behalve de twee nieuwe lijstlinks was al bekend op sleutel.
    expect(summary.alBekend).toBe(eerste.rijen.length)
    expect(summary.inserted).toBe(2)
    const gecategoriseerd = vi.mocked(categorizeArticles).mock.calls.flatMap(([a]) => a)
    expect(gecategoriseerd).toHaveLength(2)
  })
})

describe('runNewsIngest — de duidingsstap', () => {
  it('draait alleen met een batch-cap, ná de brongezondheid, en geeft de uitkomst door in de summary', async () => {
    const { client, stappen } = maakClient()
    const duidingModel = { modelId: 'x' }
    let healthGeschrevenBijStart = 0
    vi.mocked(duidWachtendeArtikelen).mockImplementationOnce(async () => {
      healthGeschrevenBijStart = stappen.filter((q) => q.table === 'app_settings' && q.stappen.some((s) => s.m === 'upsert')).length
      return DUIDING_UITKOMST
    })
    const { summary } = await runNewsIngest(client as never, null, { duidingModel, duidingMaxPerRun: 60, duidingTijdBudgetMs: 1234 })

    expect(duidWachtendeArtikelen).toHaveBeenCalledTimes(1)
    const [, model, opties] = vi.mocked(duidWachtendeArtikelen).mock.calls[0]
    expect(model).toBe(duidingModel)
    expect(opties.maxPerRun).toBe(60)
    expect(opties.tijdBudgetMs).toBe(1234)
    // 1F fase 2: de ingest geeft GEEN tekst meer mee — elke rij duidt op haar
    // eigen bron_kop + bron_fragment.
    expect(Object.keys(opties).sort()).toEqual(['maxPerRun', 'tijdBudgetMs'])
    // Statusregistratie eerst: een maxDuration-kill in de duiding laat de brongezondheid staan.
    expect(healthGeschrevenBijStart).toBe(1)
    expect(summary.duiding).toEqual(DUIDING_UITKOMST)
  })

  it('zonder batch-cap wordt de stap overgeslagen en is de summary leeg', async () => {
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, null)
    expect(duidWachtendeArtikelen).not.toHaveBeenCalled()
    expect(summary.duiding).toEqual({ geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 })
  })

  it('geeft de duidingsstap geen paginatekst mee: de grondslag staat op de rij zelf', async () => {
    zetBronnen()
    const { client } = maakClient()
    await runNewsIngest(client as never, null, { now: NU, duidingMaxPerRun: 1 })
    const [, , opties] = vi.mocked(duidWachtendeArtikelen).mock.calls[0]
    expect(opties).toEqual({ maxPerRun: 1, tijdBudgetMs: undefined })
  })
})
