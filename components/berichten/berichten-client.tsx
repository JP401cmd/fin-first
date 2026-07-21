'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { NotificationItem } from '@/components/app/notifications/notification-item'
import { DensityToggle, useListDensity, type ListDensity } from '@/components/app/density-toggle'
import { Bell, ChevronRight, CheckCheck, Newspaper } from 'lucide-react'
import { Masthead } from './masthead'
import { NewspaperFooter } from './newspaper-footer'
import { SectionHeading } from './section-heading'
import type { Notification } from '@/app/api/notifications/route'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'

// Het berichtencentrum toont een ruimer venster dan de bel-dropdown (7 dagen):
// hier komt alles samen wat de gebruiker de afgelopen maand ontving.
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

type FilterMode = 'all' | 'unread'

// ── Sub-section bar inside the notices column ────────────────────────

function GroupBar({ label, tone }: { label: string; tone?: 'urgent' | 'todo' }) {
  const dot =
    tone === 'urgent' ? 'bg-[#b33a2e]' : tone === 'todo' ? 'bg-amber-500' : null
  const text =
    tone === 'urgent'
      ? 'text-[#b33a2e]'
      : tone === 'todo'
        ? 'text-amber-600'
        : 'text-[var(--ink-3)]'
  return (
    <div className="flex items-center gap-2 border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-4 py-2">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      <span className={`font-inter text-[10px] font-bold uppercase tracking-[.1em] ${text}`}>
        {label}
      </span>
    </div>
  )
}

// ── Collapsible day group (used in the "Eerder" section) ─────────────

