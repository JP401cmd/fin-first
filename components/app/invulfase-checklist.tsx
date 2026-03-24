'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Check, Circle, CircleDot, Undo2, MoreHorizontal,
  Sparkles, ChevronDown,
} from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import type { InvulfaseStatus } from '@/lib/invulfase-items'

// ── API response types ───────────────────────────────────────

interface ChecklistItem {
  key: string
  title: string
  description: string
  href: string
  weight: number
  status: InvulfaseStatus
}

interface ChecklistCategory {
  key: string
  label: string
  conditional: boolean
  items: ChecklistItem[]
}

interface ChecklistResponse {
  categories: ChecklistCategory[]
  progress: {
    completed: number
    total: number
    skipped: number
    percentage: number
  }
}

// ── Helpers ──────────────────────────────────────────────────

function categoryProgress(items: ChecklistItem[]): { done: number; total: number } {
  let done = 0
  for (const item of items) {
    if (item.status === 'complete' || item.status === 'skipped') done++
  }
  return { done, total: items.length }
}

// ── Status icon component ────────────────────────────────────

function StatusIcon({ status }: { status: InvulfaseStatus }) {
  switch (status) {
    case 'complete':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-income-100">
          <Check className="h-3 w-3 text-income-600" />
        </div>
      )
    case 'partial':
      return <CircleDot className="h-5 w-5 text-horizon-600" />
    case 'skipped':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--subtle)]">
          <Check className="h-3 w-3 text-[var(--ink-4)]" />
        </div>
      )
    default:
      return <Circle className="h-5 w-5 text-[var(--ink-4)]" />
  }
}

// ── Checklist item row ───────────────────────────────────────

function ChecklistItemRow({
  item,
  onSkip,
}: {
  item: ChecklistItem
  onSkip: (key: string, skipped: boolean) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isSkipped = item.status === 'skipped'
  const isComplete = item.status === 'complete'

  const content = (
    <>
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${
          isComplete ? 'text-[var(--ink-3)]' :
          isSkipped ? 'text-[var(--ink-4)] line-through' :
          'text-[var(--ink-2)] group-hover:text-[var(--ink)]'
        }`}>
          {item.title}
        </p>
        {isSkipped ? (
          <p className="mt-0.5 text-xs text-[var(--ink-4)]">Overgeslagen</p>
        ) : (
          <p className={`mt-0.5 truncate text-xs ${
            item.status === 'partial' ? 'text-horizon-700' : 'text-[var(--ink-4)]'
          }`}>
            {item.status === 'partial' ? 'Deels gevuld' : item.description}
          </p>
        )}
      </div>
    </>
  )

  if (isSkipped) {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-3 py-2.5">
        {content}
        <button
          onClick={() => onSkip(item.key, false)}
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] sm:h-auto sm:w-auto sm:p-1"
          aria-label="Terugzetten"
          title="Terugzetten"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-3 py-2.5">
        {content}
      </div>
    )
  }

  return (
    <div className="flex min-h-[44px] items-center gap-1">
      <Link
        href={item.href}
        className="group flex min-h-[44px] flex-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-kern-50/50"
      >
        {content}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-kern-500" />
      </Link>
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[var(--subtle)]/60 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] sm:h-auto sm:w-auto sm:bg-transparent sm:p-1.5"
          aria-label="Opties"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-lg">
              <button
                role="menuitem"
                onClick={() => { onSkip(item.key, true); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                Niet van toepassing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Collapsible category ─────────────────────────────────────

function CategorySection({
  cat,
  onSkip,
  defaultOpen,
}: {
  cat: ChecklistCategory
  onSkip: (key: string, skipped: boolean) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const prog = categoryProgress(cat.items)
  const allDone = prog.done === prog.total

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-1.5 text-left"
      >
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-4)] transition-transform ${open ? 'rotate-180' : ''}`} />
        <span className="label-editorial flex-1 text-[var(--ink-3)]">
          {cat.label}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${
          allDone
            ? 'bg-income-100 text-income-700'
            : 'bg-[var(--subtle)] text-[var(--ink-4)]'
        }`}>
          {prog.done}/{prog.total}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
          {cat.items.map((item, idx) => (
            <div key={item.key}>
              {idx > 0 && <div className="mx-3 border-t border-[var(--border-ed)]" />}
              <ChecklistItemRow item={item} onSkip={onSkip} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main checklist component ─────────────────────────────────

export function InvulfaseChecklist() {
  const [data, setData] = useState<ChecklistResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const { needsActivation } = useFeatureAccess()

  const fetchChecklist = useCallback(async () => {
    try {
      const res = await fetch('/api/invulfase/checklist')
      const json = await res.json()
      if (Array.isArray(json.categories) && json.progress) {
        setData(json)
      } else {
        console.warn('[invulfase-checklist] Unexpected API response:', json)
      }
    } catch (err) {
      console.warn('[invulfase-checklist] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (needsActivation) fetchChecklist()
    else setLoading(false)
  }, [needsActivation, fetchChecklist])

  const handleSkip = useCallback(async (key: string, skipped: boolean) => {
    setData(prev => {
      if (!prev) return prev
      const categories = prev.categories.map(cat => ({
        ...cat,
        items: cat.items.map(item =>
          item.key === key ? { ...item, status: (skipped ? 'skipped' : 'empty') as InvulfaseStatus } : item
        ),
      }))
      let completedWeight = 0
      let totalWeight = 0
      let skippedWeight = 0
      for (const cat of categories) {
        for (const item of cat.items) {
          totalWeight += item.weight
          if (item.status === 'complete') completedWeight += item.weight
          if (item.status === 'skipped') skippedWeight += item.weight
        }
      }
      const applicableWeight = totalWeight - skippedWeight
      const percentage = applicableWeight > 0 ? Math.round((completedWeight / applicableWeight) * 100) : 100
      return {
        categories,
        progress: { completed: completedWeight, total: totalWeight, skipped: skippedWeight, percentage },
      }
    })

    await fetch('/api/invulfase/skip', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, skipped }),
    })
  }, [])

  // Only show during pre-activation phase
  if (!needsActivation || loading) return null
  if (!data || data.categories.length === 0) return null

  return (
    <div className="card-editorial animate-fade-up mb-6 overflow-hidden border-l-3 border-kern-400 hover:translate-y-0 hover:shadow-none">
      {/* Clickable header — toggles expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kern-100">
          <Sparkles className="h-4.5 w-4.5 text-kern-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-semibold text-[var(--ink)]">
            Welkom bij TriFinity!
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            Vul je gegevens aan voor de beste inzichten.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-kern-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-kern-700">
            {data.progress.percentage}%
          </span>
          <ChevronDown className={`h-4 w-4 text-[var(--ink-4)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="border-t border-[var(--border-ed)] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-kern-500 motion-safe:transition-all motion-safe:duration-500"
                style={{ width: `${data.progress.percentage}%` }}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="mt-4 space-y-3">
            {data.categories.map((cat, catIdx) => {
              const prog = categoryProgress(cat.items)
              // Default open: first category with incomplete items
              const hasIncomplete = prog.done < prog.total
              const isFirstIncomplete = hasIncomplete && data.categories.slice(0, catIdx).every(
                c => categoryProgress(c.items).done === categoryProgress(c.items).total
              )
              return (
                <CategorySection
                  key={cat.key}
                  cat={cat}
                  onSkip={handleSkip}
                  defaultOpen={isFirstIncomplete}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
