// ── News Ingest — gedeelde pipeline voor handmatige én cron-ingestie ──
//
// Eén implementatie voor /api/admin/news-ingest (handmatig) en
// /api/news-ingest/cron (dagelijks), zodat gedrag nooit kan driften. Eén
// ingest voor beide edities (B25): de LLM-editie en de Krant lezen dezelfde
// rijen.
//
// Wat een artikel is, bepaalt de SERVER (ADR 0176 · B24). Elke bron heeft een
// vaste bronsoort:
//   - rss         → elk feed-item; sleutel = de feed-link; datum = pubDate mét tijd.
//   - web_lijst   → de links op de pagina (server-gelezen `href`s); het model
//                   kiest alleen WELKE (een index), nooit de URL. Sleutel = die
//                   href; kop = de linktekst.
//   - web_pagina  → de secties van de pagina (server-geknipt op h1–h3);
//                   sleutel = pagina + hash van de sectietekst. Een ongewijzigde
//                   pagina geeft dus dezelfde sleutels en géén nieuwe rijen.
// Modeltekst is nooit sleutel, kop, datum of grondslag: `title` = `bron_kop`,
// `raw_content` = `bron_fragment` (de eigen brontekst), `published_at` komt
// uit de feed of de paginametadata (anders het moment van eerste zien).
//
// Stappen:
// 1. Ophalen per bron, met een OORZAAK per bron (ok · leeg · http_fout · dns …)
// 2. Kandidaten bouwen per bronsoort (hierboven)
// 3. Ontdubbelen: binnen de batch op sleutel én op exacte inhoud-hash, daarna
//    tegen de bestaande rijen (sleutel en inhoud-hash). Alleen wat écht nieuw
//    is gaat naar de categorisatie — geen modelcall voor wat we al hebben.
//    Wat al bekend is, krijgt `laatst_gezien_at` = nu.
// 4+5. Per brok van 20: categorisatie (optioneel model) en METEEN de upsert
//    met `onConflict: 'source_url'` (= de unieke index), `ignoreDuplicates`
//    + `.select('id')`: `inserted` telt de rijen die de database TERUGGAF, niet
//    de aanroepen (vóór ADR 0176 telde een no-op mee). Tijdbudget: na
//    `CATEGORISATIE_TIJDBUDGET_MS` start geen nieuw brok; het restant komt de
//    volgende run (`uitgesteld`).
// 6. Bewaren op tijd: weg wat ARTICLE_RETENTION_DAYS niet meer gezien is
//    (`laatst_gezien_at`), geen grens op aantal (ADR 0171)
// 7. Per-bron gezondheid naar app_settings (key: news_source_health)
// 8. Duidingsstap (Krant, ADR 0171) — faalt NOOIT de ingest. Sinds 1F fase 2
//    krijgt die stap geen tekst uit deze run mee: elke rij duidt op haar eigen
//    `bron_kop` + `bron_fragment`.
//
// Privacy: de summary en de gezondheid bevatten alleen tellingen, bronlabels
// en bron-URL's uit de configuratie — nooit artikeltekst.

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadNewsSources,
  fetchRssFeed,
  fetchWebPage,
  type BronOorzaak,
  type BronSoort,
  type SourceArticle,
} from '@/lib/news-sources'
import { extractBronDatums, extractLinks, extractSecties, knipTekens, kopUitLinktekst, normaliseerInhoud } from '@/lib/news-html'
import { kiesArtikelLinks, categorizeArticles } from '@/lib/news-enrich'
import {
  duidWachtendeArtikelen,
  LEGE_DUIDING_SUMMARY,
  type DuidingSummary,
} from '@/lib/krant/duiding'

/** Bewaartermijn van de artikelbak. Het editievenster (30 dagen) valt hier ruim binnen. */
export const ARTICLE_RETENTION_DAYS = 120
/** Secties per themapagina per run (expliciete cap; de rest staat als `afgekapt` in de gezondheid). */
export const MAX_SECTIES_PER_PAGINA = 12
/** Links die het model per lijstpagina te zien krijgt (expliciete cap; de rest staat als `afgekapt`). */
export const MAX_LINKS_AANBOD = 120
/** Grens op het bewaarde bronfragment (= de grondslag voor de duiding in fase 2). */
export const BRON_FRAGMENT_MAX_TEKENS = 8_000
/** Grens op de bronkop (= CHECK in de migratie); een kaarttekst kan langer zijn dan een kop. */
export const BRON_KOP_MAX_TEKENS = 300
/**
 * Brokgrootte voor `.in(...)`-lezingen: ruim onder PostgREST's max_rows (dus
 * nooit een stille afkap — elke waarde is uniek of zeldzaam) en klein genoeg
 * dat de query-string met URL's van ~150 tekens onder ~8 kB blijft.
 */
