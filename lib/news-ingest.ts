// ── News Ingest — gedeelde pipeline voor handmatige én cron-ingestie ──
//
// Eén implementatie voor /api/admin/news-ingest (handmatig) en
// /api/news-ingest/cron (dagelijks), zodat gedrag nooit kan driften:
// 1. RSS-feeds → gestructureerde artikelen → AI-categorisatie + impact
// 2. Webbronnen → ruwe tekst → AI-extractie → gestructureerde artikelen
// 3. Synthetische unieke URL's voor web-items zonder eigen link
// 4. Inhoudelijke titel-dedupe (batch + bestaande artikelen van de laatste
//    30 dagen)
// 5. Upsert met URL-dedupe, daarna bewaren op TIJD: alles ouder dan
//    ARTICLE_RETENTION_DAYS gaat weg. Geen harde grens op aantal meer — die
//    (100) besloeg in sep 2026 maar twee à drie dagen nieuws (ADR 0171).
// 6. Duidingsstap (Krant, ADR 0171): één generateObject per wachtend artikel,
//    idempotent op id + status, in de schaduw. Optioneel: zonder duidingsmodel
//    wordt alleen de wachtrij geteld. Faalt NOOIT de ingest.
// 7. Per-bron gezondheid naar app_settings (key: news_source_health)
//
// AI-verrijking is optioneel: zonder model worden artikelen wel opgeslagen,
// maar zonder categorie/impact en zonder web-extractie.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadNewsSources,
  fetchRssContent,
  fetchWebContent,
  type SourceArticle,
} from '@/lib/news-sources'
import { extractNewsFromWebPage, categorizeArticles } from '@/lib/news-enrich'
import { dedupeSimilarTitles, ensureUniqueArticleUrl } from '@/lib/news-selection'
import {
  duidWachtendeArtikelen,
  LEGE_DUIDING_SUMMARY,
  type DuidingSummary,
} from '@/lib/krant/duiding'

/** Bewaartermijn van de artikelbak. Het editievenster (30 dagen) valt hier ruim binnen. */
export const ARTICLE_RETENTION_DAYS = 120
/** Venster van bestaande titels waartegen nieuwe kandidaten inhoudelijk gededupet worden. */
export const TITLE_DEDUPE_WINDOW_DAYS = 30
/** Bovengrens op het aantal titels dat de dedupe leest (~50/dag × 30 dagen, met marge). */
const TITLE_DEDUPE_LIMIT = 2_000

// ── Types ────────────────────────────────────────────────────────────

export interface IngestSummary {
  sourcesChecked: number
  rssArticlesFound: number
  webArticlesExtracted: number
  duplicatesSkipped: number
  inserted: number
  skipped: number
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
}

export interface SourceHealthEntry {
  label: string
  url: string
  type: 'rss' | 'web'
  items: number
  error?: string
}

export interface SourceHealth {
  checkedAt: string
  sources: SourceHealthEntry[]
}

interface ArticleCandidate {
  title: string
  summary: string | null
  source_url: string
  source_name: string
  category: string | null
  potential_impact: string | null
  published_at: string | null
  raw_content: string | null
}

// ── Pipeline ─────────────────────────────────────────────────────────

