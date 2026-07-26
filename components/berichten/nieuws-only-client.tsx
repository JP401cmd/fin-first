'use client'

import { useState, useEffect, useCallback } from 'react'
import { Newspaper, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { Masthead } from './masthead'
import { SectionHeading } from './section-heading'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { NewspaperFooter } from './newspaper-footer'
import { HeroNewsArticle, NewsArticle, NewsSkeletonLoader } from './news-components'
import { ArchiveSection } from './archive-section'
import type { NewsItem } from '@/app/api/news/route'

// ── News cache (client-side) ────────────────────────────────────────
// Duplicated from berichten-client.tsx intentionally — the two pages
// may evolve independently and share the same localStorage key so a
// user switching between them still benefits from cached data.

const NEWS_LOCAL_CACHE_KEY = 'trifinity_news_cache'
const NEWS_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

interface LocalNewsCache {
  items: NewsItem[]
  fetchedAt: number
  generatedAt?: string
  sourceCount?: number
  editionNr?: number
  jaargang?: number
}

function getLocalNewsCache(): {
  items: NewsItem[]
  generatedAt?: string
  sourceCount?: number
  editionNr?: number
  jaargang?: number
} | null {
  try {
    const raw = localStorage.getItem(NEWS_LOCAL_CACHE_KEY)
    if (!raw) return null
    const cache: LocalNewsCache = JSON.parse(raw)
    if (Date.now() - cache.fetchedAt > NEWS_CACHE_TTL_MS) return null
    return {
      items: cache.items,
      generatedAt: cache.generatedAt,
      sourceCount: cache.sourceCount,
      editionNr: cache.editionNr,
      jaargang: cache.jaargang,
    }
  } catch {
    return null
  }
}

function setLocalNewsCache(
  items: NewsItem[],
  generatedAt?: string,
  sourceCount?: number,
  editionNr?: number,
  jaargang?: number,
): void {
  try {
    const cache: LocalNewsCache = { items, fetchedAt: Date.now(), generatedAt, sourceCount, editionNr, jaargang }
    localStorage.setItem(NEWS_LOCAL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Silent fail — localStorage might be full
  }
}

// ── News-only client component ───────────────────────────────────────
// Stripped-down version of BerichtenClient that renders ONLY the
// TriFinity Post (news articles + archive). No briefing, no
// notifications, no section anchors.

export function NieuwsOnlyClient() {
  // ── News state ──
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [newsFetched, setNewsFetched] = useState(false)
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [newsTab, setNewsTab] = useState<'current' | 'archive'>('current')
  const [editionNr, setEditionNr] = useState<number | undefined>()
  const [jaargang, setJaargang] = useState<number | undefined>()
  const [refreshesRemaining, setRefreshesRemaining] = useState<number | undefined>()
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | undefined>()
  const [sourceCount, setSourceCount] = useState<number | undefined>()

  // ── Read article tracking ──
  useEffect(() => {
    fetch('/api/news/read')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.readIds) setReadArticleIds(new Set(data.readIds))
      })
      .catch(() => { /* Silent fail */ })
  }, [])

  const markArticleRead = useCallback((articleId: string) => {
    setReadArticleIds((prev) => {
      if (prev.has(articleId)) return prev
      const next = new Set(prev)
      next.add(articleId)
      return next
    })
    fetch('/api/news/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    }).catch(() => { /* Silent fail */ })
  }, [])

  // ── Fetch news (initial load) ──
  const fetchNews = useCallback(async () => {
    if (newsFetched) return
    const cached = getLocalNewsCache()
    if (cached) {
      setNewsItems(cached.items)
      if (cached.generatedAt) setGeneratedAt(cached.generatedAt)
      if (cached.sourceCount !== undefined) setSourceCount(cached.sourceCount)
      if (cached.editionNr !== undefined) setEditionNr(cached.editionNr)
      if (cached.jaargang !== undefined) setJaargang(cached.jaargang)
      setNewsFetched(true)
      return
    }
    setNewsLoading(true)
    setNewsError(null)
    try {
      const res = await fetch('/api/news')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()

      if (data.status === 'generating') {
        setGenerating(true)
        setNewsLoading(false)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        return
      }

      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
      setNewsFetched(true)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.generatedAt) setGeneratedAt(data.generatedAt)
      if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
    } finally {
      setNewsLoading(false)
    }
  }, [newsFetched])

  // ── Refresh news (manual) ──
  const refreshNews = useCallback(async () => {
    try { localStorage.removeItem(NEWS_LOCAL_CACHE_KEY) } catch { /* noop */ }
    // Keep current items visible — use overlay instead of clearing
    setRefreshing(true)
    setNewsError(null)
    try {
      const res = await fetch('/api/news?refresh=1')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        if (res.status === 429) {
          setRefreshesRemaining(0)
          setNewsError(data.error ?? 'Verversing limiet bereikt')
          setRefreshing(false)
          return
        }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()

      if (data.status === 'generating') {
        setGenerating(true)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        // Don't clear refreshing — polling will handle it
        return
      }

      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
      setNewsFetched(true)
      setRefreshing(false)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.generatedAt) setGeneratedAt(data.generatedAt)
      if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
      setRefreshing(false)
    }
  }, [])

  // News-only users have AI enabled by definition — fetch on mount
  useEffect(() => {
    fetchNews()
  }, [fetchNews])

  // ── Poll for background generation — handles partial items progressively ──
  useEffect(() => {
    if (!generating) return
    const poll = async () => {
      try {
        const res = await fetch('/api/news')
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()

        if (data.status === 'generating') {
          // Show partial items as they arrive
          if (data.items?.length) {
            setNewsItems(data.items)
            if (!newsFetched) setNewsFetched(true)
          }
          if (data.editionNr) setEditionNr(data.editionNr)
          if (data.jaargang) setJaargang(data.jaargang)
          return // Keep polling
        }

        // Generation complete — final items arrived
        const items: NewsItem[] = data.items ?? data
        setNewsItems(items)
        setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
        setNewsFetched(true)
        setGenerating(false)
        setRefreshing(false)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        if (data.generatedAt) setGeneratedAt(data.generatedAt)
        if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
        if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
      } catch (err) {
        setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
        setGenerating(false)
        setRefreshing(false)
      }
    }
    // Visibility-guard (egress-reductie): niet doorpollen in een verborgen
    // tab — generatie loopt server-side gewoon door, bij terugkeren pakt de
    // eerstvolgende poll de tussenstand weer op.
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      poll()
    }, 4000)
    return () => clearInterval(interval)
  }, [generating, newsFetched])

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <PageInfoButton
        description={PAGE_INFO['/nieuws']}
        className="absolute right-4 top-5 sm:right-6 sm:top-8"
      />
      <Masthead
        editionNr={editionNr}
        jaargang={jaargang}
        articleCount={newsTab === 'current' ? newsItems.length : undefined}
        updatedAt={newsTab === 'current' ? generatedAt : undefined}
        sourceNote={
          newsTab === 'current' && sourceCount !== undefined
            ? `Gebaseerd op ${sourceCount} ${sourceCount === 1 ? 'bronartikel' : 'bronartikelen'}`
            : undefined
        }
      />

      {/* ── FINANCIEEL NIEUWS ──────────────────────────── */}
      <section className="mt-4">
        <SectionHeading label="Financieel Nieuws" />

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] flex items-center gap-1.5">
                Gepersonaliseerd nieuws
                <AiPrivacyIndicator size={12} />
              </span>
              <div className="h-px flex-1 bg-[var(--border-ed)]" />
              {newsFetched && !newsLoading && !refreshing && (
                <button
                  type="button"
                  onClick={refreshNews}
                  disabled={refreshing || refreshesRemaining === 0}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 py-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50 sm:min-h-0"
                  title={refreshesRemaining === 0 ? 'Verversing limiet bereikt' : 'Ververs nieuws'}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Ververs{refreshesRemaining !== undefined ? ` (${refreshesRemaining} over)` : ''}
                  </span>
                </button>
              )}
            </div>

            {/* ── Tab bar: Huidige editie / Archief ── */}
            {newsFetched && !newsLoading && (
              <div className="mb-4 flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
                <button
                  role="tab"
                  aria-selected={newsTab === 'current'}
                  onClick={() => setNewsTab('current')}
                  className={`flex-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newsTab === 'current'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  Huidige editie
                </button>
                <button
                  role="tab"
                  aria-selected={newsTab === 'archive'}
                  onClick={() => setNewsTab('archive')}
                  className={`flex-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newsTab === 'archive'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  Archief
                </button>
              </div>
            )}

            {newsTab === 'current' ? (
              <>
                <style>{`
                  @keyframes news-reveal {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  .news-reveal-item { animation: news-reveal 0.4s ease-out both; }
                  @media (prefers-reduced-motion: reduce) {
                    .news-reveal-item { animation: none; }
                  }
                `}</style>

                {newsLoading ? (
                  <NewsSkeletonLoader />
                ) : !newsFetched && !newsError && generating ? (
                  <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-16 text-center shadow-[var(--s0)]">
                    <div className="relative">
                      <Newspaper className="h-10 w-10 text-[var(--ink-4)]" />
                      <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin text-[var(--ink-3)]" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                        Fin stelt je persoonlijke editie samen&hellip;
                      </p>
                      <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                        Elk artikel wordt afgestemd op jouw financi&euml;le situatie
                      </p>
                    </div>
                  </div>
                ) : !newsFetched && !newsError ? (
                  <NewsSkeletonLoader />
                ) : newsError ? (
                  <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center shadow-[var(--s0)]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--subtle)]">
                      <AlertCircle className="h-6 w-6 text-[var(--ink-3)]" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                        Nieuws kon niet worden geladen
                      </p>
                      <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                        {newsError}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setNewsFetched(false); setNewsError(null) }}
                      className="flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] active:scale-[0.98] sm:min-h-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Opnieuw proberen
                    </button>
                  </div>
                ) : newsItems.length > 0 ? (
                  <div className="relative">
                    {refreshing && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--r-lg)] bg-[var(--paper)]/70 backdrop-blur-[2px]">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
                        <span className="ml-2 font-source-serif text-sm italic text-[var(--ink-2)]">
                          Nieuwe editie wordt samengesteld&hellip;
                        </span>
                      </div>
                    )}
                    <div className="news-reveal-item">
                      <HeroNewsArticle item={newsItems[0]} isRead={readArticleIds.has(newsItems[0].id)} onMarkRead={markArticleRead} />
                    </div>
                    {newsItems.length > 1 && (
                      <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                        {newsItems.slice(1).map((item, index) => (
                          <div
                            key={item.id}
                            className="news-reveal-item"
                            style={{ animationDelay: `${(index + 1) * 120}ms` }}
                          >
                            <NewsArticle item={item} isRead={readArticleIds.has(item.id)} onMarkRead={markArticleRead} />
                          </div>
                        ))}
                      </div>
                    )}
                    {generating && (
                      <div className="mt-4 flex items-center justify-center gap-2 py-3 text-[var(--ink-4)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="font-source-serif text-[13px] italic">Meer artikelen worden samengesteld&hellip;</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-8 py-16 text-center shadow-[var(--s0)]">
                    <Newspaper className="h-8 w-8 text-[var(--ink-4)]" />
                    <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                      Geen nieuws met impact op jouw situatie
                    </p>
                    <p className="max-w-sm font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-4)]">
                      {sourceCount
                        ? `Fin heeft ${sourceCount} bronartikelen getoetst aan je financiële profiel — geen ervan raakt je situatie op dit moment. Dat is goed nieuws: geen actie nodig.`
                        : 'Er zijn op dit moment geen bronartikelen om te toetsen. Zodra er nieuws is dat jouw situatie raakt, verschijnt het hier.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <ArchiveSection />
            )}
          </div>
        </div>
      </section>

      <NewspaperFooter />
    </div>
  )
}
