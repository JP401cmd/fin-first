import { describe, it, expect, vi, beforeEach } from 'vitest'

// De fetchers en de bronlijst worden per test gezet; webTekstVoorDuiding en
// de rest van news-sources blijven echt.
vi.mock('@/lib/news-sources', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./news-sources')>()
  return {
    ...echt,
    loadNewsSources: vi.fn(async () => ({ rssFeeds: [], webSources: [] })),
    fetchRssFeed: vi.fn(async () => ({ items: [], oorzaak: 'leeg', afgekapt: 0, geweigerd: 0 })),
    fetchWebPage: vi.fn(async () => ({ ok: false, oorzaak: 'http_fout', httpStatus: 404 })),
    // Standaard geen netwerk: een detailpagina valt terug op de aankondiging.
    fetchDetailPagina: vi.fn(async () => ({ uitkomst: 'terugval', oorzaak: 'http_fout', httpStatus: 404 })),
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
import { loadNewsSources, fetchRssFeed, fetchWebPage, fetchDetailPagina } from '@/lib/news-sources'
import { kiesArtikelLinks, categorizeArticles } from '@/lib/news-enrich'
import type { DuidingSummary } from '@/lib/krant/duiding'
import {
  runNewsIngest as runNewsIngestEcht,
  bepaalIngestUitkomst,
  ARTICLE_RETENTION_DAYS,
  inhoudHash,
  sectieArtikelUrl,
  ontdubbelBatch,
  rssKandidaat,
  terugvalLinks,
  isDoorstuurVorm,
  TERUGVAL_MAX_PER_LIJST,
  omEnOm,
  pasDetailToe,
  backfillUrlFilter,
  webLijstKandidaat,
  MAX_DETAILS_PER_RUN,
  MAX_BACKFILL_PER_RUN,
  DETAIL_TUSSENRUIMTE_MS,
  CATEGORISATIE_FRAGMENT_MAX_TEKENS,
  CATEGORISATIE_BROK,
  RUN_TIJDBUDGET_MS,
  begrensDuidingBudget,
  type IngestSummary,
  type SourceHealth,
  type SourceHealthEntry,
} from './news-ingest'

// De echte tussenruimte per host (1 s) hoort niet in een unit-test; tests die
// het wachten zelf willen zien, geven hun eigen `wacht` mee.
const runNewsIngest: typeof runNewsIngestEcht = (supabase, model, opties = {}) =>
  runNewsIngestEcht(supabase, model, { wacht: async () => {}, ...opties })

// ── Nep-client: een in-memory news_articles met een unieke index op source_url ──

type Rij = Record<string, unknown> & { source_url: string }
interface Stap { m: string; args: unknown[] }

function maakClient(
  opties: { racePerUrl?: Set<string>; hashLeesFout?: boolean; zonderBronDetailKolom?: boolean; paginaLeesFout?: boolean; zonderWijzigingKolom?: boolean } = {},
) {
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
      // Backfill (Krant 1F fase 3): `.is(kolom, null)`, `.neq(kolom, w)`, `.eq('id', w)`
      // en `.or(...)` — het or-filter wordt alleen vastgelegd, de test toetst de vorm.
      const isFilters: { kolom: string; waarde: unknown }[] = []
      const neqFilters: { kolom: string; waarde: unknown }[] = []
      let eqFilter: { kolom: string; waarde: unknown } | null = null
      // ADR 0191: de bestaanscheck per pagina filtert op twee kolommen.
      const eqAlle: { kolom: string; waarde: unknown }[] = []
      let limiet: number | null = null
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
      chain.is = stap('is', (k, v) => { isFilters.push({ kolom: String(k), waarde: v }) })
      chain.neq = stap('neq', (k, v) => { neqFilters.push({ kolom: String(k), waarde: v }) })
      chain.eq = stap('eq', (k, v) => { eqFilter = { kolom: String(k), waarde: v }; eqAlle.push({ kolom: String(k), waarde: v }) })
      chain.limit = stap('limit', (n) => { limiet = n as number })
      for (const m of ['lt', 'gte', 'order', 'or']) chain[m] = stap(m)
      const past = (r: Rij) =>
        isFilters.every((f) => (r[f.kolom] ?? null) === f.waarde) && neqFilters.every((f) => r[f.kolom] !== f.waarde)
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        let uitkomst: unknown = { data: [], error: null }
        if (table === 'news_articles' && modus === 'select' && inFilter && kolom.includes(',')) {
          // Meerkoloms-lezing (de backfill): hele rijen die aan alle filters voldoen.
          const f = inFilter as { kolom: string; waarden: string[] }
          const treffers = rijen.filter((r) => f.waarden.includes(r[f.kolom] as string) && past(r))
          uitkomst = { data: limiet === null ? treffers : treffers.slice(0, limiet), error: null }
        } else if (table === 'news_articles' && modus === 'select' && !inFilter && eqAlle.length > 0) {
          // Bestaanscheck (ADR 0191): rijen die aan álle eq-filters voldoen, tot de limiet.
          const treffers = rijen.filter((r) => eqAlle.every((f) => r[f.kolom] === f.waarde))
          uitkomst = opties.paginaLeesFout
            ? { data: null, error: { message: 'nep: paginacontrole faalt' } }
            : { data: (limiet === null ? treffers : treffers.slice(0, limiet)).map((r) => ({ id: r.id })), error: null }
        } else if (table === 'news_articles' && modus === 'update' && eqFilter) {
          const f = eqFilter as { kolom: string; waarde: unknown }
          const geraakt = rijen.filter((r) => r[f.kolom] === f.waarde && past(r))
          for (const r of geraakt) Object.assign(r, updateVelden)
          uitkomst = { data: geraakt.map((r) => ({ id: r.id })), error: null }
        } else if (table === 'news_articles' && modus === 'select' && inFilter) {
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
          if (opties.zonderWijzigingKolom && 'bron_wijziging' in rij) {
            // Vóór de migratie 20261009120000: PostgREST kent de kolom niet.
            uitkomst = { data: null, error: { code: 'PGRST204', message: "Could not find the 'bron_wijziging' column" } }
          } else if (opties.zonderWijzigingKolom && rij.published_bron === 'pagina') {
            // …en de CHECK op published_bron kent 'pagina' nog niet.
            uitkomst = { data: null, error: { code: '23514', message: 'violates check constraint' } }
          } else if (opties.zonderBronDetailKolom && 'bron_detail' in rij) {
            // Vóór de migratie 20261003120000: PostgREST kent de kolom niet.
            uitkomst = { data: null, error: { code: 'PGRST204', message: "Could not find the 'bron_detail' column" } }
          } else if (!bestaat && opties.racePerUrl?.has(rij.source_url)) {
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
  vi.mocked(fetchRssFeed).mockResolvedValue({ items: FEED_ITEMS, oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
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
    // Twee secties + twee lijstlinks; die laatste komen zonder model via de
    // terugval binnen. De feed-rij verloor de race en telt als "al bekend".
    expect(summary.inserted).toBe(4)
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
  it('elke bron krijgt een oorzaak; zonder model valt een lijstpagina terug op de eerste links', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [FEED], webSources: [LIJST, PAGINA] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], oorzaak: 'dns', afgekapt: 0, geweigerd: 0 })
    vi.mocked(fetchWebPage).mockImplementation(async (s) =>
      s.url === LIJST.url ? { ok: true, html: LIJST_HTML, finalUrl: LIJST.url } : { ok: false, oorzaak: 'http_fout', httpStatus: 404 },
    )
    const { client, stappen } = maakClient()
    const { health } = await runNewsIngest(client as never, null, { now: NU })
    const per = Object.fromEntries(health.sources.map((s) => [s.url, s]))
    expect(per[FEED.url]).toMatchObject({ soort: 'rss', type: 'rss', oorzaak: 'dns', items: 0 })
    // De twee links van de pagina komen binnen via de terugval; de oorzaak zegt
    // dát het de terugval was, zodat /beheer/nieuws dit niet als 'ok' leest.
    expect(per[LIJST.url]).toMatchObject({ soort: 'web_lijst', type: 'web', oorzaak: 'terugval_geen_model', items: 2 })
    expect(per[PAGINA.url]).toMatchObject({ soort: 'web_pagina', oorzaak: 'http_fout', httpStatus: 404 })

    // De gezondheid landt in app_settings en bevat geen artikeltekst.
    const opgeslagen = stappen.find((q) => q.table === 'app_settings')!.stappen.find((s) => s.m === 'upsert')!
    const waarde = JSON.parse((opgeslagen.args[0] as { value: string }).value) as SourceHealth
    expect(JSON.stringify(waarde)).not.toMatch(/Woninghuur|pensioenstelsel/)
  })
})

// ── De terugval op een lijstpagina (25 sep 2026) ─────────────────────
//
// REPRO: op 24 sep ~18:00 liep het Anthropic-tegoed leeg. In de run van 25 sep
// 07:23 weigerde `kiesArtikelLinks` op alle ZEVEN web_lijst-bronnen (AFM ×2,
// CBS ×2, CPB ×2, ECB) — in de brongezondheid stond overal `oorzaak:
// model_fout, items: 0`. De pagina's waren gewoon opgehaald; alleen het
// oordeel ontbrak. Resultaat: `perSoort.web_lijst` viel van 33 naar 0 en de
// hele bronklasse verdween.

describe('runNewsIngest — web_lijst valt terug als het model niet kan kiezen', () => {
  it('REPRO: modelfout op de lijstpagina → de links komen alsnog binnen, met terugval_model_fout', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [], geweigerd: 0, afgekapt: 0, ok: false })

    const { summary, health } = await runNewsIngest(client as never, MODEL, { now: NU })

    expect(summary.perSoort.web_lijst).toBe(2)
    expect(health.sources.find((s) => s.url === LIJST.url)).toMatchObject({
      oorzaak: 'terugval_model_fout',
      items: 2,
    })
    // ADR 0176: kop en sleutel komen uit de door de server gelezen link.
    const lijst = rijen.filter((r) => r.bron_soort === 'web_lijst')
    expect(lijst.map((r) => r.bron_kop)).toEqual([
      'Woninghuur stijgt gemiddeld met 4,4 procent',
      'Inflatie stijgt naar 3,3 procent in augustus',
    ])
    expect(lijst.every((r) => String(r.source_url).startsWith('https://www.cbs.nl/'))).toBe(true)
  })

  it('een model dat wél koos maar niets passend vond, wordt gerespecteerd — geen terugval', async () => {
    // Het onderscheid dat de hele terugval draagt: `ok: true` met een lege
    // keuze is een OORDEEL ("geen van deze links is een artikel"). Dat
    // overrulen zou de bak vullen met wat het model bewust wegliet.
    zetBronnen()
    const { client } = maakClient()
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [], geweigerd: 0, afgekapt: 0, ok: true })

    const { summary, health } = await runNewsIngest(client as never, MODEL, { now: NU })

    expect(summary.perSoort.web_lijst).toBe(0)
    expect(health.sources.find((s) => s.url === LIJST.url)).toMatchObject({ oorzaak: 'leeg', items: 0 })
  })

  it('een pagina zonder bruikbare links blijft "leeg" — er valt niets terug te vallen', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: '<main><p>Niets hier.</p></main>', finalUrl: LIJST.url })
    const { client } = maakClient()

    const { health } = await runNewsIngest(client as never, null, { now: NU })

    expect(health.sources.find((s) => s.url === LIJST.url)).toMatchObject({ oorzaak: 'leeg', items: 0 })
  })

  it('de terugval neemt hoogstens TERUGVAL_MAX_PER_LIJST links, ook als de pagina er veel meer heeft', async () => {
    const paginaMet = (n: number) =>
      `<main><ul>${Array.from({ length: n }, (_, i) => `<li><a href="/nl-nl/nieuws/2026/${i}/bericht-over-koopkracht">Bericht ${i} over koopkracht en inflatie</a></li>`).join('')}</ul></main>`
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: paginaMet(50), finalUrl: LIJST.url })
    const { client } = maakClient()

    const { summary } = await runNewsIngest(client as never, null, { now: NU })

    expect(summary.perSoort.web_lijst).toBe(TERUGVAL_MAX_PER_LIJST)
  })
})

