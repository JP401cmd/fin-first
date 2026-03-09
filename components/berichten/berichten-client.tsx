'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { NotificationItem } from '@/components/app/notifications/notification-item'
import { Bell, Newspaper, ChevronRight, ChevronDown, CheckCheck, Sparkles, TrendingUp, AlertCircle, Loader2, RefreshCw, MessageSquare } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import Link from 'next/link'
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

// ── Category config ──────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  fiscaal: { label: 'Fiscaal', color: 'bg-kern-50 text-kern-700 border-kern-200', dotColor: 'bg-kern-400' },
  rente: { label: 'Rente', color: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: 'bg-blue-400' },
  woningmarkt: { label: 'Woningmarkt', color: 'bg-purple-50 text-purple-700 border-purple-200', dotColor: 'bg-purple-400' },
  beleggingen: { label: 'Beleggingen', color: 'bg-wil-50 text-wil-700 border-wil-200', dotColor: 'bg-wil-400' },
  pensioen: { label: 'Pensioen', color: 'bg-horizon-50 text-horizon-700 border-horizon-200', dotColor: 'bg-horizon-400' },
  macro: { label: 'Macro', color: 'bg-zinc-100 text-zinc-700 border-zinc-200', dotColor: 'bg-zinc-400' },
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

// ── Category badge ───────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.macro
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cat.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cat.dotColor}`} />
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.06em]">
        {cat.label}
      </span>
    </span>
  )
}

// ── Format news date ─────────────────────────────────────────────────

function formatNewsDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ── Impact block ─────────────────────────────────────────────────────

function ImpactBlock({ impact }: { impact: string }) {
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-3 border-wil-400 bg-wil-50/60 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-wil-600" />
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-wil-700">
          Impact voor jou
        </span>
      </div>
      <p className="font-source-serif text-[13px] leading-relaxed text-wil-900">
        {impact}
      </p>
    </div>
  )
}

// ── Discuss with Will button ─────────────────────────────────────────

function NewsArticleActions({ item, isRead, onMarkRead }: { item: NewsItem; isRead: boolean; onMarkRead: (id: string) => void }) {
  const { openWithMessage } = useChatContext()

  const handleDiscuss = useCallback(() => {
    onMarkRead(item.id)
    const message = `Ik las dit nieuwsartikel:\n\n"${item.headline}"\n\n${item.summary}\n\nWat betekent dit voor mijn financiële situatie?`
    openWithMessage(message)
  }, [item, onMarkRead, openWithMessage])

  const handleToggleRead = useCallback(() => {
    onMarkRead(item.id)
  }, [item.id, onMarkRead])

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleDiscuss}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-wil-200 bg-wil-50 px-3 py-2 font-inter text-[11px] font-medium text-wil-700 transition-colors hover:bg-wil-100 sm:min-h-0 sm:px-2 sm:py-1"
      >
        <MessageSquare className="h-3 w-3" />
        Bespreek met Will
      </button>
      {!isRead && (
        <button
          type="button"
          onClick={handleToggleRead}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] px-3 py-2 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] sm:min-h-0 sm:px-2 sm:py-1"
        >
          <CheckCheck className="h-3 w-3" />
          Gelezen
        </button>
      )}
    </div>
  )
}

// ── Hero news article (first item — front-page style) ───────────────

function HeroNewsArticle({ item, isRead, onMarkRead }: { item: NewsItem; isRead: boolean; onMarkRead: (id: string) => void }) {
  const firstLetter = item.summary.charAt(0)
  const restOfSummary = item.summary.slice(1)

  return (
    <article className={`mb-8 transition-opacity duration-300 ${isRead ? 'opacity-70' : ''}`}>
      <div className="mb-3 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {!isRead && (
          <span className="h-2 w-2 rounded-full bg-wil-500" title="Nieuw" />
        )}
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>

      <h2
        className="font-source-serif text-2xl font-semibold leading-snug text-[var(--ink)] sm:text-3xl"
        style={{ letterSpacing: '-0.02em' }}
      >
        {item.headline}
      </h2>

      <p className="mt-3 font-source-serif text-base leading-relaxed text-[var(--ink-2)] sm:text-lg">
        <span
          className="float-left mr-2 font-playfair text-[3.2rem] font-bold leading-[0.8] text-[var(--ink)]"
          aria-hidden="true"
        >
          {firstLetter}
        </span>
        <span aria-label={item.summary}>{restOfSummary}</span>
      </p>

      <div className="mt-3 clear-left">
        <span className="font-inter text-[11px] text-[var(--ink-4)]">
          {formatNewsDate(item.date)}
        </span>
      </div>

      <ImpactBlock impact={item.personalImpact} />
      <NewsArticleActions item={item} isRead={isRead} onMarkRead={onMarkRead} />
      <div className="mt-6 h-px bg-[var(--border-ed)]" />
    </article>
  )
}

// ── Regular news article (grid card) ────────────────────────────────

function NewsArticle({ item, isRead, onMarkRead }: { item: NewsItem; isRead: boolean; onMarkRead: (id: string) => void }) {
  return (
    <article className={`flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)] transition-opacity transition-shadow duration-300 hover:shadow-[var(--s1)] ${isRead ? 'opacity-70' : ''}`}>
      <div className="mb-2.5 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {!isRead && (
          <span className="h-2 w-2 rounded-full bg-wil-500" title="Nieuw" />
        )}
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>

      <h3 className="font-source-serif text-lg font-semibold leading-snug text-[var(--ink)]">
        {item.headline}
      </h3>

      <p className="mt-1.5 flex-1 font-source-serif text-sm leading-relaxed text-[var(--ink-2)]">
        {item.summary}
      </p>

      <span className="mt-2 inline-block font-inter text-[11px] text-[var(--ink-4)]">
        {formatNewsDate(item.date)}
      </span>

      <ImpactBlock impact={item.personalImpact} />
      <NewsArticleActions item={item} isRead={isRead} onMarkRead={onMarkRead} />
    </article>
  )
}

// ── News skeleton loader ─────────────────────────────────────────────

function NewsSkeletonLoader() {
  return (
    <div>
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="space-y-2">
          <div className="h-7 w-full animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
          <div className="h-7 w-3/4 animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="h-4 w-full animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[var(--subtle)]" />
        <div className="mt-3 rounded-[var(--r)] border-l-3 border-[var(--subtle)] bg-[var(--subtle)]/30 px-4 py-3">
          <div className="mb-1 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="mt-6 h-px bg-[var(--border-ed)]" />
      </div>
      <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]"
          >
            <div className="mb-2.5 h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
            <div className="space-y-1.5">
              <div className="h-5 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
        <p className="font-source-serif text-sm italic text-[var(--ink-3)]">
          Nieuws wordt gepersonaliseerd&hellip;
        </p>
      </div>
    </div>
  )
}

// ── Newspaper masthead ───────────────────────────────────────────────

function Masthead() {
  const now = new Date()
  const dateline = now.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const launchDate = new Date(2026, 0, 1)
  const editionNr = Math.max(1, Math.floor((now.getTime() - launchDate.getTime()) / 86_400_000))

  return (
    <div className="mb-6">
      <div className="mb-3 h-[3px] bg-[var(--ink)]" />
      <div className="flex items-center justify-between">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Editie {editionNr}
        </span>
        <span className="font-source-serif text-[12px] italic text-[var(--ink-3)]">
          Persoonlijk financieel overzicht
        </span>
      </div>
      <h1
        className="mt-2 text-center font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl md:text-[2.75rem]"
        style={{ letterSpacing: '-0.03em' }}
      >
        TriFinity Berichten
      </h1>
      <p className="mt-1.5 text-center font-source-serif text-sm italic text-[var(--ink-2)]">
        {dateline}
      </p>
      <div className="mt-3 flex items-center gap-0">
        <div className="h-[2px] flex-1 bg-[var(--ink)]" />
      </div>
      <div className="mt-[3px] h-px bg-[var(--ink)]" />
    </div>
  )
}

// ── Newspaper footer ─────────────────────────────────────────────────

function NewspaperFooter() {
  return (
    <footer className="mt-12">
      <div className="h-px bg-[var(--ink)]" />
      <div className="mt-[3px] h-[2px] bg-[var(--ink)]" />
      <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <p className="font-source-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd &mdash; elke euro vertegenwoordigt een stukje levenstijd.&rdquo;
        </p>
      </div>
    </footer>
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
      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items)
      setNewsFetched(true)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
    } finally {
      setNewsLoading(false)
    }
  }, [newsFetched])

  const refreshNews = useCallback(async () => {
    try { localStorage.removeItem(NEWS_LOCAL_CACHE_KEY) } catch { /* noop */ }
    setNewsItems([])
    setNewsFetched(false)
    setNewsLoading(true)
    setNewsError(null)
    try {
      const res = await fetch('/api/news?refresh=1')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items)
      setNewsFetched(true)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
    } finally {
      setNewsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (aiEnabled) fetchNews()
  }, [fetchNews, aiEnabled])

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
      <Masthead />
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
                {newsFetched && !newsLoading && (
                  <button
                    type="button"
                    onClick={refreshNews}
                    disabled={newsLoading}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 py-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50 sm:min-h-0"
                    title="Ververs nieuws"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ververs</span>
                  </button>
                )}
              </div>

              {newsLoading || (!newsFetched && !newsError) ? (
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
                <div>
                  <HeroNewsArticle item={newsItems[0]} isRead={readArticleIds.has(newsItems[0].id)} onMarkRead={markArticleRead} />
                  {newsItems.length > 1 && (
                    <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                      {newsItems.slice(1).map((item) => (
                        <NewsArticle key={item.id} item={item} isRead={readArticleIds.has(item.id)} onMarkRead={markArticleRead} />
                      ))}
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
