'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, Lock } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { DISCOVER_ITEMS, getVisitedFeaturesLocal, markFeatureVisitedLocal, type DiscoverItem } from '@/components/app/discover-carousel'
import { DEFAULT_MATRIX, PHASES } from '@/lib/feature-phases'

/* ── Constants ─────────────────────── */

const DISCOVER_MODULE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  kern:    { bg: 'bg-kern-50',  border: 'border-kern-200', text: 'text-kern-700',  dot: 'bg-kern-400' },
  wil:     { bg: 'bg-wil-50',   border: 'border-wil-200',  text: 'text-wil-700',   dot: 'bg-wil-400' },
  horizon: { bg: 'bg-horizon-50', border: 'border-horizon-200', text: 'text-horizon-700', dot: 'bg-horizon-400' },
}

const MODULE_LABELS: Record<string, string> = {
  kern: 'De Kern',
  wil: 'De Wil',
  horizon: 'De Horizon',
}

/* ── Helpers ─────────────────────── */

/** Determine the first phase where a feature becomes available */
function getUnlockPhase(featureId: string): string | null {
  const matrix = DEFAULT_MATRIX[featureId]
  if (!matrix) return null
  for (const phase of PHASES) {
    if (matrix[phase.id]) return phase.id
  }
  return null
}

/* ── Component ─────────────────────── */

export function OntdekkenSection() {
  const { features, phase } = useFeatureAccess()
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setVisited(getVisitedFeaturesLocal())
    setMounted(true)
  }, [])

  if (!mounted) return null

  const currentPhaseIndex = PHASES.findIndex(p => p.id === phase)

  // Available but unvisited features
  const availableItems = DISCOVER_ITEMS.filter(item => {
    if (features[item.id] === false) return false
    if (visited.has(item.id)) return false
    return true
  })

  // Almost-unlocked: features in the next phase that are not currently available
  const nextPhase = currentPhaseIndex < PHASES.length - 1 ? PHASES[currentPhaseIndex + 1] : null
  const comingSoonItems: (DiscoverItem & { unlockPhaseLabel: string })[] = nextPhase
    ? DISCOVER_ITEMS
        .filter(item => {
          if (features[item.id] !== false) return false // already accessible
          const unlockPhase = getUnlockPhase(item.id)
          return unlockPhase === nextPhase.id
        })
        .map(item => ({ ...item, unlockPhaseLabel: nextPhase.label }))
    : []

  // Combine: available unvisited first, then coming soon, max 6
  const cards: { item: DiscoverItem; isComingSoon: boolean; unlockPhaseLabel?: string }[] = [
    ...availableItems.map(item => ({ item, isComingSoon: false })),
    ...comingSoonItems.map(({ unlockPhaseLabel, ...item }) => ({ item, isComingSoon: true, unlockPhaseLabel })),
  ].slice(0, 6)

  if (cards.length === 0) return null

  function handleClick(featureId: string) {
    markFeatureVisitedLocal(featureId)
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: featureId }),
    }).catch(() => {})
    setVisited(prev => new Set([...prev, featureId]))
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--ink-3)]" />
        <h2 className="label-editorial text-[var(--ink-3)]">Ontdekken</h2>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map(({ item, isComingSoon }) => {
          const colors = DISCOVER_MODULE_COLORS[item.module]

          if (isComingSoon) {
            return (
              <div
                key={item.id}
                className="relative flex flex-col rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-3 opacity-60"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-zinc-300" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    {MODULE_LABELS[item.module]}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[var(--ink-3)]">
                  {item.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-4)]">
                  {item.description}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-[var(--ink-4)]" />
                  <span className="text-[10px] font-medium text-[var(--ink-4)]">
                    Binnenkort beschikbaar
                  </span>
                </div>
              </div>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => handleClick(item.id)}
              className={`group flex flex-col rounded-[var(--r)] border p-3 transition-all hover:shadow-md ${colors.border} ${colors.bg}`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
                  {MODULE_LABELS[item.module]}
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {item.label}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
                {item.description}
              </p>
              <span className={`mt-auto pt-2 text-[11px] font-medium ${colors.text} opacity-0 transition-opacity group-hover:opacity-100`}>
                Probeer het &rarr;
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