describe('terugvalLinks', () => {
  const l = (pad: string) => ({ url: `https://www.cbs.nl${pad}` })
  const links = [l('/a'), l('/b'), l('/c'), l('/d'), l('/e')]

  it('neemt de eerste `max` in paginavolgorde', () => {
    expect(terugvalLinks(links, 3)).toEqual([l('/a'), l('/b'), l('/c')])
  })

  it('minder links dan de cap: alles', () => {
    expect(terugvalLinks([l('/a')], 4)).toEqual([l('/a')])
  })

  it('een lege lijst en een cap van 0 geven beide niets — geen uitzondering', () => {
    expect(terugvalLinks([], 4)).toEqual([])
    expect(terugvalLinks(links, 0)).toEqual([])
  })

  it('een negatieve cap valt naar 0, niet naar een slice-vanaf-achteren', () => {
    // `slice(0, -1)` zou hier stilletjes alles-op-één-na teruggeven.
    expect(terugvalLinks(links, -2)).toEqual([])
  })

  it('weert een doorstuur-link en schuift de volgende door — de cap blijft vol', () => {
    // Zonder deze zeef zou een open redirector bovenaan de paginavolgorde
    // gegarandeerd meegaan; het model hield zoiets impliciet tegen.
    const uit = terugvalLinks([{ url: 'https://www.cbs.nl/uit?url=https://kwaadaardig.nl' }, ...links], 2)
    expect(uit).toEqual([l('/a'), l('/b')])
  })
})