const IN_BROK = 40
/** Artikelen per categorisatie-call (en per schrijfbrok). */
const CATEGORISATIE_BROK = 20
/** Gelijktijdige categorisatie-calls; meer raakt rate-limits. */
const CATEGORISATIE_PARALLEL = 2
/**
 * Tijdbudget voor categoriseren + schrijven. De cron en de beheerknop hebben
 * `maxDuration` 300 s; ophalen kost ~30 s en de duidingsstap krijgt daarna
 * zijn eigen budget (150 s cron). Na dit budget start geen nieuw brok; het
 * restant komt de volgende run.
 */
export const CATEGORISATIE_TIJDBUDGET_MS = 75_000

// ── Types ────────────────────────────────────────────────────────────

export interface IngestSummary {
  sourcesChecked: number
  rssArticlesFound: number
  /** Kandidaten uit webbronnen (lijst + pagina) in deze run. */
  webArticlesExtracted: number
  /** Kandidaten per bronsoort in deze run. */
  perSoort: Record<BronSoort, number>
  /** Binnen de batch dubbel (zelfde sleutel of exact dezelfde inhoud), of dezelfde inhoud als een bestaande rij. */
  duplicatesSkipped: number
  /** Sleutel bestond al in de tabel — de verwachte uitkomst bij een tweede run. */
  alBekend: number
  /** Rijen die de database bij de upsert werkelijk teruggaf. */
  inserted: number
  /** Schrijffout per rij. */
  skipped: number
  /** Nieuw, maar buiten het tijdbudget niet geschreven — komt de volgende run. */
  uitgesteld: number
  /** Linknummers van het model die niet in de aangeboden lijst stonden. */
  linksGeweigerd: number
  /** Uitkomst van de duidingsstap (zichtbaar in job_runs en op de beheerpagina). */
  duiding: DuidingSummary
}

export interface IngestOpties {
  /** Model voor de duidingsstap (`getModel(service, 'nieuws_duiding')`); null = alleen wachtrij tellen. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  duidingModel?: any | null
  /** Batch-cap van de duidingsstap in deze run. */
  duidingMaxPerRun?: number
  /** Tijdbudget van de duidingsstap (ms); daarna pakt geen werker een nieuwe rij. */
  duidingTijdBudgetMs?: number
  /** Tijdstip van de run (test-injectie). */
  now?: Date
  /** Budget voor categoriseren + schrijven (ms); standaard `CATEGORISATIE_TIJDBUDGET_MS`. */
  categorisatieTijdBudgetMs?: number
  /** Klok voor het tijdbudget (test-injectie). */
  klok?: () => number
}

export interface SourceHealthEntry {
  label: string
  url: string
  /** Vast bronsoort (ADR 0176). */
  soort: BronSoort
  /** Oude tweedeling, voor rijen van vóór ADR 0176 en eenvoudige filters. */
  type: 'rss' | 'web'
  /** Kandidaten die deze bron in deze run leverde. */
  items: number
  /** Daarvan werkelijk nieuw geschreven. */
  nieuw: number
  oorzaak: BronOorzaak
  httpStatus?: number
  /** Items boven een expliciete cap (feed-items, secties of links). */
  afgekapt?: number
  /** Linknummers van het model die niet op de pagina stonden. */
  geweigerd?: number
  /** Alleen nog op gezondheid van vóór ADR 0176. */
  error?: string
}

export interface SourceHealth {
  checkedAt: string
  sources: SourceHealthEntry[]
}

/** Een rij voor `news_articles`, plus de index van de bron in `health` (niet persistent). */
interface ArticleCandidate {
  title: string
  summary: string | null
  source_url: string
  source_name: string
  category: string | null
  potential_impact: string | null
  published_at: string
  raw_content: string | null
  bron_soort: BronSoort
  bron_pagina_url: string
  inhoud_hash: string
  published_bron: 'feed' | 'meta' | 'eerste_gezien'
  bron_kop: string
  bron_fragment: string | null
}

type Kandidaat = { rij: ArticleCandidate; bron: number }

// ── Sleutels (server-bepaald) ────────────────────────────────────────

