'use client'

import { useState, useEffect, useCallback } from 'react'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import { acquireOverlay } from '@/lib/overlay-signal'
import { useNotifications } from './notification-provider'
import { NotificationRows } from './notification-bundle'
import { X, ChevronRight } from 'lucide-react'
import type { Notification } from '@/app/api/notifications/route'

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

  const dayNames = [
    'zondag',
    'maandag',
    'dinsdag',
    'woensdag',
    'donderdag',
    'vrijdag',
    'zaterdag',
  ]

  if (diffDays < 7) return dayNames[date.getDay()]

  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
  })
}

function getDayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

type DayGroup = {
  label: string
  key: string
  notifications: Notification[]
}

// ── Collapsible day section ──────────────────────────────────────────

function CollapsedDayGroup({
  group,
  markAsRead,
  closeModal,
}: {
  group: DayGroup
  markAsRead: (id: string) => void
  closeModal: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="font-[family-name:var(--font-source-serif)] text-[13px] capitalize italic text-[var(--ink-3)]">
          {group.label}
        </span>
        <span className="font-[family-name:var(--font-inter)] text-[11px] text-[var(--ink-4)]">
          — {group.notifications.length} {group.notifications.length === 1 ? 'bericht' : 'berichten'}
        </span>
      </button>
      {expanded && (
        <div>
          <NotificationRows
            items={group.notifications}
            onRead={markAsRead}
            onClose={closeModal}
          />
        </div>
      )}
    </div>
  )
}

// ── Modal Component ──────────────────────────────────────────────────

export function NotificationModal() {
  const {
    history,
    unreadCount,
    loading,
    isModalOpen,
    closeModal,
    markAsRead,
    markAllRead,
    refresh,
  } = useNotifications()

  // Lock body scroll when modal is open
  useScrollLock(isModalOpen)

  // Verberg de zwevende nav-pill zolang de meldingen-modal open is (ADR 0039).
  // Bewust géén BottomSheet-migratie: bespoke krant-masthead met chat-sidebar-
  // offset (`right: var(--chat-sidebar-width)`), top-verankerd op mobiel en
  // read-only backdrop-dismiss — een sheet zou dat gedrag wijzigen. Alleen het
  // pill-signaal wordt gedeeld met het overlay-systeem.
  useEffect(() => {
    if (!isModalOpen) return
    return acquireOverlay()
  }, [isModalOpen])

  // Verse data bij openen — de achtergrond-poll loopt op 10 min (egress-
  // reductie), dus het moment van openen is hét moment om te verversen.
  useEffect(() => {
    if (isModalOpen) refresh()
  }, [isModalOpen, refresh])

  // Close on Escape
  useEffect(() => {
    if (!isModalOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isModalOpen, closeModal])

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeModal()
    },
    [closeModal]
  )

  if (!isModalOpen) return null

  // ── Partition notifications ────────────────────────────────────────
  // Urgent: priority <= 2 AND unread
  const urgent = history.filter((n) => n.priority <= 2 && !n.read)
  const urgentIds = new Set(urgent.map((n) => n.id))
  const normal = history.filter((n) => !urgentIds.has(n.id))

  // Group normal notifications by day
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

  // ── Formatted dateline ─────────────────────────────────────────────
  const now = new Date()
  const dateline = now.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const totalCount = history.length

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] pt-16 sm:items-center sm:pt-0 transition-[right] duration-300"
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      onClick={handleBackdrop}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-[var(--s2)] sm:max-h-[80vh]">
        {/* ── Masthead ───────────────────────────────────────── */}
        <div className="border-b-2 border-[var(--ink)] px-5 pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-inter)] text-[11px] font-bold uppercase tracking-[.1em] text-[var(--ink)]">
                Meldingen
              </h2>
              <p className="mt-0.5 font-[family-name:var(--font-source-serif)] text-[13px] italic text-[var(--ink-3)]">
                {dateline} — {totalCount} {totalCount === 1 ? 'bericht' : 'berichten'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-[var(--r-sm)] p-1.5 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
              aria-label="Sluiten"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
            </div>
          ) : history.length === 0 ? (
            /* ── Empty state ───────────────────────────────── */
            <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
              <p className="font-[family-name:var(--font-inter)] text-[14px] text-[var(--ink-3)]">
                Geen nieuwe berichten.
              </p>
              <p className="font-[family-name:var(--font-source-serif)] text-[13px] italic text-[var(--ink-4)]">
                &ldquo;Stilte is ook een vorm van rijkdom.&rdquo;
              </p>
            </div>
          ) : (
            <div>
              {/* ── DRINGEND sectie ──────────────────────────── */}
              {urgent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#b33a2e]" />
                      <span className="font-[family-name:var(--font-inter)] text-[10px] font-bold uppercase tracking-[.1em] text-[#b33a2e]">
                        Dringend
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="font-[family-name:var(--font-inter)] text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
                      >
                        Alles gelezen
                      </button>
                    )}
                  </div>
                  <NotificationRows items={urgent} onRead={markAsRead} onClose={closeModal} />
                </div>
              )}

              {/* ── VANDAAG sectie ───────────────────────────── */}
              {todayItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-5 py-2">
                    <span className="font-[family-name:var(--font-inter)] text-[10px] font-bold uppercase tracking-[.1em] text-[var(--ink-3)]">
                      Vandaag
                    </span>
                    {urgent.length === 0 && unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="font-[family-name:var(--font-inter)] text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
                      >
                        Alles gelezen
                      </button>
                    )}
                  </div>
                  <NotificationRows items={todayItems} onRead={markAsRead} onClose={closeModal} />
                </div>
              )}

              {/* ── EERDER secties (collapsed) ───────────────── */}
              {earlierGroups.length > 0 && (
                <div>
                  <div className="border-b border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-5 py-2">
                    <span className="font-[family-name:var(--font-inter)] text-[10px] font-bold uppercase tracking-[.1em] text-[var(--ink-3)]">
                      Eerder
                    </span>
                  </div>
                  {earlierGroups.map((group) => (
                    <CollapsedDayGroup
                      key={group.key}
                      group={group}
                      markAsRead={markAsRead}
                      closeModal={closeModal}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t-2 border-[var(--ink)] px-5 py-3">
          <span className="font-[family-name:var(--font-source-serif)] text-[11px] italic text-[var(--ink-4)]">
            afgelopen 7 dagen
          </span>
          <div className="flex items-center gap-4">
            <a
              href="/berichten"
              onClick={closeModal}
              className="font-[family-name:var(--font-source-serif)] text-[11px] italic text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            >
              Bekijk alles &rarr;
            </a>
            <a
              href="/mijn/notificaties"
              onClick={closeModal}
              className="font-[family-name:var(--font-source-serif)] text-[11px] italic text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            >
              Instellingen &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