describe('isDoorstuurVorm', () => {
  it('een gewone artikel-URL is geen doorstuur', () => {
    expect(isDoorstuurVorm('https://www.cbs.nl/nl-nl/nieuws/2026/37/inflatie')).toBe(false)
  })

  it('een absolute URL in de query is een doorstuur, ongeacht de parameternaam', () => {
    for (const naam of ['url', 'redirect', 'next', 'r', 'doel']) {
      expect(isDoorstuurVorm(`https://www.cbs.nl/uit?${naam}=https://kwaadaardig.nl`)).toBe(true)
    }
  })

  it('een absolute URL in het pad is een doorstuur, ook ge-escaped', () => {
    expect(isDoorstuurVorm('https://www.cbs.nl/out/https://kwaadaardig.nl')).toBe(true)
    expect(isDoorstuurVorm('https://www.cbs.nl/out/https%3A%2F%2Fkwaadaardig.nl')).toBe(true)
  })

  it('een ge-escapete absolute URL in de query telt ook', () => {
    expect(isDoorstuurVorm('https://www.cbs.nl/uit?url=https%3A%2F%2Fkwaadaardig.nl')).toBe(true)
  })

  it('een onparseerbare URL geldt als doorstuur — geen voorkeursbehandeling', () => {
    expect(isDoorstuurVorm('niet-eens-een-url')).toBe(true)
  })

  it('een misvormde escape laat de toets niet omvallen', () => {
    // decodeURIComponent werpt op %ZZ; de rauwe vorm wordt dan getoetst.
    expect(isDoorstuurVorm('https://www.cbs.nl/nieuws%ZZ/inflatie')).toBe(false)
    expect(isDoorstuurVorm('https://www.cbs.nl/uit%ZZ/https://kwaadaardig.nl')).toBe(true)
  })

  it('het woord http in een gewone padnaam is geen doorstuur', () => {
    expect(isDoorstuurVorm('https://www.cbs.nl/nl-nl/dossier/https-uitleg')).toBe(false)
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

describe('runNewsIngest — ochtendroutine: versie-bump zonder model (29 sep)', () => {
  it('geeft versieBumpZonderModel alleen door als de route erom vraagt', async () => {
    const { client } = maakClient()
    await runNewsIngest(client as never, MODEL, { now: NU, duidingModel: null, duidingMaxPerRun: 60, duidingVersieBumpZonderModel: true })
    expect(vi.mocked(duidWachtendeArtikelen).mock.calls.at(-1)?.[2]).toMatchObject({ versieBumpZonderModel: true })
    await runNewsIngest(client as never, MODEL, { now: NU, duidingModel: null, duidingMaxPerRun: 60 })
    expect(vi.mocked(duidWachtendeArtikelen).mock.calls.at(-1)?.[2]).not.toHaveProperty('versieBumpZonderModel')
  })
})

describe('runNewsIngest — categorisatie per brok, met tijdbudget (H1)', () => {
  // Bewust buiten DETAIL_HOSTS (/nl-nl/nieuws/): deze suite toetst de categorisatie, niet de detailcap.
  const veelLinks = (n: number) =>
    `<main><ul>${Array.from({ length: n }, (_, i) => `<li><a href="/nl-nl/achtergrond/2026/38/bericht-nummer-${i}">Een nieuwsbericht met nummer ${i}</a></li>`).join('')}</ul></main>`

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
    // Twee werkers pakken samen de eerste twee brokken van CATEGORISATIE_BROK
    // (vóór de deadline); daarna staat de klok op 120 s en start er niets meer.
    expect(een.summary.inserted).toBe(2 * CATEGORISATIE_BROK)
    expect(een.summary.uitgesteld).toBe(50 - 2 * CATEGORISATIE_BROK)
    expect(rijen).toHaveLength(2 * CATEGORISATIE_BROK)
    expect(rijen.every((r) => r.category === 'macro')).toBe(true)

    // De volgende run pakt het restant op; wat al staat, is al bekend (sleutel = server).
    // Met brokken van 20 (besluit eigenaar 29 sep) past het restant van 10 in één brok.
    expect(CATEGORISATIE_BROK).toBe(20)
    tijd = 0
    const twee = await runNewsIngest(client as never, MODEL, { now: NU, klok, categorisatieTijdBudgetMs: 90_000 })
    expect(twee.summary.inserted).toBe(10)
    expect(twee.summary.alBekend).toBe(40)
    expect(twee.summary.uitgesteld).toBe(0)
    expect(rijen).toHaveLength(50)
  })

  it('verwachte eindtijd: na twee gelijktijdige brokken van 60 s start er bij 75 s budget geen derde (meting 28 sep)', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(100), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    // Realistische klok: de twee werkers lopen GELIJKTIJDIG. Elke call eindigt
    // 60 s na zijn eigen start; de klok springt pas als de call klaar is.
    let tijd = 0
    const klok = () => tijd
    let eindtijdLaatste = 0
    vi.mocked(categorizeArticles).mockImplementation(async (arts) => {
      const eind = tijd + 60_000
      await Promise.resolve()
      tijd = Math.max(tijd, eind)
      eindtijdLaatste = tijd
      return new Map(arts.map((_, i) => [i, { category: 'macro', summary: 'x', potentialImpact: 'Geen directe impact' }]))
    })
    const { client, rijen } = maakClient()
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, klok, categorisatieTijdBudgetMs: 75_000 })
    // Eerste golf: twee brokken tegelijk, klaar op 60 s. 60 + 60 > 75, dus
    // geen tweede golf — vóór deze wijziging startte die op 60 s en liep de
    // stap tot 120 s.
    expect(vi.mocked(categorizeArticles)).toHaveBeenCalledTimes(2)
    expect(summary.inserted).toBe(2 * CATEGORISATIE_BROK)
    expect(summary.uitgesteld).toBe(100 - 2 * CATEGORISATIE_BROK)
    expect(rijen).toHaveLength(2 * CATEGORISATIE_BROK)
    expect(eindtijdLaatste).toBeLessThanOrEqual(75_000)
  })

  it('de schatting is de LANGSTE gemeten brok: een snelle brok daarna haalt hem niet omlaag', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(100), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    // Eerste call 50 s, alle volgende 5 s. Met de laatste meting als schatting
    // (5 s) zou er tot ~70 s worden bijgestart; met het maximum (50 s) stopt de
    // lus zodra nu + 50 > 75.
    let tijd = 0
    let n = 0
    const eindes: number[] = []
    vi.mocked(categorizeArticles).mockImplementation(async (arts) => {
      const eind = tijd + (n++ === 0 ? 50_000 : 5_000)
      await Promise.resolve()
      tijd = Math.max(tijd, eind)
      eindes.push(tijd)
      return new Map(arts.map((_, i) => [i, { category: 'macro', summary: 'x', potentialImpact: 'Geen directe impact' }]))
    })
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, klok: () => tijd, categorisatieTijdBudgetMs: 75_000 })
    expect(summary.inserted + summary.uitgesteld).toBe(100)
    expect(summary.uitgesteld).toBeGreaterThan(0)
    // Geen brok eindigt voorbij het budget.
    expect(Math.max(...eindes)).toBeLessThanOrEqual(75_000)
  })

  it('het duidingsbudget wordt begrensd door wat er van de run over is', () => {
    expect(begrensDuidingBudget(125_000, RUN_TIJDBUDGET_MS - 130_000)).toBe(125_000)
    expect(begrensDuidingBudget(125_000, RUN_TIJDBUDGET_MS - 200_000)).toBe(70_000)
    expect(begrensDuidingBudget(125_000, -5_000)).toBe(0)
    expect(begrensDuidingBudget(undefined, 40_000)).toBe(40_000)
  })

  it('snelle brokken blijven doorlopen zolang de gemeten duur nog past', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(100), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    let tijd = 0
    vi.mocked(categorizeArticles).mockImplementation(async (arts) => {
      const eind = tijd + 20_000
      await Promise.resolve()
      tijd = Math.max(tijd, eind)
      return new Map(arts.map((_, i) => [i, { category: 'macro', summary: 'x', potentialImpact: 'Geen directe impact' }]))
    })
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, klok: () => tijd, categorisatieTijdBudgetMs: 75_000 })
    // Vijf brokken van 20 in golven op 0, 20 en 40 s (40 + 20 ≤ 75): alles past.
    expect(vi.mocked(categorizeArticles)).toHaveBeenCalledTimes(5)
    expect(summary.inserted).toBe(100)
    expect(summary.uitgesteld).toBe(0)
  })

  it('een budget van 0 laat toch het eerste brok door: elke run legt iets vast', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: veelLinks(30), finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockImplementation(async (links) => ({ indexen: links.map((_, i) => i), geweigerd: 0, afgekapt: 0, ok: true }))
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, categorisatieTijdBudgetMs: 0 })
    expect(summary.inserted).toBeGreaterThanOrEqual(CATEGORISATIE_BROK)
    expect(summary.inserted + summary.uitgesteld).toBe(30)
  })

  it('faalt alleen de inhoudcontrole, dan blijft de sleutelcontrole gelden: al bekend wordt niet opnieuw gecategoriseerd', async () => {
    zetBronnen()
    const eerste = maakClient()
    // De seed-run draait MÉT model (dat standaard niets kiest: `ok: true`, lege
    // keuze), zodat de twee lijstlinks in de tweede run écht nieuw zijn. Met
    // `null` zou de terugval ze hier al binnenhalen en meet de test niets meer.
    await runNewsIngest(eerste.client as never, MODEL, { now: NU })
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
    // Zonder gevraagd budget krijgt de duiding sinds 29 sep wat er van de run
    // over is (RUN_TIJDBUDGET_MS), niet meer een onbegrensde deadline.
    expect(opties).toEqual({ maxPerRun: 1, tijdBudgetMs: expect.any(Number) })
    expect((opties as { tijdBudgetMs: number }).tijdBudgetMs).toBeLessThanOrEqual(RUN_TIJDBUDGET_MS)
  })
})

// ── Uitkomst van een run: liep hij, en leverde hij alles? ─────────────
//
// Aanleiding 25 sep 2026: het AI-tegoed liep leeg, de duiding duidde 0 van 2
// rijen en de bronklasse web_lijst viel van 33 naar 0 kandidaten — en de run
// meldde zich als `status: 'success'`, `error: null`.

