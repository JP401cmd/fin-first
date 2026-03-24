'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, ArrowRight, Sparkles } from 'lucide-react'

interface ChecklistItem {
  key: string
  title: string
  href: string
  status: string
}

interface ChecklistCategory {
  items: ChecklistItem[]
}

interface ChecklistResponse {
  categories: ChecklistCategory[]
  progress: {
    percentage: number
  }
}

export function InvulfaseBanner({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive)
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    if (!active) return
    fetch('/api/invulfase/checklist')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.categories) && data.progress) {
          setChecklist(data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [active])

  const handleDismiss = useCallback(async () => {
    setDismissing(true)
    try {
      await fetch('/api/invulfase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      })
      setActive(false)
    } catch {
      setActive(false)
    } finally {
      setDismissing(false)
    }
  }, [])

  if (!active) return null

  if (loading) {
    return (
      <div className="border-b border-kern-200 bg-kern-50/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-medium text-kern-700">
              Invulfase laden...
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Find first incomplete item across all categories
  let nextItem: ChecklistItem | null = null
  if (checklist) {
    for (const cat of checklist.categories) {
      for (const item of cat.items) {
        if (item.status === 'empty' || item.status === 'partial') {
          nextItem = item
          break
        }
      }
      if (nextItem) break
    }
  }

  // If no pending items, auto-dismiss
  if (checklist && !nextItem) return null

  const progressPct = checklist?.progress.percentage ?? 0

  return (
    <div className="border-b border-kern-200 bg-gradient-to-r from-kern-50 to-kern-50/60">
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kern-100">
              <Sparkles className="h-3.5 w-3.5 text-kern-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-kern-800">
                  Invulfase
                </span>
                <span className="rounded-full bg-kern-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-kern-600">
                  {progressPct}%
                </span>
              </div>
              {nextItem && (
                <p className="mt-0.5 truncate text-xs text-kern-600">
                  Volgende stap: {nextItem.title}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Progress bar (compact) */}
            <div className="hidden w-20 sm:block">
              <div className="h-1.5 overflow-hidden rounded-full bg-kern-200">
                <div
                  className="h-full rounded-full bg-kern-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Next step link */}
            {nextItem && (
              <Link
                href={nextItem.href}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg bg-kern-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-kern-700 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5"
              >
                <span className="hidden sm:inline">Volgende stap</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="-mr-2 flex h-[44px] w-[44px] items-center justify-center rounded-md text-kern-400 transition-colors hover:bg-kern-100 hover:text-kern-600 disabled:opacity-50 sm:mr-0 sm:h-auto sm:w-auto sm:p-1"
              aria-label="Invulfase afronden"
              title="Invulfase afronden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
