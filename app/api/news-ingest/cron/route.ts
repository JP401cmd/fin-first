import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadNewsSources, fetchRssContent, fetchWebContent } from '@/lib/news-sources'
import { getModel } from '@/lib/ai/config'
import { extractNewsFromWebPage, categorizeArticles } from '@/lib/news-enrich'
import { recordJobRun } from '@/lib/job-runs'

/**
 * GET /api/news-ingest/cron
 *
 * Scheduled endpoint for automatic daily news article ingestion.
 * Designed to be called by:
 * - Vercel Cron Jobs (see vercel.json)
 * - External cron service
 *
 * Uses service role key (not user auth) to write to the news_articles table.
 * Protected by CRON_SECRET environment variable.
 *
 * Behaviour:
 * - Fetches all configured RSS feeds → AI categorization + summary
 * - Fetches all configured web sources → AI extraction → structured articles
 * - Deduplicates against existing articles by source_url
 * - Inserts new articles into news_articles
 * - Cleans up articles older than 90 days
 *
 * Recommended schedule: daily at 06:00 CET (before users check news)
 */
export async function GET(request: Request) {
  // ── Auth: verify CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isAuthorized =
    !cronSecret || // No secret configured = dev mode, allow
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Supabase service role client ──────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
        description: 'This endpoint requires the service role key to ingest news articles.',
      },
      { status: 500 },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const startedAt = new Date().toISOString()

  try {
    // The loadNewsSources function accepts a generic SupabaseClient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = await loadNewsSources(supabase as any)

    // Get AI model for enrichment — continue without it if not configured
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model = await getModel(supabase as any)
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

    // Insert RSS articles with AI category/summary/impact
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

    // Insert web-extracted articles (already have category + impact from AI extraction)
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

    // ── Cleanup: remove articles older than 90 days ────────────────
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    await supabase
      .from('news_articles')
      .delete()
      .lt('fetched_at', ninetyDaysAgo.toISOString())

    const summary = {
      sourcesChecked: sources.rssFeeds.length + sources.webSources.length,
      rssArticlesFound: rssArticles.length,
      webArticlesExtracted: webArticles.length,
      inserted,
      skipped,
    }

    await recordJobRun(supabase, { job: 'news-ingest', status: 'success', startedAt, summary })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[news-ingest/cron] Ingestion failed:', message)
    await recordJobRun(supabase, { job: 'news-ingest', status: 'error', startedAt, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
