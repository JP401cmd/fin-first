// ── News Ingest — gedeelde pipeline voor handmatige én cron-ingestie ──
//
// Eén implementatie voor /api/admin/news-ingest (handmatig) en
// /api/news-ingest/cron (dagelijks), zodat gedrag nooit kan driften:
// 1. RSS-feeds → gestructureerde artikelen → AI-categorisatie + impact
// 2. Webbronnen → ruwe tekst → AI-extractie → gestructureerde artikelen
// 3. Synthetische unieke URL's voor web-items zonder eigen link
// 4. Inhoudelijke titel-dedupe (batch + bestaande artikelen)
// 5. Upsert met URL-dedupe, daarna harde cap: maximaal 100 artikelen
//    bewaard, nieuwste eerst (en een 90-dagen-vangnet)
// 6. Per-bron gezondheid naar app_settings (key: news_source_health)
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

export const MAX_STORED_ARTICLES = 100

// ── Types ────────────────────────────────────────────────────────────

export interface IngestSummary {
  sourcesChecked: number
  rssArticlesFound: number
  webArticlesExtracted: number
  duplicatesSkipped: number
  inserted: number
  skipped: number
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
  let existingTitles: string[] = []
  try {
    const { data } = await supabase
      .from('news_articles')
      .select('title')
      .order('fetched_at', { ascending: false })
      .limit(MAX_STORED_ARTICLES)
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

  // ── Harde cap: bewaar maximaal MAX_STORED_ARTICLES, nieuwste eerst ─
  const { data: allRows } = await supabase
    .from('news_articles')
    .select('id')
    .order('fetched_at', { ascending: false })

  if (allRows && allRows.length > MAX_STORED_ARTICLES) {
    const toDelete = allRows.slice(MAX_STORED_ARTICLES).map((r) => r.id)
    await supabase.from('news_articles').delete().in('id', toDelete)
  }

  // ── Vangnet: artikelen ouder dan 90 dagen opruimen ─────────────
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  await supabase
    .from('news_articles')
    .delete()
    .lt('fetched_at', ninetyDaysAgo.toISOString())

  // ── Per-bron gezondheid opslaan (voor de beheerpagina) ─────────
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

  return {
    summary: {
      sourcesChecked: sources.rssFeeds.length + sources.webSources.length,
      rssArticlesFound: rssArticles.length,
      webArticlesExtracted: webArticles.length,
      duplicatesSkipped: duplicates.length,
      inserted,
      skipped,
    },
    health: sourceHealth,
  }
}
