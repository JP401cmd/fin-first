'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { NotificationItem } from '@/components/app/notifications/notification-item'
import { Bell, Newspaper, ChevronRight, ChevronDown, CheckCheck, Sparkles, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { Masthead } from './masthead'
import { NewspaperFooter } from './newspaper-footer'
import { HeroNewsArticle, NewsArticle, NewsSkeletonLoader } from './news-components'
import { ArchiveSection } from './archive-section'
import type { Notification } from '@/app/api/notifications/route'
import type { NewsItem } from '@/app/api/news/route'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { TemporalContext } from '@/lib/briefing/types'
import { DAIshboard } from '@/components/daishboard/daishboard'

const BERICHTEN_HISTORY_DAYS = 30

// ── News cache (client-side) ────────────────────────────────────────

const NEWS_LOCAL_CACHE_KEY = 'trifinity_news_cache'
const NEWS_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

interface LocalNewsCache {
  items: NewsItem[]
  fetchedAt: number
}

function getLocalNewsCache(): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(NEWS_LOCAL_CACHE_KEY)
    if (!raw) return null
    const cache: LocalNewsCache = JSON.parse(raw)
    if (Date.now() - cache.fetchedAt > NEWS_CACHE_TTL_MS) return null
    return cache.items
  } catch {
    return null
  }
}

function setLocalNewsCache(items: NewsItem[]): void {
  try {
    const cache: LocalNewsCache = { items, fetchedAt: Date.now() }
    localStorage.setItem(NEWS_LOCAL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Silent fail — localStorage might be full
  }
}

// ── Day grouping helpers ─────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor(
    (today.getTime() - target.getTime()) / 86_400_000
  )

  if (diffDays === 0) return 'Vandaag'
  if (diffDays === 1) return 'Gisteren'

  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
  if (diffDays < 7) return dayNames[date.getDay()]

  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

function getDayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

type DayGroup = {
  label: string
  key: string
  notifications: Notification[]
}

// ── Newspaper section heading ────────────────────────────────────────

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 pb-4 pt-2">
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

// ── Collapsible day group ────────────────────────────────────────────