describe('bepaalIngestUitkomst', () => {
  const summary = (duiding: Partial<DuidingSummary> = {}, extra: Partial<IngestSummary> = {}): IngestSummary => ({
    sourcesChecked: 3,
    rssArticlesFound: 15,
    webArticlesExtracted: 78,
    perSoort: { rss: 15, web_lijst: 33, web_pagina: 45 },
    duplicatesSkipped: 0,
    alBekend: 0,
    inserted: 3,
    skipped: 0,
    uitgesteld: 0,
    linksGeweigerd: 0,
    details: { gelezen: 0, terugval: 0, geenHtml: 0, uitgesteld: 0 },
    backfill: { gelezen: 0, terugval: 0, geenHtml: 0, herduid: 0, uitgesteld: 0, fout: 0 },
    duiding: { geduid: 3, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0, ...duiding },
    ...extra,
  })

  const bron = (
    soort: 'rss' | 'web_lijst' | 'web_pagina',
    items: number,
    oorzaak: SourceHealthEntry['oorzaak'] = items > 0 ? 'ok' : 'leeg',
  ): SourceHealthEntry => ({
    label: `${soort}-bron`,
    url: `https://voorbeeld.nl/${soort}`,
    soort,
    type: soort === 'rss' ? 'rss' : 'web',
    items,
    nieuw: 0,
    oorzaak,
  })

  const gezond = (sources: SourceHealthEntry[]): SourceHealth => ({
    checkedAt: '2026-09-25T05:23:44.879Z',
    sources,
  })

  const VOLLEDIG = gezond([bron('rss', 15), bron('web_lijst', 33), bron('web_pagina', 45)])

  it('een volledige run is "success" zonder verlies', () => {
    expect(bepaalIngestUitkomst(summary(), VOLLEDIG)).toEqual({ status: 'success', verlies: [] })
  })

  it('duiding met pogingen maar 0 geduid → partial', () => {
    const uit = bepaalIngestUitkomst(summary({ geduid: 0, mislukt: 2, wacht: 2 }), VOLLEDIG)
    expect(uit.status).toBe('partial')
    expect(uit.verlies).toEqual(['duiding: 0 van 2 geduid (afgewezen 0, mislukt 2)'])
  })

  it('een lege duidingswachtrij is geen verlies: nul pogingen, nul duidingen', () => {
    const uit = bepaalIngestUitkomst(summary({ geduid: 0 }), VOLLEDIG)
    expect(uit).toEqual({ status: 'success', verlies: [] })
  })

  it('overgeslagen en wacht zijn uitstel, geen verlies — ze komen de volgende run terug', () => {
    const uit = bepaalIngestUitkomst(summary({ geduid: 0, overgeslagen: 4, wacht: 9 }), VOLLEDIG)
    expect(uit).toEqual({ status: 'success', verlies: [] })
  })

  // ── De terugval mag de melding niet blind maken (eindreview 25 sep 2026) ──
  //
  // De eerste versie van deze functie kende twee triggers, en de A2-terugval
  // ontkrachtte ze allebei tegelijk: hij vult `items` op (trigger 2 zwijgt),
  // en zonder duidingsmodel zijn er nul pogingen (trigger 1 zwijgt). Een run
  // met NUL AI meldde zich daardoor als 'success' — precies het defect waarvoor
  // deze hele functie bestaat.

  it('REPRO eindreview: geen enkel model → terugval vult de bronnen, en de run is tóch partial', () => {
    const uit = bepaalIngestUitkomst(
      // Zonder duidingsmodel wordt de stap overgeslagen: nul pogingen, dus
      // trigger 1 (duiding) kan hier per definitie niet vuren.
      summary({ geduid: 0, afgewezen: 0, mislukt: 0, wacht: 12 }),
      gezond([
        bron('rss', 15),
        bron('web_lijst', 4, 'terugval_geen_model'),
        bron('web_lijst', 4, 'terugval_geen_model'),
        bron('web_pagina', 45),
      ]),
    )
    expect(uit.status).toBe('partial')
    expect(uit.verlies).toEqual([
      'bronsoort web_lijst: 2 van 2 bron(nen) zonder AI-oordeel, eerste links genomen (terugval_geen_model)',
    ])
  })

  it('terugval na een modelfout meldt zich óók, naast een gezonde bron van dezelfde soort', () => {
    const uit = bepaalIngestUitkomst(
      summary(),
      gezond([bron('web_lijst', 4, 'terugval_model_fout'), bron('web_lijst', 12), bron('rss', 15)]),
    )
    expect(uit.status).toBe('partial')
    expect(uit.verlies).toEqual([
      'bronsoort web_lijst: 1 van 2 bron(nen) zonder AI-oordeel, eerste links genomen (terugval_model_fout)',
    ])
  })

  it('een weggevallen klasse meldt zich één keer, niet óók als terugval', () => {
    // items === 0 wint: er viel niets terug te vallen, dus de weggevallen-regel
    // is de juiste en enige.
    const uit = bepaalIngestUitkomst(
      summary(),
      gezond([bron('rss', 15), bron('web_lijst', 0, 'model_fout'), bron('web_pagina', 45)]),
    )
    expect(uit.verlies).toHaveLength(1)
    expect(uit.verlies[0]).toContain('0 kandidaten')
  })

  it('een weggevallen bronklasse → partial, met de oorzaak-code erbij', () => {
    const uit = bepaalIngestUitkomst(
      summary(),
      gezond([bron('rss', 15), bron('web_lijst', 0, 'model_fout'), bron('web_pagina', 45)]),
    )
    expect(uit.status).toBe('partial')
    expect(uit.verlies).toEqual([
      'bronsoort web_lijst: 0 kandidaten uit 1 bevraagde bron(nen) (model_fout)',
    ])
  })

  it('één falende bron naast een werkende van dezelfde soort triggert niets', () => {
    const uit = bepaalIngestUitkomst(
      summary(),
      gezond([bron('web_lijst', 0, 'http_fout'), bron('web_lijst', 12), bron('rss', 15)]),
    )
    expect(uit).toEqual({ status: 'success', verlies: [] })
  })

  it('een soort zonder geconfigureerde bronnen triggert niets — niets bevraagd', () => {
    const uit = bepaalIngestUitkomst(summary(), gezond([bron('rss', 15)]))
    expect(uit).toEqual({ status: 'success', verlies: [] })
  })

  it('geen enkele bron geconfigureerd: geen verlies te melden', () => {
    expect(bepaalIngestUitkomst(summary(), gezond([]))).toEqual({ status: 'success', verlies: [] })
  })

  it('de verlies-regels dragen alleen tellingen, soorten en oorzaak-codes', () => {
    const uit = bepaalIngestUitkomst(
      summary({ geduid: 0, mislukt: 2 }),
      gezond([bron('web_lijst', 0, 'model_fout')]),
    )
    for (const regel of uit.verlies) {
      expect(regel).not.toContain('https://')
      expect(regel).not.toContain('voorbeeld.nl')
    }
  })
})

// ── Bronherijking 27 sep 2026: dezelfde artikelen via een andere bron ──

describe('runNewsIngest — bron omgezet van web_lijst naar rss (CBS, 27 sep 2026)', () => {
  const CBS_FEED = { url: 'https://www.cbs.nl/nl-nl/rss-feeds/prijzen', label: 'CBS — Prijzen (CPI / inflatie)' }
  const feedItem = (slug: string, title: string, publishedAt: string) => ({
    title,
    description: null,
    link: `https://www.cbs.nl/nl-nl/nieuws/2026/${slug}`,
    publishedAt,
    sourceName: CBS_FEED.label,
  })

  it('de links die de oude lijstbron al schreef, blijven "al bekend"; alleen het echt nieuwe item komt erbij — en een tweede run verandert niets', async () => {
    const { client, rijen } = maakClient()

    // Run 1 (vóór de omschakeling): de CBS-lijstpagina, het model kiest beide links.
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [LIJST] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: LIJST_HTML, finalUrl: LIJST.url })
    vi.mocked(kiesArtikelLinks).mockResolvedValueOnce({ indexen: [0, 1], geweigerd: 0, afgekapt: 0, ok: true })
    const voor = await runNewsIngest(client as never, MODEL, { now: NU })
    expect(voor.summary.inserted).toBe(2)

    // Run 2 (ná de omschakeling): de CBS-feed. Dezelfde twee nieuwslinks, letterlijk
    // dezelfde URL (live geverifieerd), plus één nieuw item.
    const items = [
      feedItem('36/woninghuur-stijgt-gemiddeld-met-4-4-procent', 'Woninghuur stijgt gemiddeld met 4,4 procent', '2026-09-04T04:30:00.000Z'),
      feedItem('37/inflatie-stijgt-naar-3-3-procent-in-augustus', 'Inflatie stijgt naar 3,3 procent in augustus', '2026-09-08T04:30:00.000Z'),
      feedItem('39/prijsstijging-koopwoningen-vlakt-in-augustus-verder-af', 'Prijsstijging koopwoningen vlakt in augustus verder af', '2026-09-22T04:30:00.000Z'),
    ]
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS_FEED], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items, oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const na = await runNewsIngest(client as never, MODEL, { now: new Date('2026-09-28T05:23:00.000Z') })
    expect(na.summary.alBekend).toBe(2)
    expect(na.summary.inserted).toBe(1)
    expect(rijen).toHaveLength(3)
    expect(rijen.filter((r) => r.source_url === items[1].link)).toHaveLength(1)

    // Run 3: dezelfde feed nog eens — idempotent.
    vi.mocked(categorizeArticles).mockClear()
    const nogmaals = await runNewsIngest(client as never, MODEL, { now: new Date('2026-09-29T05:23:00.000Z') })
    expect(nogmaals.summary.inserted).toBe(0)
    expect(nogmaals.summary.alBekend).toBe(3)
    expect(rijen).toHaveLength(3)
    expect(categorizeArticles).not.toHaveBeenCalled()
  })
})

