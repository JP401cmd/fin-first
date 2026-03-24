import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { loadNewsSources, fetchRssContent, fetchWebContent } from '@/lib/news-sources'
import { getModel } from '@/lib/ai/config'
import { extractNewsFromWebPage, categorizeArticles } from '@/lib/news-enrich'

// ── POST — Manual news ingestion (admin-triggered) ───────────────────
//
// Two-stream ingestion with AI enrichment:
// 1. RSS feeds → structured articles → AI categorization + summary
// 2. Web sources → raw text → AI extraction → structured articles
//
// AI enrichment is optional: if the AI model is not configured, articles
// are still ingested but without category or improved summary.

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const sources = await loadNewsSources(supabase)

    // Get AI model for enrichment — continue without it if not configured
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null
    try {
      model = await getModel(supabase)
    } catch {
      // AI model not configured — proceed without enrichment
    }

    // ── Stream 1: RSS feeds ────────────────────────────────────────
    const rssResults = await Promise.allSettled(
      sources.rssFeeds.map((feed) => fetchRssContent(feed)),
    )
    const rssArticles = rssResults.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : [],
    )

    // ── Stream 2: Web sources → AI extraction ──────────────────────
    const webResults = await Promise.allSettled(
      sources.webSources.map((source) => fetchWebContent(source)),
    )

    let webArticles: (import('@/lib/news-sources').SourceArticle & { category?: string })[] = []
    if (model) {
      const webExtractionPromises = sources.webSources.map(async (source, i) => {
        const result = webResults[i]
        if (result.status !== 'fulfilled' || !result.value) return []
        // fetchWebContent prefixes the text with "[label]: " — strip it
        const rawText = result.value.replace(/^\[.*?\]:\s*/, '')
        return extractNewsFromWebPage(rawText, source, model)
      })
      const webResultArrays = await Promise.allSettled(webExtractionPromises)
      webArticles = webResultArrays.flatMap((r) =>
        r.status === 'fulfilled' ? r.value : [],
      )
    }

    // ── AI categorization for RSS articles ─────────────────────────
    let categoryMap = new Map<number, { category: string; summary: string; potentialImpact: string }>()
    if (model && rssArticles.length > 0) {
      categoryMap = await categorizeArticles(rssArticles, model)
    }

    // ── Insert all articles ────────────────────────────────────────
    let inserted = 0
    let skipped = 0

    // Insert RSS articles with AI category/summary
    for (let i = 0; i < rssArticles.length; i++) {
      const article = rssArticles[i]
      if (!article.url) {
        skipped++
        continue
      }

      const enrichment = categoryMap.get(i)
      const { error } = await supabase.from('news_articles').upsert(
        {
          title: article.title,
          summary: enrichment?.summary || article.summary || null,
          source_url: article.url,
          source_name: article.sourceName,
          category: enrichment?.category || null,
          potential_impact: enrichment?.potentialImpact || null,
          published_at: article.date ? new Date(article.date).toISOString() : null,
          fetched_at: new Date().toISOString(),
          raw_content: article.summary || null,
        },
        { onConflict: 'source_url', ignoreDuplicates: true },
      )
      if (!error) inserted++
      else skipped++
    }

    // Insert web-extracted articles (already have category from AI extraction)
    for (const article of webArticles) {
      if (!article.url) {
        skipped++
        continue
      }

      const { error } = await supabase.from('news_articles').upsert(
        {
          title: article.title,
          summary: article.summary || null,
          source_url: article.url,
          source_name: article.sourceName,
          category: article.category || null,
          potential_impact: (article as any).potentialImpact || null,
          published_at: article.date ? new Date(article.date).toISOString() : null,
          fetched_at: new Date().toISOString(),
          raw_content: article.summary || null,
        },
        { onConflict: 'source_url', ignoreDuplicates: true },
      )
      if (!error) inserted++
      else skipped++
    }

    return NextResponse.json({
      success: true,
      summary: {
        sourcesChecked: sources.rssFeeds.length + sources.webSources.length,
        rssArticlesFound: rssArticles.length,
        webArticlesExtracted: webArticles.length,
        inserted,
        skipped,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[news-ingest] Manual ingestion failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
