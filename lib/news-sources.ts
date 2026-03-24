// ── News Sources — Fetches real content from RSS feeds + web pages ────
//
// No external XML parser — uses regex-based extraction from RSS XML,
// which is a well-defined format with predictable structure.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────

export interface WebSource {
  url: string
  label: string // e.g. "Rijksoverheid", "NOS Economie"
}

export interface RssFeed {
  url: string
  label: string // e.g. "Belastingdienst Privé"
}

export interface SourceArticle {
  title: string
  summary: string
  url: string        // direct link to the original article
  date: string       // ISO or YYYY-MM-DD
  sourceName: string // label of the source
}

export interface NewsSources {
  webSources: WebSource[]
  rssFeeds: RssFeed[]
}

// ── RSS parsing helpers ──────────────────────────────────────────────

/** Strip CDATA wrappers and decode common XML entities */
function cleanCdata(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Extract text content from an XML element by tag name.
 * Handles both plain text and CDATA-wrapped content.
 */
function extractTag(xml: string, tagName: string): string {
  // Match both self-closing and content-bearing tags.
  // Use a non-greedy match that handles CDATA and nested content.
  const regex = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`,
    'i',
  )
  const match = xml.match(regex)
  if (!match) return ''
  return cleanCdata(stripHtml(match[1]))
}

/**
 * Extract a link from an RSS item. Handles both `<link>url</link>` and
 * bare `<link/>url<` patterns (some feeds use the latter).
 */
function extractLink(itemXml: string): string {
  // Standard <link>url</link>
  const standard = extractTag(itemXml, 'link')
  if (standard && standard.startsWith('http')) return standard

  // Some feeds place the URL between <link/> and the next tag
  const bareMatch = itemXml.match(/<link\s*\/?>([^<]+)/i)
  if (bareMatch) {
    const url = bareMatch[1].trim()
    if (url.startsWith('http')) return url
  }

  return ''
}

/**
 * Normalise a pubDate string to YYYY-MM-DD format.
 * Accepts RFC 2822 dates (standard in RSS) and ISO dates.
 */
function normaliseDateToISO(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0]
    return d.toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

// ── Fetch functions ──────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
const MAX_RSS_ITEMS = 10

/**
 * Fetch and parse an RSS feed into structured articles.
 * Returns an empty array on failure — never throws.
 */
export async function fetchRssContent(feed: RssFeed): Promise<SourceArticle[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TriFinity/1.0 NewsAggregator',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error(`[news-sources] RSS fetch failed for "${feed.label}": HTTP ${res.status}`)
      return []
    }

    const xml = await res.text()

    // Extract all <item> blocks
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
    const articles: SourceArticle[] = []
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null && articles.length < MAX_RSS_ITEMS) {
      const itemXml = match[1]

      const title = extractTag(itemXml, 'title')
      const summary =
        extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded') || ''
      const url = extractLink(itemXml)
      const date = normaliseDateToISO(
        extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date'),
      )

      if (title) {
        articles.push({
          title,
          summary: summary.slice(0, 500), // keep summaries manageable
          url,
          date,
          sourceName: feed.label,
        })
      }
    }

    return articles
  } catch (err) {
    // AbortError means timeout, other errors are network/parse failures
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[news-sources] RSS fetch error for "${feed.label}": ${reason}`)
    return []
  }
}

/**
 * Fetch a web page and return its plain-text content (truncated).
 * Used for supplementary context, not structured articles.
 * Returns an empty string on failure — never throws.
 */
export async function fetchWebContent(source: WebSource): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TriFinity/1.0 NewsAggregator',
        Accept: 'text/html',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error(`[news-sources] Web fetch failed for "${source.label}": HTTP ${res.status}`)
      return ''
    }

    const html = await res.text()
    const text = stripHtml(html).slice(0, 8000)
    return text ? `[${source.label}]: ${text}` : ''
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[news-sources] Web fetch error for "${source.label}": ${reason}`)
    return ''
  }
}

// ── Source configuration from Supabase ───────────────────────────────

/**
 * Load news sources from the `app_settings` table.
 * Keys: `news_web_sources` and `news_rss_feeds`.
 * Returns empty arrays if not configured.
 */
export async function loadNewsSources(supabase: SupabaseClient): Promise<NewsSources> {
  const [webRes, rssRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'news_web_sources').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'news_rss_feeds').maybeSingle(),
  ])

  let webSources: WebSource[] = []
  let rssFeeds: RssFeed[] = []

  try {
    if (webRes.data?.value) {
      const parsed = typeof webRes.data.value === 'string'
        ? JSON.parse(webRes.data.value)
        : webRes.data.value
      if (Array.isArray(parsed)) webSources = parsed
    }
  } catch {
    console.error('[news-sources] Failed to parse news_web_sources from app_settings')
  }

  try {
    if (rssRes.data?.value) {
      const parsed = typeof rssRes.data.value === 'string'
        ? JSON.parse(rssRes.data.value)
        : rssRes.data.value
      if (Array.isArray(parsed)) rssFeeds = parsed
    }
  } catch {
    console.error('[news-sources] Failed to parse news_rss_feeds from app_settings')
  }

  return { webSources, rssFeeds }
}

// ── Combined fetch ───────────────────────────────────────────────────

/**
 * Fetch all configured source content in parallel.
 * RSS feeds yield structured articles; web pages yield raw context text.
 * Uses Promise.allSettled so individual failures don't block others.
 */
export async function fetchAllSourceContent(
  supabase: SupabaseClient,
): Promise<{ articles: SourceArticle[]; webContext: string }> {
  const { webSources, rssFeeds } = await loadNewsSources(supabase)

  // Nothing configured — return early
  if (webSources.length === 0 && rssFeeds.length === 0) {
    return { articles: [], webContext: '' }
  }

  const [rssResults, webResults] = await Promise.all([
    Promise.allSettled(rssFeeds.map((feed) => fetchRssContent(feed))),
    Promise.allSettled(webSources.map((source) => fetchWebContent(source))),
  ])

  // Collect successful RSS articles
  const articles: SourceArticle[] = []
  for (const result of rssResults) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value)
    }
  }

  // Sort by date descending so the most recent articles come first
  articles.sort((a, b) => b.date.localeCompare(a.date))

  // Collect successful web context snippets
  const webSnippets: string[] = []
  for (const result of webResults) {
    if (result.status === 'fulfilled' && result.value) {
      webSnippets.push(result.value)
    }
  }

  return {
    articles,
    webContext: webSnippets.join('\n\n'),
  }
}