/** sha256 van de genormaliseerde tekst: de inhoud-identiteit van een fragment. */
export function inhoudHash(tekst: string): string {
  return createHash('sha256').update(normaliseerInhoud(tekst), 'utf8').digest('hex')
}

/**
 * De artikel-URL van een sectie van een `web_pagina`: de pagina + een
 * anker met de sectiehash. De link landt op de juiste pagina; dezelfde sectie
 * geeft dezelfde URL, dus de unieke index op `source_url` ontdubbelt. Vervangt
 * `ensureUniqueArticleUrl`, dat de hash van de MODELKOP nam.
 */
export function sectieArtikelUrl(paginaUrl: string, hash: string): string {
  return `${paginaUrl.split('#')[0]}#tf-s-${hash.slice(0, 16)}`
}

// ── Kandidaten per bronsoort (puur, getest) ──────────────────────────

export function rssKandidaat(
  item: { title: string; description: string | null; link: string; publishedAt: string | null; sourceName: string },
  feedUrl: string,
  runMoment: string,
): ArticleCandidate {
  const fragment = item.description ? knipTekens(item.description, BRON_FRAGMENT_MAX_TEKENS) : null
  // Een feeddatum in de toekomst (tijdzonefout, vooruitgedateerd item) wordt
  // het run-moment: een artikel kan niet later verschijnen dan we het zagen.
  const gepubliceerd = item.publishedAt && item.publishedAt > runMoment ? runMoment : item.publishedAt
  return {
    title: knipTekens(item.title, BRON_KOP_MAX_TEKENS),
    summary: null,
    source_url: item.link,
    source_name: item.sourceName,
    category: null,
    potential_impact: null,
    published_at: gepubliceerd ?? runMoment,
    raw_content: fragment,
    bron_soort: 'rss',
    bron_pagina_url: feedUrl,
    inhoud_hash: inhoudHash(`${item.title}\n${item.description ?? ''}`),
    published_bron: gepubliceerd ? 'feed' : 'eerste_gezien',
    bron_kop: knipTekens(item.title, BRON_KOP_MAX_TEKENS),
    bron_fragment: fragment,
  }
}

export function webPaginaKandidaten(
  html: string,
  source: { url: string; label: string },
  runMoment: string,
): { kandidaten: ArticleCandidate[]; afgekapt: number } {
  const { secties, afgekapt } = extractSecties(html, MAX_SECTIES_PER_PAGINA)
  const datums = extractBronDatums(html)
  const metaDatum = datums.gewijzigd ?? datums.gepubliceerd
  const kandidaten = secties.map((s): ArticleCandidate => {
    const hash = inhoudHash(`${s.kop}\n${s.tekst}`)
    const fragment = knipTekens(s.tekst, BRON_FRAGMENT_MAX_TEKENS)
    return {
      title: knipTekens(s.kop, BRON_KOP_MAX_TEKENS),
      summary: null,
      source_url: sectieArtikelUrl(source.url, hash),
      source_name: source.label,
      category: null,
      potential_impact: null,
      published_at: metaDatum ?? runMoment,
      raw_content: fragment,
      bron_soort: 'web_pagina',
      bron_pagina_url: source.url,
      inhoud_hash: hash,
      published_bron: metaDatum ? 'meta' : 'eerste_gezien',
      bron_kop: knipTekens(s.kop, BRON_KOP_MAX_TEKENS),
      bron_fragment: fragment,
    }
  })
  return { kandidaten, afgekapt }
}

export function webLijstKandidaat(
  link: { url: string; tekst: string; fragment: string },
  source: { url: string; label: string },
  runMoment: string,
): ArticleCandidate {
  const fragment = knipTekens(link.fragment, BRON_FRAGMENT_MAX_TEKENS)
  const kop = knipTekens(kopUitLinktekst(link.tekst), BRON_KOP_MAX_TEKENS)
  return {
    title: kop,
    summary: null,
    source_url: link.url,
    source_name: source.label,
    category: null,
    potential_impact: null,
    // Een lijstregel draagt geen server-leesbare metadata; de detailpagina
    // ophalen (en zijn datePublished lezen) is 1F fase 3.
    published_at: runMoment,
    raw_content: fragment,
    bron_soort: 'web_lijst',
    bron_pagina_url: source.url,
    inhoud_hash: inhoudHash(`${link.tekst}\n${fragment}`),
    published_bron: 'eerste_gezien',
    bron_kop: kop,
    bron_fragment: fragment,
  }
}