describe('runNewsIngest — een bron die een storing meldt levert niets en zegt dat', () => {
  it('oorzaak storing staat in de gezondheid; geen kandidaat, geen rij', async () => {
    const { client, rijen } = maakClient()
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [PAGINA] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: false, oorzaak: 'storing' })
    const { summary, health } = await runNewsIngest(client as never, MODEL, { now: NU })
    expect(health.sources).toEqual([
      expect.objectContaining({ url: PAGINA.url, soort: 'web_pagina', oorzaak: 'storing', items: 0, nieuw: 0 }),
    ])
    expect(summary.inserted).toBe(0)
    expect(rijen).toHaveLength(0)
    // Viel daarmee de hele bronklasse weg, dan meldt de run zich partial (ADR 0178).
    const uitkomst = bepaalIngestUitkomst(summary, health)
    expect(uitkomst.status).toBe('partial')
    expect(uitkomst.verlies.join(' ')).toContain('storing')
  })
})

// ── Krant 1F fase 3: detailpagina's, om-en-om, backfill ─────────────

describe('omEnOm — tegen uithongering van de staart', () => {
  it('eerst de eerste van elke bron, dan de tweede; binnen een bron dezelfde volgorde', () => {
    const lijst = [
      { bron: 0, n: 'a0' }, { bron: 0, n: 'a1' }, { bron: 0, n: 'a2' },
      { bron: 1, n: 'b0' },
      { bron: 2, n: 'c0' }, { bron: 2, n: 'c1' },
    ]
    expect(omEnOm(lijst).map((k) => k.n)).toEqual(['a0', 'b0', 'c0', 'a1', 'c1', 'a2'])
  })
  it('lege lijst en één bron blijven gelijk', () => {
    expect(omEnOm([])).toEqual([])
    const een = [{ bron: 3, n: 'x' }, { bron: 3, n: 'y' }]
    expect(omEnOm(een)).toEqual(een)
  })
})

describe('pasDetailToe — alleen fragment, detailstatus en datum veranderen', () => {
  const RUN = '2026-09-28T05:23:00.000Z'
  const lijstRij = () => webLijstKandidaat(
    { url: 'https://www.cpb.nl/mev-2027', tekst: 'Macro Economische Verkenning 2027', fragment: 'MEV 2027 15 september 2026' },
    { url: 'https://www.cpb.nl/publicaties', label: 'CPB — Publicaties' },
    RUN,
  )

  it('gelezen: artikeltekst als fragment, sleutel en hash van de aankondiging blijven', () => {
    const rij = lijstRij()
    const uit = pasDetailToe(rij, { uitkomst: 'gelezen', tekst: 'De economie groeit met 1,4 procent.', datums: { gepubliceerd: '2026-09-15T13:35:00.000Z', gewijzigd: null } }, RUN)
    expect(uit).toMatchObject({
      bron_fragment: 'De economie groeit met 1,4 procent.',
      raw_content: 'De economie groeit met 1,4 procent.',
      bron_detail: 'gelezen',
      published_at: '2026-09-15T13:35:00.000Z',
      published_bron: 'meta',
      source_url: rij.source_url,
      inhoud_hash: rij.inhoud_hash,
      bron_kop: rij.bron_kop,
    })
  })

  it('een feeddatum wint van de paginametadata; een datum in de toekomst wordt het run-moment', () => {
    const rss = rssKandidaat(
      { title: 'Inflatie 2,3 procent', description: null, link: 'https://www.cbs.nl/nl-nl/nieuws/2026/39/inflatie', publishedAt: '2026-09-25T04:30:00.000Z', sourceName: 'CBS' },
      'https://www.cbs.nl/nl-nl/rss-feeds/prijzen',
      RUN,
    )
    const uit = pasDetailToe(rss, { uitkomst: 'gelezen', tekst: 'Tekst', datums: { gepubliceerd: '2026-09-01T00:00:00.000Z', gewijzigd: null } }, RUN)
    expect(uit).toMatchObject({ published_at: '2026-09-25T04:30:00.000Z', published_bron: 'feed' })
    const toekomst = pasDetailToe(lijstRij(), { uitkomst: 'gelezen', tekst: 'T', datums: { gepubliceerd: '2027-01-01T00:00:00.000Z', gewijzigd: null } }, RUN)
    expect(toekomst.published_at).toBe(RUN)
  })

  it('terugval en geen_html laten het fragment van de aankondiging staan', () => {
    const rij = lijstRij()
    expect(pasDetailToe(rij, { uitkomst: 'terugval', oorzaak: 'timeout' }, RUN)).toEqual({ ...rij, bron_detail: 'terugval' })
    expect(pasDetailToe(rij, { uitkomst: 'geen_html' }, RUN)).toEqual({ ...rij, bron_detail: 'geen_html' })
  })
})

describe('backfillUrlFilter', () => {
  it('volgt DETAIL_HOSTS, met waarden tussen aanhalingstekens', () => {
    expect(backfillUrlFilter()).toBe(
      'source_url.like."https://www.cbs.nl/nl-nl/nieuws/*",source_url.like."https://www.cpb.nl/*",source_url.like."https://www.afm.nl/nl-nl/sector/actueel/*",' +
        // ADR 0191: twee paden op rijksoverheid.nl, elk een eigen prefix.
        'source_url.like."https://www.rijksoverheid.nl/actueel/nieuws/*",source_url.like."https://www.rijksoverheid.nl/documenten/*"',
    )
  })
})