function CollapsedDayGroup({
  group,
  markAsRead,
  density,
}: {
  group: DayGroup
  markAsRead: (id: string) => void
  density: ListDensity
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
              density={density}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main client component ────────────────────────────────────────────

export function BerichtenClient() {
  const pathname = usePathname()
  const pageInfoText = (pathname && PAGE_INFO[pathname]) || PAGE_INFO['/berichten']

  const { unreadCount, markAsRead, refresh } = useNotifications()

  const [history, setHistory] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterMode>('all')
  // Ruim/compact-dichtheid (M-08) — per-apparaat bewaard, eigen lijst-key.
  const { density, setDensity } = useListDensity('berichten-lijst')

  // ── Extended (30-day) history — wider window than the bell dropdown ──
  const fetchExtendedHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?days=${BERICHTEN_HISTORY_DAYS}`)
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.history ?? [])
    } catch {
      // Silent fail — progressive enhancement
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExtendedHistory()
  }, [fetchExtendedHistory])

  // ── Read-state handlers (keep local history + provider badge in sync) ─
  const handleMarkAsRead = useCallback((id: string) => {
    setHistory((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    markAsRead(id)
  }, [markAsRead])

  const handleMarkAllRead = useCallback(() => {
    // The provider only knows the last 7 days, so mark every unread item in
    // the 30-day window in a single PATCH (the union avoids a read-modify-
    // write race), then refresh the provider so the bell badge resyncs.
    const unreadIds = history.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })))
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: unreadIds }),
    })
      .then(() => refresh())
      .catch(() => {})
  }, [history, refresh])

  // ── Counts ──────────────────────────────────────────────────────────
  // De weergegeven teller consumeert de canonieke `unreadCount` uit de
  // NotificationProvider — exact dezelfde bron (7-daags live venster) als de
  // bel-badge en het sidebar-aantal. Zo tonen alle 3 de oppervlakken hetzelfde
  // getal ("consume, don't recompute" — WF-WILL-11). Bewuste trade-off (optie
  // A): structureel al-langer-onbekeken items (briefing/WOZ/pensioen/oudere
  // partner-tx) buiten het 7-daagse venster tellen niet meer mee in de teller.
  const displayUnread = unreadCount
  // `historyUnread` blijft de daadwerkelijk ongelezen items in de 30-daagse
  // lijst die deze pagina toont — stuurt alleen de lijst-actie ("Alles gelezen"),
  // niet de teller.
  const historyUnread = history.filter((n) => !n.read).length
  const totalCount = history.length

  // ── Partition (filter → urgent / today / earlier) ───────────────────
  const showItem = (n: Notification) => filter === 'all' || !n.read

  // Urgent = high-priority AND unread — always relevant in both filters.
  const urgent = history.filter((n) => n.priority <= 2 && !n.read)
  const urgentIds = new Set(urgent.map((n) => n.id))
  const normal = history.filter((n) => !urgentIds.has(n.id) && showItem(n))

  const todayItems: Notification[] = []
  const earlierGroups: DayGroup[] = []
  const earlierGroupMap = new Map<string, DayGroup>()

  for (const n of normal) {
    if (isToday(n.createdAt)) {
      todayItems.push(n)
    } else {
      const key = getDayKey(n.createdAt)
      if (!earlierGroupMap.has(key)) {
        const group: DayGroup = { key, label: formatDayLabel(n.createdAt), notifications: [] }
        earlierGroupMap.set(key, group)
        earlierGroups.push(group)
      }
      earlierGroupMap.get(key)!.notifications.push(n)
    }
  }

  const hasVisibleItems =
    urgent.length > 0 || todayItems.length > 0 || earlierGroups.length > 0

  const metaLeft =
    totalCount === 0
      ? 'Geen berichten'
      : displayUnread > 0
        ? `${displayUnread} ongelezen`
        : 'Alles gelezen'

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
      <PageInfoButton
        description={pageInfoText}
        className="absolute right-4 top-5 sm:right-6 sm:top-8"
      />
      <Masthead metaLeft={metaLeft} />

      <section className="mt-2">
        <SectionHeading label="Meldingen" />

        {/* ── Controls: filter + alles-gelezen ─────────────────────── */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div
            className="inline-flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1"
            role="tablist"
            aria-label="Filter berichten"
          >
            {([
              { key: 'all' as const, label: 'Alles' },
              { key: 'unread' as const, label: 'Ongelezen' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-1.5 text-[12px] font-semibold transition-colors sm:min-h-0 ${
                  filter === key
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {label}
                {key === 'unread' && displayUnread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-wil-500 px-1 font-inter text-[10px] font-bold text-white">
                    {displayUnread}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <DensityToggle density={density} onChange={setDensity} />
            )}
            {historyUnread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 py-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Alles gelezen
              </button>
            )}
          </div>
        </div>

        {/* ── Notices column ───────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] py-16 shadow-[var(--s0)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-8 py-16 text-center shadow-[var(--s0)]">
            <Bell className="h-8 w-8 text-[var(--ink-4)]" />
            <p className="font-inter text-sm text-[var(--ink-3)]">Geen meldingen</p>
            <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
              Je bent helemaal bij — geen openstaande berichten.
            </p>
            {/* CTA — user-cleared empty state hoort een uitweg te bieden. */}
            <Link
              href="/nieuws"
              className="mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <Newspaper className="h-4 w-4" />
              Lees de krant
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]">
            {/* Dringend */}
            {urgent.length > 0 && (
              <div>
                <GroupBar label="Dringend" tone="urgent" />
                {urgent.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={handleMarkAsRead}
                    onClose={() => {}}
                    density={density}
                  />
                ))}
              </div>
            )}

            {/* Vandaag */}
            {todayItems.length > 0 && (
              <div>
                <GroupBar label="Vandaag" />
                {todayItems.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={handleMarkAsRead}
                    onClose={() => {}}
                    density={density}
                  />
                ))}
              </div>
            )}

            {/* Eerder */}
            {earlierGroups.length > 0 && (
              <div>
                <GroupBar label="Eerder" />
                {earlierGroups.map((group) => (
                  <CollapsedDayGroup
                    key={group.key}
                    group={group}
                    markAsRead={handleMarkAsRead}
                    density={density}
                  />
                ))}
              </div>
            )}

            {/* Filter = ongelezen, maar niets ongelezen over */}
            {!hasVisibleItems && (
              <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
                <CheckCheck className="h-7 w-7 text-[var(--ink-4)]" />
                <p className="font-inter text-sm text-[var(--ink-3)]">Geen ongelezen berichten.</p>
                <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                  Je bent helemaal bij.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <NewspaperFooter />
    </div>
  )
}
