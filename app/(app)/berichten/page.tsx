'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { NotificationItem } from '@/components/app/notifications/notification-item'
import { RELEASE_NOTES, type ReleaseNote } from '@/lib/release-notes'
import { Bell, Newspaper, ChevronRight, CheckCheck, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { Notification } from '@/app/api/notifications/route'

const BERICHTEN_HISTORY_DAYS = 30

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

type TabId = 'meldingen' | 'nieuws'

// ── Module color mapping ─────────────────────────────────────────────

const MODULE_COLORS: Record<string, string> = {
  amber: 'bg-kern-100 text-kern-700 border-kern-200',
  teal: 'bg-wil-100 text-wil-700 border-wil-200',
  purple: 'bg-horizon-100 text-horizon-700 border-horizon-200',
  zinc: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
}

const MODULE_DOT: Record<string, string> = {
  amber: 'bg-kern-400',
  teal: 'bg-wil-400',
  purple: 'bg-horizon-400',
  zinc: 'bg-zinc-400',
  blue: 'bg-blue-400',
  rose: 'bg-rose-400',
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
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
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

// ── Release note card ────────────────────────────────────────────────

function ReleaseNoteCard({ release, defaultExpanded }: { release: ReleaseNote; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false)

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] transition-shadow hover:shadow-[var(--s1)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
          <Newspaper className="h-4 w-4 text-[var(--ink-3)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              {release.version}
            </span>
            <span className="font-inter text-[10px] text-[var(--ink-4)]">
              {new Date(release.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <p className="mt-0.5 font-inter text-sm font-medium text-[var(--ink)]">
            {release.title}
          </p>
          <p className="mt-1 font-inter text-[11px] text-[var(--ink-3)]">
            {release.sections.length} {release.sections.length === 1 ? 'module' : 'modules'} — {release.sections.reduce((sum, s) => sum + s.items.length, 0)} wijzigingen
          </p>
        </div>
        <ChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-ed)] px-4 py-3">
          <div className="space-y-4">
            {release.sections.map((section) => (
              <div key={section.module}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${MODULE_DOT[section.color] ?? 'bg-zinc-400'}`} />
                  <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {section.module}
                  </span>
                </div>
                <div className="space-y-1.5 pl-3.5">
                  {section.items.map((item, i) => (
                    <div key={i}>
                      <p className="font-inter text-xs font-medium text-[var(--ink)]">{item.title}</p>
                      <p className="font-source-serif text-[12px] leading-relaxed text-[var(--ink-2)]">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  // Edition number: days since app launch (1 jan 2026)
  const launchDate = new Date(2026, 0, 1)
  const editionNr = Math.max(1, Math.floor((now.getTime() - launchDate.getTime()) / 86_400_000))

  return (
    <div className="mb-6">
      {/* Top rule */}
      <div className="mb-3 h-[3px] bg-[var(--ink)]" />

      {/* Masthead row */}
      <div className="flex items-center justify-between">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Editie {editionNr}
        </span>
        <span className="font-source-serif text-[12px] italic text-[var(--ink-3)]">
          Persoonlijk financieel overzicht
        </span>
      </div>

      {/* Title */}
      <h1
        className="mt-2 text-center font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl md:text-[2.75rem]"
        style={{ letterSpacing: '-0.03em' }}
      >
        TriFinity Berichten
      </h1>

      {/* Dateline */}
      <p className="mt-1.5 text-center font-source-serif text-sm italic text-[var(--ink-2)]">
        {dateline}
      </p>

      {/* Bottom rule */}
      <div className="mt-3 flex items-center gap-0">
        <div className="h-[2px] flex-1 bg-[var(--ink)]" />
      </div>
      <div className="mt-[3px] h-px bg-[var(--ink)]" />
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────

export default function BerichtenPage() {
  const [activeTab, setActiveTab] = useState<TabId>('meldingen')
  const {
    unreadCount,
    loading: providerLoading,
    markAsRead,
    markAllRead,
  } = useNotifications()

  // Fetch 30-day history for the berichten page (provider default is 7 days)
  const [history, setHistory] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

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

  // Wrap markAsRead/markAllRead to also update local 30-day history
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

  const tabs: { id: TabId; label: string; icon: typeof Bell; count?: number }[] = [
    { id: 'meldingen', label: 'Meldingen', icon: Bell, count: unreadCount > 0 ? unreadCount : undefined },
    { id: 'nieuws', label: 'Nieuws & Updates', icon: Newspaper },
  ]

  const hasNoMeldingen = !loading && history.length === 0
  const hasNoNieuws = RELEASE_NOTES.length === 0
  const isCompletelyEmpty = hasNoMeldingen && hasNoNieuws

  if (isCompletelyEmpty) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
        <Masthead />

        {/* Cross-link to Will's briefing */}
        <Link
          href="/daishboard"
          className="mb-6 flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 shadow-[var(--s0)] transition-shadow hover:shadow-[var(--s1)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wil-100">
            <Sparkles className="h-4 w-4 text-wil-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-inter text-xs font-medium text-[var(--ink)]">
              Will&apos;s Briefing
            </p>
            <p className="font-source-serif text-[11px] italic text-[var(--ink-3)]">
              Bekijk je persoonlijke dagbriefing &rarr;
            </p>
          </div>
        </Link>

        {/* Editorial empty state */}
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="font-source-serif text-lg italic text-[var(--ink-3)]">
            Geen berichten &mdash; stilte is ook een vorm van rijkdom
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
      <Masthead />

      {/* Cross-link to Will's briefing */}
      <Link
        href="/daishboard"
        className="mb-6 flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 shadow-[var(--s0)] transition-shadow hover:shadow-[var(--s1)]"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wil-100">
          <Sparkles className="h-4 w-4 text-wil-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-inter text-xs font-medium text-[var(--ink)]">
            Will&apos;s Briefing
          </p>
          <p className="font-source-serif text-[11px] italic text-[var(--ink-3)]">
            Bekijk je persoonlijke dagbriefing &rarr;
          </p>
        </div>
      </Link>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 font-inter text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s0)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#b33a2e] px-1 font-inter text-[10px] font-bold text-white">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Meldingen tab */}
      {activeTab === 'meldingen' && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-3">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Recente meldingen
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
              >
                <CheckCheck className="h-3 w-3" />
                Alles gelezen
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
              <Bell className="h-8 w-8 text-[var(--ink-4)]" />
              <p className="font-inter text-sm text-[var(--ink-3)]">
                Geen meldingen.
              </p>
              <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                &ldquo;Stilte is ook een vorm van rijkdom.&rdquo;
              </p>
            </div>
          ) : (
            <div>
              {/* Urgent */}
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

              {/* Today */}
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

              {/* Earlier */}
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
        </div>
      )}

      {/* Nieuws tab */}
      {activeTab === 'nieuws' && (
        <div className="space-y-3">
          {RELEASE_NOTES.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-8 py-16 text-center shadow-[var(--s0)]">
              <Newspaper className="h-8 w-8 text-[var(--ink-4)]" />
              <p className="font-inter text-sm text-[var(--ink-3)]">
                Nog geen release notes beschikbaar.
              </p>
            </div>
          ) : (
            RELEASE_NOTES.map((release, i) => (
              <ReleaseNoteCard key={release.version} release={release} defaultExpanded={i === 0} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