describe('runNewsIngest — detailpagina van nieuwe items (1F fase 3)', () => {
  const CBS = { url: 'https://www.cbs.nl/nl-nl/rss-feeds/prijzen', label: 'CBS — Prijzen' }
  const CBS2 = { url: 'https://www.cbs.nl/nl-nl/rss-feeds/inkomen-en-bestedingen', label: 'CBS — Inkomen' }
  const item = (n: number, feed = CBS) => ({
    title: `CBS-bericht nummer ${n}${feed === CBS2 ? ' over inkomen' : ''}`,
    description: null,
    link: `https://www.cbs.nl/nl-nl/nieuws/2026/39/bericht-${n}${feed === CBS2 ? '-inkomen' : ''}`,
    publishedAt: '2026-09-25T04:30:00.000Z',
    sourceName: feed.label,
  })
  const ARTIKEL = 'De inflatie was in september 2,3 procent. '.repeat(100)
  const gelezen = { uitkomst: 'gelezen' as const, tekst: ARTIKEL, datums: { gepubliceerd: null, gewijzigd: null } }

  beforeEach(() => {
    vi.mocked(fetchDetailPagina).mockReset()
    vi.mocked(fetchDetailPagina).mockResolvedValue(gelezen)
  })

  it('bewaart de artikeltekst, houdt sleutel en hash van de aankondiging, en telt per bron', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [item(1), item(2)], oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    vi.mocked(fetchDetailPagina).mockResolvedValueOnce(gelezen).mockResolvedValueOnce({ uitkomst: 'terugval', oorzaak: 'timeout' })
    const { client, rijen } = maakClient()
    const { summary, health } = await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).toHaveBeenCalledWith(item(1).link, CBS.url)
    expect(summary.details).toEqual({ gelezen: 1, terugval: 1, geenHtml: 0, uitgesteld: 0 })
    expect(health.sources[0]).toMatchObject({ detailGelezen: 1, detailTerugval: 1 })
    const r1 = rijen.find((r) => r.source_url === item(1).link)!
    expect(r1).toMatchObject({ bron_detail: 'gelezen', bron_fragment: ARTIKEL, inhoud_hash: inhoudHash(`${item(1).title}\n${item(1).link}`) })
    const r2 = rijen.find((r) => r.source_url === item(2).link)!
    expect(r2).toMatchObject({ bron_detail: 'terugval', bron_fragment: null })
  })

  it('idempotent: een tweede run met dezelfde feed haalt 0 detailpagina\'s op en schrijft niets', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [item(1), item(2)], oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    const voor = rijen.map((r) => ({ ...r }))
    vi.mocked(fetchDetailPagina).mockClear()
    const twee = await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).not.toHaveBeenCalled()
    expect(twee.summary.inserted).toBe(0)
    expect(twee.summary.alBekend).toBe(2)
    expect(rijen.map(({ bron_fragment, inhoud_hash, published_at }) => ({ bron_fragment, inhoud_hash, published_at }))).toEqual(
      voor.map(({ bron_fragment, inhoud_hash, published_at }) => ({ bron_fragment, inhoud_hash, published_at })),
    )
  })

  it('cap: van 30 kandidaten worden er 24 opgehaald; 6 zijn uitgesteld en NIET geschreven', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS, CBS2], webSources: [] })
    vi.mocked(fetchRssFeed).mockImplementation(async (f) => ({
      items: Array.from({ length: 15 }, (_, i) => item(i, f.url === CBS2.url ? CBS2 : CBS)),
      oorzaak: 'ok',
      afgekapt: 0,
      geweigerd: 0,
    }))
    const { client, rijen } = maakClient()
    const { summary, health } = await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).toHaveBeenCalledTimes(MAX_DETAILS_PER_RUN)
    expect(summary.details.uitgesteld).toBe(6)
    expect(summary.uitgesteld).toBe(6)
    expect(rijen).toHaveLength(24)
    // Om-en-om: elke feed levert er 12, niet de eerste 24 van één feed.
    expect(health.sources.map((s) => s.detailGelezen)).toEqual([12, 12])
    expect(health.sources.map((s) => s.detailUitgesteld)).toEqual([3, 3])
  })

  it('tijdbudget: na het budget start geen fetch meer; het restant is uitgesteld', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [1, 2, 3, 4, 5].map((n) => item(n)), oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    let tijd = 0
    vi.mocked(fetchDetailPagina).mockImplementation(async () => { tijd += 10_000; return gelezen })
    const { client, rijen } = maakClient()
    const { summary } = await runNewsIngest(client as never, null, { now: NU, klok: () => tijd, detailTijdBudgetMs: 25_000 })
    expect(fetchDetailPagina).toHaveBeenCalledTimes(3)
    expect(summary.details).toMatchObject({ gelezen: 3, uitgesteld: 2 })
    expect(rijen).toHaveLength(3)
  })

  it('één verzoek per seconde per host: de tussenruimte zit tussen fetches, niet ervoor', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [1, 2, 3].map((n) => item(n)), oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const wacht = vi.fn(async () => {})
    const { client } = maakClient()
    await runNewsIngest(client as never, null, { now: NU, wacht })
    expect(wacht.mock.calls).toEqual([[DETAIL_TUSSENRUIMTE_MS], [DETAIL_TUSSENRUIMTE_MS]])
  })

  it('bronnen buiten DETAIL_HOSTS: geen fetch, en bron_detail gaat niet mee in de upsert', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [FEED], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: FEED_ITEMS, oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).not.toHaveBeenCalled()
    expect(rijen.length).toBeGreaterThan(0)
    expect(rijen.every((r) => !('bron_detail' in r))).toBe(true)
  })

  it('vóór de migratie (PGRST204) schrijft de ingest de rij alsnog, zonder bron_detail', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [item(1)], oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const { client, rijen } = maakClient({ zonderBronDetailKolom: true })
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.inserted).toBe(1)
    expect(summary.skipped).toBe(0)
    expect(rijen[0]).toMatchObject({ bron_fragment: ARTIKEL })
    expect('bron_detail' in rijen[0]).toBe(false)
  })

  it('de inhoud-hash van een feed-item: kop + beschrijving, of kop + link als de beschrijving leeg is', () => {
    const RUN = NU.toISOString()
    const met = rssKandidaat({ ...item(1), description: 'Inflatie 2,3 procent' }, CBS.url, RUN)
    expect(met.inhoud_hash).toBe(inhoudHash(`${item(1).title}\nInflatie 2,3 procent`))
    // Dezelfde kop een maand later, nieuwe URL, geen beschrijving: géén dubbel meer.
    const jan = rssKandidaat({ ...item(1), link: 'https://www.cbs.nl/nl-nl/nieuws/2026/05/werkloosheid' }, CBS.url, RUN)
    const feb = rssKandidaat({ ...item(1), link: 'https://www.cbs.nl/nl-nl/nieuws/2026/09/werkloosheid' }, CBS.url, RUN)
    expect(jan.inhoud_hash).not.toBe(feb.inhoud_hash)
  })

  it('de categorisatie krijgt hoogstens CATEGORISATIE_FRAGMENT_MAX_TEKENS per artikel', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [CBS], webSources: [] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [item(1)], oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    const { client } = maakClient()
    await runNewsIngest(client as never, MODEL, { now: NU })
    const invoer = vi.mocked(categorizeArticles).mock.calls[0][0]
    expect(invoer[0].summary.length).toBe(CATEGORISATIE_FRAGMENT_MAX_TEKENS)
  })
})

describe('runNewsIngest — backfill per rij, zonder DUIDING_VERSIE-bump', () => {
  const bestaand = (id: string, extra: Record<string, unknown>) => ({
    id,
    source_url: `https://www.cbs.nl/nl-nl/nieuws/2026/38/${id}`,
    bron_pagina_url: 'https://www.cbs.nl/nl-nl/rss-feeds/prijzen',
    bron_soort: 'rss',
    bron_fragment: null,
    published_bron: 'feed',
    duiding_status: 'geduid',
    duiding_pogingen: 1,
    duiding: { oud: true },
    duiding_versie: 3,
    ...extra,
  })

  beforeEach(() => {
    vi.mocked(fetchDetailPagina).mockReset()
    vi.mocked(fetchDetailPagina).mockResolvedValue({ uitkomst: 'gelezen', tekst: 'Nieuwe artikeltekst met 2,3 procent.', datums: { gepubliceerd: null, gewijzigd: null } })
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [] })
  })

  it('zet de artikeltekst en precies die rij terug op wacht; teruggetrokken en al geprobeerde rijen blijven onaangeroerd', async () => {
    const { client, rijen, stappen } = maakClient()
    rijen.push(
      bestaand('a', {}),
      bestaand('b', { duiding_status: 'teruggetrokken' }),
      bestaand('c', { bron_detail: 'terugval' }),
      // Past op het prefixfilter, niet op de volledige toets (doorstuurvorm): gemarkeerd, niet opgehaald.
      bestaand('d', { source_url: 'https://www.cpb.nl/uit?url=https://kwaadaardig.nl', bron_pagina_url: 'https://www.cpb.nl/publicaties', bron_soort: 'web_lijst' }),
    )
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).toHaveBeenCalledTimes(1)
    expect(summary.backfill).toEqual({ gelezen: 1, terugval: 1, geenHtml: 0, herduid: 1, uitgesteld: 0, fout: 0 })
    expect(rijen[0]).toMatchObject({
      bron_fragment: 'Nieuwe artikeltekst met 2,3 procent.',
      bron_detail: 'gelezen',
      duiding_status: 'wacht',
      duiding_pogingen: 0,
      duiding: null,
      duiding_versie: null,
    })
    expect(rijen[1]).toMatchObject({ duiding_status: 'teruggetrokken', bron_fragment: null })
    expect(rijen[2]).toMatchObject({ bron_detail: 'terugval', duiding_status: 'geduid' })
    expect(rijen[3]).toMatchObject({ bron_detail: 'terugval', duiding_status: 'geduid', bron_fragment: null })
    // De lezing is expliciet begrensd en geordend, en filtert op de hostlijst.
    const lezing = stappen.find((q) => q.stappen.some((s) => s.m === 'or'))!
    expect(lezing.stappen).toEqual(expect.arrayContaining([
      { m: 'or', args: [backfillUrlFilter()] },
      { m: 'is', args: ['bron_detail', null] },
      { m: 'neq', args: ['duiding_status', 'teruggetrokken'] },
      { m: 'order', args: ['fetched_at', { ascending: false }] },
      { m: 'limit', args: [MAX_BACKFILL_PER_RUN] },
    ]))
  })

  it('twee keer draaien: de tweede run raakt 0 rijen', async () => {
    const { client, rijen } = maakClient()
    rijen.push(bestaand('a', {}))
    await runNewsIngest(client as never, null, { now: NU })
    vi.mocked(fetchDetailPagina).mockClear()
    const twee = await runNewsIngest(client as never, null, { now: NU })
    expect(fetchDetailPagina).not.toHaveBeenCalled()
    expect(twee.summary.backfill).toEqual({ gelezen: 0, terugval: 0, geenHtml: 0, herduid: 0, uitgesteld: 0, fout: 0 })
  })

  it('buiten het tijdbudget: geteld als uitgesteld, de rij blijft null en komt terug', async () => {
    const { client, rijen } = maakClient()
    rijen.push(bestaand('a', {}), bestaand('b', {}), bestaand('c', {}))
    let tijd = 0
    vi.mocked(fetchDetailPagina).mockImplementation(async () => {
      tijd += 20_000
      return { uitkomst: 'gelezen', tekst: 'Tekst met 2,3 procent.', datums: { gepubliceerd: null, gewijzigd: null } }
    })
    const { summary } = await runNewsIngest(client as never, null, { now: NU, klok: () => tijd, detailTijdBudgetMs: 25_000 })
    expect(summary.backfill).toMatchObject({ gelezen: 2, uitgesteld: 1 })
    expect(rijen[2].bron_detail ?? null).toBeNull()
  })

  it('terugval en geen_html markeren de rij zonder de duiding te resetten', async () => {
    const { client, rijen } = maakClient()
    rijen.push(bestaand('a', {}), bestaand('b', {}))
    vi.mocked(fetchDetailPagina).mockResolvedValueOnce({ uitkomst: 'terugval', oorzaak: 'timeout' }).mockResolvedValueOnce({ uitkomst: 'geen_html' })
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.backfill).toEqual({ gelezen: 0, terugval: 1, geenHtml: 1, herduid: 0, uitgesteld: 0, fout: 0 })
    expect(rijen.map((r) => [r.bron_detail, r.duiding_status])).toEqual([['terugval', 'geduid'], ['geen_html', 'geduid']])
  })
})