/** Ontdubbel binnen de batch: eerste wint, op sleutel én op exacte inhoud. */
export function ontdubbelBatch<T extends { rij: { source_url: string; inhoud_hash: string } }>(
  kandidaten: readonly T[],
): { uniek: T[]; dubbel: number } {
  const urls = new Set<string>()
  const hashes = new Set<string>()
  const uniek: T[] = []
  let dubbel = 0
  for (const k of kandidaten) {
    if (urls.has(k.rij.source_url) || hashes.has(k.rij.inhoud_hash)) {
      dubbel++
      continue
    }
    urls.add(k.rij.source_url)
    hashes.add(k.rij.inhoud_hash)
    uniek.push(k)
  }
  return { uniek, dubbel }
}

// ── DB-lezingen en -markeringen in brokken ───────────────────────────

/** Zet `laatst_gezien_at` op de rijen met deze sleutel- of inhoudwaarden. Faalt zacht: bewaren is boekhouding. */
async function markeerGezien(
  supabase: SupabaseClient,
  kolom: 'source_url' | 'inhoud_hash',
  waarden: string[],
  moment: string,
): Promise<void> {
  for (let i = 0; i < waarden.length; i += IN_BROK) {
    const { error } = await supabase
      .from('news_articles')
      .update({ laatst_gezien_at: moment })
      .in(kolom, waarden.slice(i, i + IN_BROK))
    if (error) {
      console.error('[news-ingest] laatst_gezien_at bijwerken mislukt:', error.message)
      return
    }
  }
}

async function bestaandeWaarden(
  supabase: SupabaseClient,
  kolom: 'source_url' | 'inhoud_hash',
  waarden: string[],
): Promise<Set<string>> {
  const gevonden = new Set<string>()
  for (let i = 0; i < waarden.length; i += IN_BROK) {
    const brok = waarden.slice(i, i + IN_BROK)
    const { data, error } = await supabase.from('news_articles').select(kolom).in(kolom, brok)
    if (error) throw error
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const v = r[kolom]
      if (typeof v === 'string') gevonden.add(v)
    }
  }
  return gevonden
}

// ── Pipeline ─────────────────────────────────────────────────────────

