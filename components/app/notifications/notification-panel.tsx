'use client'

import { useEffect, useCallback } from 'react'
import { useNotifications } from './notification-provider'
import { NotificationItem } from './notification-item'
import { Bell, Check, X } from 'lucide-react'
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

type DayGroup = {
  label: string
  key: string
  notifications: Notification[]
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
  } = useNotifications()

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isModalOpen])

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

  // Group history by day
  const groups: DayGroup[] = []
  const groupMap = new Map<string, DayGroup>()

  for (const n of history) {
    const key = getDayKey(n.createdAt)
    if (!groupMap.has(key)) {
      const group: DayGroup = {
        key,
        label: formatDayLabel(n.createdAt),
        notifications: [],
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    groupMap.get(key)!.notifications.push(n)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 sm:items-center sm:pt-0 transition-[right] duration-300"
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      onClick={handleBackdrop}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-2xl sm:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--ink-2)]" />
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Meldingen
            </h2>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-[var(--ink-2)]"
              >
                <Check className="h-3.5 w-3.5" />
                Alles gelezen
              </button>
            )}
            <button
              onClick={closeModal}
              className="rounded-lg p-1.5 text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-[var(--ink-2)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
                <Bell className="h-7 w-7 text-[var(--ink-4)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">
                  Geen meldingen
                </p>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Alles is op orde — er zijn geen aandachtspunten
                </p>
              </div>
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <div key={group.key}>
                  {/* Day separator */}
                  <div className="sticky top-0 z-10 border-b border-[var(--border-ed)] bg-[var(--subtle)]/90 px-5 py-2 backdrop-blur-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                      {group.label}
                    </span>
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {group.notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRead={markAsRead}
                        onClose={closeModal}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div className="border-t border-[var(--border-ed)] px-5 py-3 text-center">
                <p className="text-xs text-[var(--ink-3)]">
                  Meldingen van de afgelopen 7 dagen
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