describe('bepaalIngestUitkomst — trigger 4: detailpagina\'s', () => {
  const summary = (details: Partial<IngestSummary['details']>, backfill: Partial<IngestSummary['backfill']> = {}): IngestSummary => ({
    sourcesChecked: 1, rssArticlesFound: 3, webArticlesExtracted: 0, perSoort: { rss: 3, web_lijst: 0, web_pagina: 0 },
    duplicatesSkipped: 0, alBekend: 0, inserted: 3, skipped: 0, uitgesteld: 0, linksGeweigerd: 0,
    details: { gelezen: 0, terugval: 0, geenHtml: 0, uitgesteld: 0, ...details },
    backfill: { gelezen: 0, terugval: 0, geenHtml: 0, herduid: 0, uitgesteld: 0, fout: 0, ...backfill },
    duiding: { geduid: 1, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 },
  })
  const health: SourceHealth = { checkedAt: NU.toISOString(), sources: [{ label: 'CBS', url: 'https://www.cbs.nl/x', soort: 'rss', type: 'rss', items: 3, nieuw: 3, oorzaak: 'ok' }] }

  it('0 van N gelezen → partial, met de telling in de regel', () => {
    expect(bepaalIngestUitkomst(summary({ terugval: 3 }), health)).toEqual({ status: 'partial', verlies: ["detailpagina's: 0 van 3 gelezen (terugval 3)"] })
    expect(bepaalIngestUitkomst(summary({}, { terugval: 2 }), health).status).toBe('partial')
  })
  it('één gelezen naast terugvallen, alleen geen_html, of alleen uitgesteld → success', () => {
    expect(bepaalIngestUitkomst(summary({ gelezen: 1, terugval: 2 }), health).status).toBe('success')
    expect(bepaalIngestUitkomst(summary({}, { gelezen: 1, terugval: 4 }), health).status).toBe('success')
    expect(bepaalIngestUitkomst(summary({ geenHtml: 3 }), health).status).toBe('success')
    expect(bepaalIngestUitkomst(summary({ uitgesteld: 5 }), health).status).toBe('success')
  })
})

// ── ADR 0191: redactieregels bij de ingest ─────────────────────────────────

describe('runNewsIngest — regel 1: basis of gewijzigd, vastgelegd bij de ingest (ADR 0191)', () => {
  it('eerste run: elke sectie van een nieuwe pagina is basis; rss en lijst krijgen geen status', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    const { summary, health } = await runNewsIngest(client as never, null, { now: NU })
    const secties = rijen.filter((r) => r.bron_soort === 'web_pagina')
    expect(secties).toHaveLength(2)
    expect(secties.every((r) => r.bron_wijziging === 'basis')).toBe(true)
    expect(rijen.filter((r) => r.bron_soort !== 'web_pagina').every((r) => !('bron_wijziging' in r))).toBe(true)
    expect(summary.wijziging).toEqual({ basis: 2, gewijzigd: 0 })
    expect(health.sources.find((s) => s.url === PAGINA.url)).toMatchObject({ basis: 2, nieuw: 2 })
  })

  it('een gewijzigde sectie op een bekende pagina is gewijzigd; een derde, gelijke run verandert niets', async () => {
    zetBronnen()
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    const gewijzigdeHtml = PAGINA_HTML.replace('1 januari 2028', '1 januari 2029')
    vi.mocked(fetchWebPage).mockImplementation(async (s) =>
      s.url === LIJST.url ? { ok: true, html: LIJST_HTML, finalUrl: LIJST.url } : { ok: true, html: gewijzigdeHtml, finalUrl: PAGINA.url },
    )
    const twee = await runNewsIngest(client as never, null, { now: new Date('2026-09-23T05:25:00.000Z') })
    expect(twee.summary.inserted).toBe(1)
    expect(twee.summary.wijziging).toEqual({ basis: 0, gewijzigd: 1 })
    const nieuw = rijen[rijen.length - 1]
    expect(nieuw).toMatchObject({ bron_soort: 'web_pagina', bron_wijziging: 'gewijzigd' })
    // De eerste rijen houden hun status: de upsert raakt een bestaande rij nooit.
    expect(rijen.filter((r) => r.bron_wijziging === 'basis')).toHaveLength(2)

    const status = rijen.map((r) => `${r.source_url}|${String(r.bron_wijziging)}`)
    const drie = await runNewsIngest(client as never, null, { now: new Date('2026-09-24T05:25:00.000Z') })
    expect(drie.summary.inserted).toBe(0)
    expect(drie.summary.wijziging).toEqual({ basis: 0, gewijzigd: 0 })
    expect(rijen.map((r) => `${r.source_url}|${String(r.bron_wijziging)}`)).toEqual(status)
  })

  it('mislukt de paginacontrole, dan raden we niet: de secties gaan deze run niet de tabel in en komen later als basis', async () => {
    zetBronnen()
    const fout = maakClient({ paginaLeesFout: true })
    const een = await runNewsIngest(fout.client as never, null, { now: NU })
    expect(fout.rijen.filter((r) => r.bron_soort === 'web_pagina')).toHaveLength(0)
    expect(fout.rijen.filter((r) => r.bron_soort !== 'web_pagina')).toHaveLength(3)
    expect(een.summary.uitgesteld).toBe(2)

    // Dezelfde tabel, nu zonder fout: de pagina is nog steeds onbekend, dus basis.
    const goed = maakClient()
    goed.rijen.push(...fout.rijen)
    await runNewsIngest(goed.client as never, null, { now: new Date('2026-09-23T05:25:00.000Z') })
    expect(goed.rijen.filter((r) => r.bron_soort === 'web_pagina').map((r) => r.bron_wijziging)).toEqual(['basis', 'basis'])
  })

  it('de eerste waarneming van een pagina wordt afgemaakt: basissecties buiten het budget komen zonder rubriek mee', async () => {
    const FEED_VEEL = { url: 'https://www.ecb.europa.eu/rss/press.html', label: 'ECB' }
    const items = Array.from({ length: 35 }, (_, n) => ({
      title: `Feedbericht nummer ${n}`,
      description: `Beschrijving van bericht ${n}`,
      link: `https://www.ecb.europa.eu/press/${n}.html`,
      publishedAt: '2026-09-20T10:00:00.000Z',
      sourceName: FEED_VEEL.label,
    }))
    const secties = Array.from(
      { length: 12 },
      (_, n) => `<h2>Onderdeel ${n} van de regeling</h2><p>Dit onderdeel ${n} beschrijft de stand van de regeling zoals die op deze uitlegpagina staat, zonder wijziging.</p>`,
    ).join('')
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [FEED_VEEL], webSources: [PAGINA] })
    vi.mocked(fetchRssFeed).mockResolvedValue({ items, oorzaak: 'ok', afgekapt: 0, geweigerd: 0 })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: `<main><h1>Regeling</h1>${secties}</main>`, finalUrl: PAGINA.url })
    const { client, rijen } = maakClient()
    // Budget 0 en een stilstaande klok: alleen het eerste brok (20 van 47) loopt.
    const { summary } = await runNewsIngest(client as never, MODEL, { now: NU, categorisatieTijdBudgetMs: 0, klok: () => 1_000 })
    const basis = rijen.filter((r) => r.bron_soort === 'web_pagina')
    expect(basis).toHaveLength(12)
    expect(basis.every((r) => r.bron_wijziging === 'basis')).toBe(true)
    // Het eerste brok is gecategoriseerd; de afronding niet (geen modelcall).
    expect(categorizeArticles).toHaveBeenCalledTimes(1)
    expect(basis.filter((r) => r.category === null)).toHaveLength(2)
    expect(summary.uitgesteld).toBe(47 - 20 - 2)
    expect(summary.inserted).toBe(22)
  })

  it('vóór migratie 20261009120000 (PGRST204): de sectie komt er alsnog, zonder status', async () => {
    zetBronnen()
    const { client, rijen } = maakClient({ zonderWijzigingKolom: true })
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.skipped).toBe(0)
    const secties = rijen.filter((r) => r.bron_soort === 'web_pagina')
    expect(secties).toHaveLength(2)
    expect(secties.every((r) => !('bron_wijziging' in r))).toBe(true)
  })
})