export async function runNewsIngest(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any | null,
  opties: IngestOpties = {},
): Promise<{ summary: IngestSummary; health: SourceHealth }> {
  const sources = await loadNewsSources(supabase)
  const runMoment = (opties.now ?? new Date()).toISOString()
  const health: SourceHealthEntry[] = []
  const kandidaten: Kandidaat[] = []
  let linksGeweigerd = 0

  const gezond = (entry: Omit<SourceHealthEntry, 'nieuw' | 'type'>): number => {
    health.push({ ...entry, type: entry.soort === 'rss' ? 'rss' : 'web', nieuw: 0 })
    return health.length - 1
  }

  // ── RSS ────────────────────────────────────────────────────────
  const rssUitkomsten = await Promise.all(sources.rssFeeds.map((feed) => fetchRssFeed(feed)))
  sources.rssFeeds.forEach((feed, i) => {
    const u = rssUitkomsten[i]
    const bron = gezond({
      label: feed.label,
      url: feed.url,
      soort: 'rss',
      items: u.items.length,
      oorzaak: u.oorzaak,
      ...(u.httpStatus !== undefined ? { httpStatus: u.httpStatus } : {}),
      ...(u.afgekapt ? { afgekapt: u.afgekapt } : {}),
    })
    for (const item of u.items) kandidaten.push({ rij: rssKandidaat(item, feed.url, runMoment), bron })
  })

  // ── Web ────────────────────────────────────────────────────────
  const webUitkomsten = await Promise.all(sources.webSources.map((source) => fetchWebPage(source)))

  await Promise.all(
    sources.webSources.map(async (source, i) => {
      const u = webUitkomsten[i]
      if (!u.ok) {
        gezond({ label: source.label, url: source.url, soort: source.soort, items: 0, oorzaak: u.oorzaak, ...(u.httpStatus !== undefined ? { httpStatus: u.httpStatus } : {}) })
        return
      }
      if (source.soort === 'web_pagina') {
        const { kandidaten: secties, afgekapt } = webPaginaKandidaten(u.html, source, runMoment)
        const bron = gezond({
          label: source.label, url: source.url, soort: source.soort, items: secties.length,
          oorzaak: secties.length > 0 ? 'ok' : 'leeg', ...(afgekapt ? { afgekapt } : {}),
        })
        for (const rij of secties) kandidaten.push({ rij, bron })
        return
      }

      // web_lijst: de server leest de links, het model kiest er hooguit uit.
      // Relatieve hrefs lossen op tegen het eindadres (haalOp volgt alleen
      // redirects binnen dezelfde site); de "zelfde site"-grens is de
      // GECONFIGUREERDE bron-URL, zodat een redirect die grens niet verschuift.
      const { links, afgekapt } = extractLinks(u.html, u.finalUrl, MAX_LINKS_AANBOD, source.url)
      if (!model) {
        gezond({ label: source.label, url: source.url, soort: source.soort, items: 0, oorzaak: 'geen_model', ...(afgekapt ? { afgekapt } : {}) })
        return
      }
      const keuze = await kiesArtikelLinks(links, source, model)
      linksGeweigerd += keuze.geweigerd
      // De garantie dat er geen verzonnen URL binnenkomt, is de constructie:
      // het model geeft een index, de URL komt uit de door de server gelezen
      // lijst (`kiesArtikelLinks` weigert elke index buiten die lijst).
      const gekozen = keuze.indexen.map((idx) => links[idx])
      const totaalAfgekapt = afgekapt + keuze.afgekapt
      const bron = gezond({
        label: source.label, url: source.url, soort: source.soort, items: gekozen.length,
        oorzaak: !keuze.ok ? 'model_fout' : gekozen.length > 0 ? 'ok' : 'leeg',
        ...(totaalAfgekapt ? { afgekapt: totaalAfgekapt } : {}),
        ...(keuze.geweigerd ? { geweigerd: keuze.geweigerd } : {}),
      })
      for (const link of gekozen) kandidaten.push({ rij: webLijstKandidaat(link, source, runMoment), bron })
    }),
  )

  // ── Ontdubbelen: batch, dan tegen de tabel ─────────────────────
  // Twee voorcontroles, elk met een eigen terugval: faalt de sleutelcontrole,
  // dan is de unieke index de vangrail (de upsert telt "al bekend"); faalt
  // alleen de inhoudcontrole, dan blijft de sleutelcontrole gelden.
  const { uniek, dubbel: batchDubbel } = ontdubbelBatch(kandidaten)
  let duplicatesSkipped = batchDubbel
  let alBekend = 0
  let naUrl: Kandidaat[] = uniek
  let bekendeUrls = new Set<string>()
  try {
    bekendeUrls = await bestaandeWaarden(supabase, 'source_url', uniek.map((k) => k.rij.source_url))
    naUrl = uniek.filter((k) => !bekendeUrls.has(k.rij.source_url))
    alBekend = uniek.length - naUrl.length
  } catch (err) {
    console.error('[news-ingest] sleutelcontrole mislukt:', err instanceof Error ? err.message : err)
  }
  let nieuw: Kandidaat[] = naUrl
  let bekendeHashes = new Set<string>()
  try {
    bekendeHashes = await bestaandeWaarden(supabase, 'inhoud_hash', naUrl.map((k) => k.rij.inhoud_hash))
    nieuw = naUrl.filter((k) => !bekendeHashes.has(k.rij.inhoud_hash))
    duplicatesSkipped += naUrl.length - nieuw.length
  } catch (err) {
    console.error('[news-ingest] inhoudcontrole mislukt:', err instanceof Error ? err.message : err)
  }

  // ── Nog gezien: `laatst_gezien_at` bijwerken (bewaren volgt daarop) ─
  // Een sectie of link die nog op de bron staat, blijft staan zolang hij
  // gezien wordt — anders zou hij na de bewaartermijn gewist worden en als
  // "nieuw" terugkomen (release-review 1F, M2). Idempotent: dezelfde waarde
  // twee keer zetten verandert niets.
  await markeerGezien(supabase, 'source_url', [...bekendeUrls], runMoment)
  await markeerGezien(supabase, 'inhoud_hash', [...bekendeHashes], runMoment)

  // ── Categorisatie + upsert per brok, met tijdbudget ────────────
  // Per brok: categoriseren (optioneel model), dan METEEN schrijven. Zo legt
  // een run altijd iets vast, ook als de categorisatie traag is: na het budget
  // start geen nieuw brok meer, en wat overblijft staat niet in de tabel en
  // wordt de volgende run gewoon opnieuw opgepakt (sleutel = server, dus
  // idempotent). Het eerste brok loopt altijd, zodat ook een run met een krap
  // budget vooruitgang boekt (release-review 1F, H1).
  let inserted = 0
  let skipped = 0
  const brokken: Kandidaat[][] = []
  for (let i = 0; i < nieuw.length; i += CATEGORISATIE_BROK) brokken.push(nieuw.slice(i, i + CATEGORISATIE_BROK))
  const nu = opties.klok ?? (() => Date.now())
  const deadline = nu() + (opties.categorisatieTijdBudgetMs ?? CATEGORISATIE_TIJDBUDGET_MS)
  let volgende = 0
  let gestart = 0
  let uitgesteld = 0

  const verwerkBrok = async (brok: Kandidaat[]) => {
    if (model) {
      const invoer: SourceArticle[] = brok.map((k) => ({
        title: k.rij.bron_kop,
        summary: k.rij.bron_fragment ?? '',
        sourceName: k.rij.source_name,
      }))
      const map = await categorizeArticles(invoer, model)
      brok.forEach((k, j) => {
        const e = map.get(j)
        if (!e) return
        k.rij.category = e.category
        k.rij.summary = e.summary
        k.rij.potential_impact = e.potentialImpact
      })
    }
    for (const k of brok) {
      const { data, error } = await supabase
        .from('news_articles')
        .upsert({ ...k.rij, fetched_at: runMoment, laatst_gezien_at: runMoment }, { onConflict: 'source_url', ignoreDuplicates: true })
        .select('id')
      if (error) {
        skipped++
        continue
      }
      if ((data?.length ?? 0) > 0) {
        inserted++
        health[k.bron].nieuw++
      } else {
        // Conflict: een parallelle run schreef dezelfde sleutel net eerder.
        alBekend++
      }
    }
  }

  const werker = async () => {
    while (volgende < brokken.length) {
      if (gestart > 0 && nu() >= deadline) {
        for (let i = volgende; i < brokken.length; i++) uitgesteld += brokken[i].length
        volgende = brokken.length
        break
      }
      const brok = brokken[volgende++]
      gestart++
      await verwerkBrok(brok)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CATEGORISATIE_PARALLEL, brokken.length) }, werker))

  // ── Bewaren op tijd: niet meer gezien sinds ARTICLE_RETENTION_DAYS ─
  const retentionCutoff = new Date(runMoment)
  retentionCutoff.setDate(retentionCutoff.getDate() - ARTICLE_RETENTION_DAYS)
  await supabase
    .from('news_articles')
    .delete()
    .lt('laatst_gezien_at', retentionCutoff.toISOString())

  // ── Per-bron gezondheid opslaan (voor de beheerpagina) ─────────
  // Vóór de duidingsstap: wordt de run door maxDuration afgebroken, dan is
  // de brongezondheid al geschreven.
  const sourceHealth: SourceHealth = { checkedAt: runMoment, sources: health }
  try {
    await supabase.from('app_settings').upsert(
      {
        key: 'news_source_health',
        value: JSON.stringify(sourceHealth),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    // Gezondheid is informatief — mag de ingest nooit laten falen
  }

  // ── Duidingsstap (Krant, in de schaduw) ───────────────────────
  // Eigen model, eigen batch-cap en tijdbudget; zonder model alleen de
  // wachtrij tellen. `duidWachtendeArtikelen` werpt nooit — de ingest faalt
  // niet op de duiding. Sinds 1F fase 2 geeft de ingest GEEN tekst meer mee:
  // de duiding leest haar grondslag uit de eigen kolommen van elke rij
  // (`bron_kop` + `bron_fragment`), niet uit de paginatekst van deze run.
  let duiding: DuidingSummary = { ...LEGE_DUIDING_SUMMARY }
  if (opties.duidingMaxPerRun !== undefined) {
    duiding = await duidWachtendeArtikelen(supabase, opties.duidingModel ?? null, {
      maxPerRun: opties.duidingMaxPerRun,
      tijdBudgetMs: opties.duidingTijdBudgetMs,
    })
  }

  const perSoort: Record<BronSoort, number> = { rss: 0, web_lijst: 0, web_pagina: 0 }
  for (const k of kandidaten) perSoort[k.rij.bron_soort]++

  return {
    summary: {
      sourcesChecked: sources.rssFeeds.length + sources.webSources.length,
      rssArticlesFound: perSoort.rss,
      webArticlesExtracted: perSoort.web_lijst + perSoort.web_pagina,
      perSoort,
      duplicatesSkipped,
      alBekend,
      inserted,
      skipped,
      uitgesteld,
      linksGeweigerd,
      duiding,
    },
    health: sourceHealth,
  }
}