function CollapsedDayGroup({
  group,
  markAsRead,
}: {
  group: DayGroup
  markAsRead: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full min-h-[44px] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="font-source-serif text-[13px] capitalize italic text-[var(--ink-3)]">
          {group.label}
        </span>
        <span className="font-inter text-[11px] text-[var(--ink-4)]">
          — {group.notifications.length} {group.notifications.length === 1 ? 'bericht' : 'berichten'}
        </span>
      </button>
      {expanded && (
        <div>
          {group.notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={markAsRead}
              onClose={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section anchor navigation ────────────────────────────────────────

function SectionAnchors() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="mb-6 flex items-center justify-center gap-1" aria-label="Sectie-navigatie">
      <button
        type="button"
        onClick={() => scrollTo('sectie-briefing')}
        className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Briefing
      </button>
      <span className="text-[var(--ink-4)]" aria-hidden="true">&middot;</span>
      <button
        type="button"
        onClick={() => scrollTo('sectie-nieuws')}
        className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
      >
        <Newspaper className="h-3.5 w-3.5" />
        Nieuws
      </button>
      <span className="text-[var(--ink-4)]" aria-hidden="true">&middot;</span>
      <button
        type="button"
        onClick={() => scrollTo('sectie-meldingen')}
        className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
      >
        <Bell className="h-3.5 w-3.5" />
        Meldingen
      </button>
    </nav>
  )
}

// ── Main client component ────────────────────────────────────────────

interface BerichtenClientProps {
  dashboardData: DashboardData
  temporal: TemporalContext
  userName?: string
  aiEnabled: boolean
}

export function BerichtenClient({ dashboardData, temporal, userName, aiEnabled: initialAiEnabled }: BerichtenClientProps) {
  const {
    unreadCount,
    markAsRead,
    markAllRead,
  } = useNotifications()

  const [history, setHistory] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [aiEnabled] = useState(initialAiEnabled)
  const [meldingenExpanded, setMeldingenExpanded] = useState(false)
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

  const fetchExtendedHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?days=${BERICHTEN_HISTORY_DAYS}`)
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.history ?? [])
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExtendedHistory()
  }, [fetchExtendedHistory])

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

  const fetchNews = useCallback(async () => {
    if (newsFetched) return
    const cached = getLocalNewsCache()
    if (cached) {
      setNewsItems(cached)
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
      setLocalNewsCache(items)
      setNewsFetched(true)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
    } finally {
      setNewsLoading(false)
    }
  }, [newsFetched])

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
      setLocalNewsCache(items)
      setNewsFetched(true)
      setRefreshing(false)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (aiEnabled) fetchNews()
  }, [fetchNews, aiEnabled])

  // Poll for background generation — handles partial items progressively
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
        setLocalNewsCache(items)
        setNewsFetched(true)
        setGenerating(false)
        setRefreshing(false)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
      } catch (err) {
        setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
        setGenerating(false)
        setRefreshing(false)
      }
    }
    const interval = setInterval(poll, 2500)
    return () => clearInterval(interval)
  }, [generating, newsFetched])

  const handleMarkAsRead = useCallback((id: string) => {
    setHistory((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    markAsRead(id)
  }, [markAsRead])

  const handleMarkAllRead = useCallback(() => {
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllRead()
  }, [markAllRead])

  // ── Partition notifications ────────────────────────────────────────
  const urgent = history.filter((n) => n.priority <= 2 && !n.read)
  const urgentIds = new Set(urgent.map((n) => n.id))
  const normal = history.filter((n) => !urgentIds.has(n.id))

  const todayItems: Notification[] = []
  const earlierGroups: DayGroup[] = []
  const earlierGroupMap = new Map<string, DayGroup>()

  for (const n of normal) {
    if (isToday(n.createdAt)) {
      todayItems.push(n)
    } else {
      const key = getDayKey(n.createdAt)
      if (!earlierGroupMap.has(key)) {
        const group: DayGroup = {
          key,
          label: formatDayLabel(n.createdAt),
          notifications: [],
        }
        earlierGroupMap.set(key, group)
        earlierGroups.push(group)
      }
      earlierGroupMap.get(key)!.notifications.push(n)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <Masthead editionNr={editionNr} jaargang={jaargang} />
      <SectionAnchors />

      {/* ── WILL'S BRIEFING sectie (bovenaan) ──────────────────── */}
      <section id="sectie-briefing" className="scroll-mt-4 mb-8">
        <SectionHeading label="Will's Briefing" />
        <DAIshboard
          data={dashboardData}
          temporal={temporal}
          userName={userName}
          aiEnabled={aiEnabled}
        />
      </section>

      {/* ── FINANCIEEL NIEUWS sectie ──────────────────────────── */}
      <section id="sectie-nieuws" className="scroll-mt-4">
        <SectionHeading label="Financieel Nieuws" />

        {!aiEnabled ? (
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center shadow-[var(--s0)]">
            <p className="font-inter text-sm font-medium text-[var(--ink-2)]">AI-nieuws is uitgeschakeld</p>
            <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-4)]">
              Schakel AI weer in via Instellingen &gt; Privacy &amp; AI om gepersonaliseerd nieuws te ontvangen.
            </p>
          </div>
        ) : (
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
                          Will stelt je persoonlijke editie samen&hellip;
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
                      <div style={{ animation: 'news-reveal 0.4s ease-out both' }}>
                        <HeroNewsArticle item={newsItems[0]} isRead={readArticleIds.has(newsItems[0].id)} onMarkRead={markArticleRead} />
                      </div>
                      {newsItems.length > 1 && (
                        <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                          {newsItems.slice(1).map((item, index) => (
                            <div
                              key={item.id}
                              style={{ animation: `news-reveal 0.4s ease-out ${(index + 1) * 120}ms both` }}
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
                      <p className="font-inter text-sm text-[var(--ink-3)]">
                        Nog geen nieuws beschikbaar.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <ArchiveSection />
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── MELDINGEN sectie (ingeklapt, onder nieuws) ────────── */}
      <section id="sectie-meldingen" className="mt-8 scroll-mt-4">
        <SectionHeading label="Meldingen" />

        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
          <button
            type="button"
            onClick={() => setMeldingenExpanded(!meldingenExpanded)}
            className="flex w-full min-h-[44px] items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50"
          >
            <div className="flex items-center gap-2">
              {meldingenExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              )}
              <Bell className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Meldingen
              </span>
              {!loading && history.length > 0 && (
                <span className="font-inter text-[11px] text-[var(--ink-4)]">
                  — {history.length} {history.length === 1 ? 'bericht' : 'berichten'}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-wil-500 px-1.5 font-inter text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {meldingenExpanded && (
            <>
              {unreadCount > 0 && (
                <div className="flex justify-end border-t border-[var(--border-ed)] px-4 py-2">
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="flex min-h-[44px] items-center gap-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] sm:min-h-0"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Alles gelezen
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center border-t border-[var(--border-ed)] py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 border-t border-[var(--border-ed)] px-8 py-16 text-center">
                  <Bell className="h-8 w-8 text-[var(--ink-4)]" />
                  <p className="font-inter text-sm text-[var(--ink-3)]">Geen meldingen.</p>
                  <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                    &ldquo;Stilte is ook een vorm van rijkdom.&rdquo;
                  </p>
                </div>
              ) : (
                <div className="border-t border-[var(--border-ed)]">
                  {urgent.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-4 py-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#b33a2e]" />
                        <span className="font-inter text-[10px] font-bold uppercase tracking-[.1em] text-[#b33a2e]">
                          Dringend
                        </span>
                      </div>
                      {urgent.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onRead={handleMarkAsRead}
                          onClose={() => {}}
                        />
                      ))}
                    </div>
                  )}

                  {todayItems.length > 0 && (
                    <div>
                      <div className="border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-4 py-2">
                        <span className="font-inter text-[10px] font-bold uppercase tracking-[.1em] text-[var(--ink-3)]">
                          Vandaag
                        </span>
                      </div>
                      {todayItems.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onRead={handleMarkAsRead}
                          onClose={() => {}}
                        />
                      ))}
                    </div>
                  )}

                  {earlierGroups.length > 0 && (
                    <div>
                      <div className="border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-4 py-2">
                        <span className="font-inter text-[10px] font-bold uppercase tracking-[.1em] text-[var(--ink-3)]">
                          Eerder
                        </span>
                      </div>
                      {earlierGroups.map((group) => (
                        <CollapsedDayGroup
                          key={group.key}
                          group={group}
                          markAsRead={handleMarkAsRead}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <NewspaperFooter />
    </div>
  )
}