describe('runNewsIngest — regel 3: de datum bij de kop (ADR 0191)', () => {
  const AFM = { url: 'https://www.afm.nl/nl-nl/sector/actueel', label: 'AFM — Sector actueel', soort: 'web_lijst' as const }
  const AFM_LIJST = `<main><ul><li><a href="/nl-nl/sector/actueel/2026/aug/klachten-verzekeraars">2025: minder klachten bij verzekeraars</a></li></ul></main>`
  const TEKST = '2025: minder klachten bij verzekeraars\nNieuws 24/08/26\n\n2025: minder klachten bij verzekeraars\nHet aantal klachten daalde in 2025.'
  const RUN = '2026-09-22T05:25:00.000Z'
  const lijstRij = () => webLijstKandidaat({ url: 'https://www.afm.nl/nl-nl/sector/actueel/2026/aug/x', tekst: 'Kop van het bericht', fragment: 'Kop van het bericht' }, AFM, RUN)

  beforeEach(() => {
    vi.mocked(fetchDetailPagina).mockReset()
  })

  it('pasDetailToe: metadata gaat voor, dan de datum bij de kop (pagina), anders blijft eerste_gezien', () => {
    const rij = lijstRij()
    const zonderMeta = { uitkomst: 'gelezen' as const, tekst: TEKST, datums: { gepubliceerd: null, gewijzigd: null } }
    expect(pasDetailToe(rij, zonderMeta, RUN)).toMatchObject({ published_bron: 'pagina', published_at: '2026-08-24T00:00:00.000Z' })
    const metMeta = { ...zonderMeta, datums: { gepubliceerd: '2026-08-25T10:00:00.000Z', gewijzigd: null } }
    expect(pasDetailToe(rij, metMeta, RUN)).toMatchObject({ published_bron: 'meta', published_at: '2026-08-25T10:00:00.000Z' })
    const zonderDatum = { ...zonderMeta, tekst: 'Kop\nGeen datum hier.' }
    expect(pasDetailToe(rij, zonderDatum, RUN)).toMatchObject({ published_bron: 'eerste_gezien', published_at: RUN })
    // Een feeddatum wint altijd.
    const feed = { ...rij, published_bron: 'feed' as const, published_at: '2026-08-01T00:00:00.000Z' }
    expect(pasDetailToe(feed, zonderMeta, RUN)).toMatchObject({ published_bron: 'feed', published_at: '2026-08-01T00:00:00.000Z' })
  })

  it('een nieuw AFM-item krijgt de datum uit de pagina, niet de ophaaldag', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [AFM] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: AFM_LIJST, finalUrl: AFM.url })
    vi.mocked(fetchDetailPagina).mockResolvedValue({ uitkomst: 'gelezen', tekst: TEKST, datums: { gepubliceerd: null, gewijzigd: null } })
    const { client, rijen } = maakClient()
    await runNewsIngest(client as never, null, { now: NU })
    expect(rijen).toHaveLength(1)
    expect(rijen[0]).toMatchObject({ published_bron: 'pagina', published_at: '2026-08-24T00:00:00.000Z', bron_detail: 'gelezen' })
  })

  it('de backfill van een bestaande rij doet hetzelfde', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [] })
    vi.mocked(fetchDetailPagina).mockResolvedValue({ uitkomst: 'gelezen', tekst: TEKST, datums: { gepubliceerd: null, gewijzigd: null } })
    const { client, rijen } = maakClient()
    rijen.push({
      id: 'afm-1',
      source_url: 'https://www.afm.nl/nl-nl/sector/actueel/2026/aug/klachten-verzekeraars',
      bron_pagina_url: AFM.url,
      bron_soort: 'web_lijst',
      published_bron: 'eerste_gezien',
      published_at: '2026-09-22T05:25:00.000Z',
      duiding_status: 'geduid',
    })
    await runNewsIngest(client as never, null, { now: NU })
    expect(rijen[0]).toMatchObject({ published_bron: 'pagina', published_at: '2026-08-24T00:00:00.000Z', bron_detail: 'gelezen' })
  })

  it('vóór de migratie (23514 op de CHECK): de rij komt er als eerste_gezien, niet weg', async () => {
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [AFM] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: AFM_LIJST, finalUrl: AFM.url })
    vi.mocked(fetchDetailPagina).mockResolvedValue({ uitkomst: 'gelezen', tekst: TEKST, datums: { gepubliceerd: null, gewijzigd: null } })
    const { client, rijen } = maakClient({ zonderWijzigingKolom: true })
    const { summary } = await runNewsIngest(client as never, null, { now: NU })
    expect(summary.skipped).toBe(0)
    expect(rijen[0]).toMatchObject({ published_bron: 'eerste_gezien', published_at: NU.toISOString() })
  })
})

describe('runNewsIngest — regel 4: een ministeriepagina levert alleen artikel-links (ADR 0191)', () => {
  const FIN = { url: 'https://www.rijksoverheid.nl/ministeries/ministerie-van-financien', label: 'Rijksoverheid — Ministerie van Financiën', soort: 'web_lijst' as const }
  const HTML = `<main><ol>
<li><a href="/themas/overheid-en-democratie/prinsjesdag"><h3>Prinsjesdag in het kort</h3><p>15 september 2026 was Prinsjesdag.</p></a></li>
<li><a href="/actueel/nieuws/2026/09/25/kabinet-en-private-financierders"><h3>Kabinet en private financierders geven startschot</h3><p>Teaser.</p><span>25-09-2026</span></a></li>
<li><a href="/regering/bewindspersonen/eelco-heinen"><h3>Eelco Heinen</h3><p>Minister van Financiën Lees verder</p></a></li>
<li><a href="/actueel/nieuws/2026/09/18/steeds-meer-ouders-ronden-hun-aanvullende-schade-af"><h3>Steeds meer ouders ronden hun schade af</h3></a></li>
</ol></main>`

  it('zonder model neemt de terugval alleen nieuws- en documentlinks, met de kaartkop als kop', async () => {
    vi.mocked(fetchDetailPagina).mockClear()
    vi.mocked(loadNewsSources).mockResolvedValue({ rssFeeds: [], webSources: [FIN] })
    vi.mocked(fetchWebPage).mockResolvedValue({ ok: true, html: HTML, finalUrl: FIN.url })
    const { client, rijen } = maakClient()
    const { health } = await runNewsIngest(client as never, null, { now: NU })
    expect(rijen.map((r) => new URL(r.source_url).pathname)).toEqual([
      '/actueel/nieuws/2026/09/25/kabinet-en-private-financierders',
      '/actueel/nieuws/2026/09/18/steeds-meer-ouders-ronden-hun-aanvullende-schade-af',
    ])
    expect(rijen.map((r) => r.bron_kop)).toEqual(['Kabinet en private financierders geven startschot', 'Steeds meer ouders ronden hun schade af'])
    // Zichtbare terugkoppeling: de bron verschijnt met zijn oorzaak en telling.
    expect(health.sources[0]).toMatchObject({ label: FIN.label, soort: 'web_lijst', items: 2, nieuw: 2, oorzaak: 'terugval_geen_model' })
    // En de artikelpagina's staan in DETAIL_HOSTS: de server haalt ze op.
    expect(fetchDetailPagina).toHaveBeenCalledTimes(2)
  })
})