export async function runNewsIngest(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any | null,
  opties: IngestOpties = {},
): Promise<{ summary: IngestSummary; health: SourceHealth }> {
  const sources = await loadNewsSources(supabase)
  const health: SourceHealthEntry[] = []

  // ── Stream 1: RSS feeds ────────────────────────────────────────
  const rssResults = await Promise.allSettled(
    sources.rssFeeds.map((feed) => fetchRssContent(feed)),
  )
  const rssArticles: SourceArticle[] = []
  sources.rssFeeds.forEach((feed, i) => {
    const result = rssResults[i]
    const items = result.status === 'fulfilled' ? result.value : []
    rssArticles.push(...items)
    health.push({
      label: feed.label,
      url: feed.url,
      type: 'rss',
      items: items.length,
      ...(result.status === 'rejected' ? { error: String(result.reason) } : {}),
    })
  })

  // ── Stream 2: Web sources → AI extraction ──────────────────────
  const webResults = await Promise.allSettled(
    sources.webSources.map((source) => fetchWebContent(source)),
  )

  // Paginatekst per pagina-URL, voor de duidingsstap: web-items uit deze run
  // dragen een synthetische URL naar de themapagina (`ensureUniqueArticleUrl`),
  // dus de run-tekst is voor hen de enige échte bron — zonder tweede fetch.
  // Gesleuteld op URL, niet op label: een label kan botsen met een RSS-feed.
  const runTekstByPaginaUrl = new Map<string, string>()
  sources.webSources.forEach((source, i) => {
    const result = webResults[i]
    if (result.status === 'fulfilled' && result.value) runTekstByPaginaUrl.set(source.url, result.value)
  })

  type WebArticle = SourceArticle & { category?: string; potentialImpact?: string }
  const webArticles: WebArticle[] = []
  if (model) {
    const webExtractionResults = await Promise.allSettled(
      sources.webSources.map(async (source, i) => {
        const result = webResults[i]
        if (result.status !== 'fulfilled' || !result.value) return []
        // fetchWebContent prefixes the text with "[label]: " — strip it
        const rawText = result.value.replace(/^\[.*?\]:\s*/, '')
        return extractNewsFromWebPage(rawText, source, model)
      }),
    )
    sources.webSources.forEach((source, i) => {
      const result = webExtractionResults[i]
      const items = result.status === 'fulfilled' ? result.value : []
      webArticles.push(...items)
      health.push({
        label: source.label,
        url: source.url,
        type: 'web',
        items: items.length,
        ...(result.status === 'rejected' ? { error: String(result.reason) } : {}),
      })
    })
  } else {
    sources.webSources.forEach((source) => {
      health.push({ label: source.label, url: source.url, type: 'web', items: 0, error: 'AI-model niet beschikbaar — webextractie overgeslagen' })
    })
  }

  // ── AI categorization for RSS articles ─────────────────────────
  let categoryMap = new Map<number, { category: string; summary: string; potentialImpact: string }>()
  if (model && rssArticles.length > 0) {
    categoryMap = await categorizeArticles(rssArticles, model)
  }

  // ── Bouw kandidaten in één uniforme vorm ───────────────────────
  const candidates: ArticleCandidate[] = []

  rssArticles.forEach((article, i) => {
    if (!article.url) return
    const enrichment = categoryMap.get(i)
    candidates.push({
      title: article.title,
      summary: enrichment?.summary || article.summary || null,
      source_url: article.url,
      source_name: article.sourceName,
      category: enrichment?.category || null,
      potential_impact: enrichment?.potentialImpact || null,
      published_at: article.date ? new Date(article.date).toISOString() : null,
      raw_content: article.summary || null,
    })
  })

  for (const article of webArticles) {
    if (!article.url) continue
    // Web-items zonder eigen link vallen terug op de paginale URL; maak die
    // uniek zodat de URL-dedupe niet alle volgende items van die pagina blokkeert
    const findSource = sources.webSources.find((s) => s.label === article.sourceName)
    const uniqueUrl = findSource
      ? ensureUniqueArticleUrl(article.url, findSource.url, article.title)
      : article.url
    candidates.push({
      title: article.title,
      summary: article.summary || null,
      source_url: uniqueUrl,
      source_name: article.sourceName,
      category: article.category || null,
      potential_impact: article.potentialImpact || null,
      published_at: article.date ? new Date(article.date).toISOString() : null,
      raw_content: article.summary || null,
    })
  }

  const invalidSkipped =
    rssArticles.filter((a) => !a.url).length + webArticles.filter((a) => !a.url).length

  // ── Inhoudelijke dedupe op titel (batch + bestaande artikelen) ─
  // Venster van 30 dagen i.p.v. "de N nieuwste": met een bak van 120 dagen
  // zou een vaste N tegen een steeds kleiner aandeel van de bak dedupen.
  let existingTitles: string[] = []
  try {
    const dedupeSince = new Date()
    dedupeSince.setDate(dedupeSince.getDate() - TITLE_DEDUPE_WINDOW_DAYS)
    const { data } = await supabase
      .from('news_articles')
      .select('title')
      .gte('fetched_at', dedupeSince.toISOString())
      .order('fetched_at', { ascending: false })
      .limit(TITLE_DEDUPE_LIMIT)
    existingTitles = (data || []).map((r) => r.title)
  } catch {
    // Zonder bestaande titels dedupen we alleen binnen de batch
  }

  const { kept, duplicates } = dedupeSimilarTitles(candidates, existingTitles)

  // ── Upsert (URL-dedupe via unique constraint) ──────────────────
  let inserted = 0
  let skipped = invalidSkipped

  for (const candidate of kept) {
    const { error } = await supabase.from('news_articles').upsert(
      {
        ...candidate,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'source_url', ignoreDuplicates: true },
    )
    if (!error) inserted++
    else skipped++
  }

  // ── Bewaren op tijd: artikelen ouder dan ARTICLE_RETENTION_DAYS opruimen ─
  const retentionCutoff = new Date()
  retentionCutoff.setDate(retentionCutoff.getDate() - ARTICLE_RETENTION_DAYS)
  await supabase
    .from('news_articles')
    .delete()
    .lt('fetched_at', retentionCutoff.toISOString())

  // ── Per-bron gezondheid opslaan (voor de beheerpagina) ─────────
  // Vóór de duidingsstap: wordt de run door maxDuration afgebroken, dan is
  // de brongezondheid al geschreven.
  const sourceHealth: SourceHealth = {
    checkedAt: new Date().toISOString(),
    sources: health,
  }
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
  // niet op de duiding.
  let duiding: DuidingSummary = { ...LEGE_DUIDING_SUMMARY }
  if (opties.duidingMaxPerRun !== undefined) {
    duiding = await duidWachtendeArtikelen(supabase, opties.duidingModel ?? null, {
      maxPerRun: opties.duidingMaxPerRun,
      tijdBudgetMs: opties.duidingTijdBudgetMs,
      runTekstByPaginaUrl,
      webPaginaUrls: sources.webSources.map((s) => s.url),
    })
  }

  return {
    summary: {
      sourcesChecked: sources.rssFeeds.length + sources.webSources.length,
      rssArticlesFound: rssArticles.length,
      webArticlesExtracted: webArticles.length,
      duplicatesSkipped: duplicates.length,
      inserted,
      skipped,
      duiding,
    },
    health: sourceHealth,
  }
}
