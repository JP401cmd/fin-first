'use client'

import { useState, useEffect, useCallback } from 'react'
import { History, ChevronRight, Calendar, X, ArrowLeft } from 'lucide-react'
import type { BriefingCardSpec } from '@/lib/briefing/types'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import { BriefingCardGrid } from './briefing-card-grid'

// ── localStorage-based briefing history ──────────────────────────────
// Primary storage for briefing history. Each completed briefing is appended
// to this array. The database (when migration is applied) serves as optional
// cross-device sync.

const HISTORY_KEY = 'briefing_history'
const MAX_HISTORY = 30 // Keep last 30 briefings

export interface StoredBriefing {
  id: string
  composedAt: string
  cards: BriefingCardSpec[]
}

/** Save a briefing to local history */
export function saveBriefingToLocalHistory(cards: BriefingCardSpec[], composedAt: string): void {
  try {
    const existing = readLocalHistory()
    // Deduplicate by composedAt
    if (existing.some(b => b.composedAt === composedAt)) return

    const entry: StoredBriefing = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      composedAt,
      cards,
    }
    // Prepend (newest first), limit to MAX_HISTORY
    const updated = [entry, ...existing].slice(0, MAX_HISTORY)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  } catch { /* quota / SSR */ }
}

/** Read all briefings from local history */
function readLocalHistory(): StoredBriefing[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredBriefing[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch { /* SSR / storage errors */ }
  return []
}

// ── Helper functions ─────────────────────────────────────────────────

interface BriefingHistoryItem {
  id: string
  composedAt: string
  cardCount: number
  preview: string
}

function briefingToItem(b: StoredBriefing): BriefingHistoryItem {
  let preview = ''
  for (const card of b.cards) {
    // Cast via `unknown` om compiler-warning te vermijden — BriefingCardSpec
    // is een discriminated union zonder index-signature; runtime-shape
    // ondersteunt wel string-key access voor de checks hieronder.
    const c = card as unknown as Record<string, unknown>
    if (c.type === 'insight' && typeof c.text === 'string') {
      preview = (c.text as string).slice(0, 100)
      break
    }
    if (c.type === 'metric' && typeof c.label === 'string') {
      preview = `${c.label}: ${c.value ?? ''}`
      break
    }
  }
  return {
    id: b.id,
    composedAt: b.composedAt,
    cardCount: b.cards.length,
    preview,
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    // Compare local calendar dates (not UTC) to avoid timezone edge cases
    const dLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((nowLocal.getTime() - dLocal.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Vandaag'
    if (diffDays === 1) return 'Gisteren'
    if (diffDays < 7) return `${diffDays} dagen geleden`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weken geleden`
    return formatDate(iso)
  } catch {
    return iso
  }
}

// ── Component ────────────────────────────────────────────────────────

interface BriefingHistoryProps {
  data: DashboardData
}

export function BriefingHistory({ data }: BriefingHistoryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<BriefingHistoryItem[]>([])
  const [allBriefings, setAllBriefings] = useState<StoredBriefing[]>([])
  const [selectedBriefing, setSelectedBriefing] = useState<StoredBriefing | null>(null)

  // Load history from localStorage on open
  const loadHistory = useCallback(() => {
    const history = readLocalHistory()
    setAllBriefings(history)
    setItems(history.map(briefingToItem))
  }, [])

  // Also try to sync from server (optional — works when migration is applied)
  const syncFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/briefing/history?limit=30')
      if (!res.ok) return
      const result = await res.json()
      if (!result.items?.length) return

      // Merge server items with local history (server has IDs, use composedAt for dedup)
      const localHistory = readLocalHistory()
      const localDates = new Set(localHistory.map(b => b.composedAt))

      // For items that are only on the server, we'd need to fetch their full cards
      // For now, we just note that server sync is available
      const serverOnlyCount = result.items.filter(
        (item: { composedAt: string }) => !localDates.has(item.composedAt)
      ).length

      if (serverOnlyCount > 0) {
        // Server has briefings not in localStorage — could fetch them
        // For now, the local history is authoritative
      }
    } catch { /* silent — server sync is optional */ }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadHistory()
      syncFromServer()
    }
  }, [isOpen, loadHistory, syncFromServer])

  const handleOpen = () => setIsOpen(true)
  const handleClose = () => {
    setIsOpen(false)
    setSelectedBriefing(null)
  }
  const handleBack = () => setSelectedBriefing(null)
  const handleSelect = (id: string) => {
    const briefing = allBriefings.find(b => b.id === id)
    if (briefing) setSelectedBriefing(briefing)
  }

  // Closed state — just the link button
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="group flex items-center gap-2 text-[11px] text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors"
        aria-label="Vorige briefings bekijken"
      >
        <History className="h-3.5 w-3.5" />
        <span className="underline-offset-2 group-hover:underline">Vorige briefings</span>
        <ChevronRight className="h-3 w-3 opacity-60" />
      </button>
    )
  }

  // Detail view — showing a specific past briefing
  if (selectedBriefing) {
    return (
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Terug</span>
          </button>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--ink-4)]">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(selectedBriefing.composedAt)}</span>
            <span>&middot;</span>
            <span>{formatTime(selectedBriefing.composedAt)}</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] transition-colors"
            aria-label="Sluiten"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 sm:px-6">
          <BriefingCardGrid cards={selectedBriefing.cards} data={data} />
        </div>
      </div>
    )
  }

  // List view — showing all past briefings
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-4 py-3">
        <History className="h-4 w-4 text-[var(--ink-3)]" />
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Vorige briefings
        </h3>
        {items.length > 0 && (
          <span className="text-[10px] text-[var(--ink-4)] font-mono tabular-nums">
            {items.length}
          </span>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] transition-colors"
          aria-label="Sluiten"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <History className="h-8 w-8 text-[var(--ink-4)] mb-3 opacity-50" />
          <p className="text-sm text-[var(--ink-3)]">
            Nog geen eerdere briefings
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">
            Je briefings worden automatisch bewaard zodra ze zijn samengesteld.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-ed)]">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleSelect(item.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--subtle)] transition-colors"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)]">
                  <Calendar className="h-4 w-4 text-[var(--ink-3)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[var(--ink)]">
                      {formatRelative(item.composedAt)}
                    </span>
                    <span className="text-[10px] text-[var(--ink-4)] font-mono tabular-nums">
                      {formatTime(item.composedAt)}
                    </span>
                  </div>
                  {item.preview && (
                    <p className="mt-0.5 text-[11px] text-[var(--ink-3)] line-clamp-1">
                      {item.preview}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                    {item.cardCount} kaarten
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] mt-1" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
