'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

interface DiscoverItem {
  id: string
  label: string
  description: string
  href: string
  teaser: string
  module: 'kern' | 'wil' | 'horizon'
}

/** All discoverable features mapped to pages */
const DISCOVER_ITEMS: DiscoverItem[] = [
  // Kern
  { id: 'vermogensverloop',      label: 'Vermogensverloop',       description: 'Net worth snapshots en grafiek', href: '/core', teaser: 'Wist je dat je je vermogen over tijd kunt volgen?',              module: 'kern' },
  { id: 'snapshot_vergelijking', label: 'Snapshot Vergelijking',  description: 'Vergelijk twee periodes',       href: '/core', teaser: 'Wist je dat je snapshots naast elkaar kunt vergelijken?',       module: 'kern' },
  { id: 'box3_belasting',       label: 'Box 3 Belasting',        description: 'Vermogensbelasting berekening',  href: '/core/belasting', teaser: 'Wist je dat je je Box 3 belasting kunt berekenen?',   module: 'kern' },
  { id: 'cashflow_sankey',      label: 'Cashflow Diagram',       description: 'Sankey inkomen-flow visualisatie', href: '/core/budgets', teaser: 'Wist je dat je je geldstromen visueel kunt volgen?',  module: 'kern' },
  { id: 'data_export',          label: 'Data Export',             description: 'CSV export van al je data',      href: '/core', teaser: 'Wist je dat je al je data kunt exporteren als CSV?',          module: 'kern' },
  // Wil
  { id: 'nibud_benchmark',      label: 'NIBUD Benchmark',        description: 'Vergelijking met richtlijnen',   href: '/will', teaser: 'Wist je dat je je budget kunt vergelijken met NIBUD?',        module: 'wil' },
  { id: 'doelen_systeem',       label: 'Doelen Systeem',         description: 'Financiele doelen instellen',     href: '/will', teaser: 'Wist je dat je financiele doelen kunt instellen en volgen?',  module: 'wil' },
  { id: 'beslissingspatronen',  label: 'Beslissingspatronen',    description: 'Vrijheidsdagen per actie-type',   href: '/will', teaser: 'Wist je dat je kunt zien welke acties de meeste impact hebben?', module: 'wil' },
  // Horizon
  { id: 'fire_projecties',      label: 'FIRE Projecties',        description: 'Pad naar financiele vrijheid',    href: '/horizon', teaser: 'Wist je dat je je pad naar FIRE kunt simuleren?',         module: 'horizon' },
  { id: 'fire_scenario_analyse', label: 'Scenario Analyse',      description: 'Drie paden naar vrijheid',        href: '/horizon', teaser: 'Wist je dat je drie scenario\'s kunt vergelijken?',       module: 'horizon' },
  { id: 'monte_carlo',          label: 'Monte Carlo Simulaties', description: '1.000 simulaties draaien',        href: '/horizon', teaser: 'Wist je dat je Monte Carlo simulaties kunt draaien?',     module: 'horizon' },
  { id: 'levensgebeurtenissen', label: 'Levensgebeurtenissen',   description: 'Plan life events en zie impact',  href: '/horizon', teaser: 'Wist je dat je levensgebeurtenissen kunt plannen?',       module: 'horizon' },
  { id: 'withdrawal_strategie', label: 'Opnamestrategie',        description: 'Hoe je vermogen opneemt',         href: '/horizon', teaser: 'Wist je dat je verschillende opnamestrategieen kunt vergelijken?', module: 'horizon' },
  { id: 'veerkracht_score',     label: 'Veerkracht Analyse',     description: 'Resilience score 0-100',          href: '/horizon', teaser: 'Wist je dat je een veerkrachtscore hebt?',               module: 'horizon' },
]

const MODULE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  kern:    { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  dot: 'bg-amber-400' },
  wil:     { bg: 'bg-teal-50',   border: 'border-teal-200',  text: 'text-teal-700',   dot: 'bg-teal-400' },
  horizon: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-400' },
}

const STORAGE_KEY = 'discover_visited_features'

function getVisitedFeaturesLocal(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function markFeatureVisitedLocal(featureId: string) {
  try {
    const visited = getVisitedFeaturesLocal()
    visited.add(featureId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]))
  } catch {
    // localStorage not available
  }
}

/** Sync visited features from the database API */
async function fetchVisitedFromApi(): Promise<Set<string>> {
  try {
    const res = await fetch('/api/feature-visits')
    if (!res.ok) return new Set()
    const data = await res.json()
    if (data.visits && Array.isArray(data.visits)) {
      return new Set(data.visits.map((v: { feature_slug: string }) => v.feature_slug))
    }
    return new Set()
  } catch {
    return new Set()
  }
}

/** Record a feature visit to the database API */
async function recordVisitToApi(featureSlug: string): Promise<void> {
  try {
    await fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: featureSlug }),
    })
  } catch {
    // Silently fail — localStorage is the fallback
  }
}

interface DiscoverCarouselProps {
  /** Filter to show only features for a specific module */
  module?: 'kern' | 'wil' | 'horizon'
}

export function DiscoverCarousel({ module }: DiscoverCarouselProps) {
  const { features } = useFeatureAccess()
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    // Load from localStorage first (instant)
    setVisited(getVisitedFeaturesLocal())
    setMounted(true)

    // Then sync from API (async, merges with localStorage)
    fetchVisitedFromApi().then(apiVisited => {
      if (apiVisited.size > 0) {
        setVisited(prev => {
          const merged = new Set([...prev, ...apiVisited])
          // Sync API results back to localStorage
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...merged]))
          } catch { /* ignore */ }
          return merged
        })
      }
    })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function updateScroll() {
      if (!el) return
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    updateScroll()
    el.addEventListener('scroll', updateScroll, { passive: true })
    return () => el.removeEventListener('scroll', updateScroll)
  }, [mounted])

  if (!mounted) return null

  // Filter items: only show accessible features, optionally filtered by module
  // Exclude the current module's features that are already visible on the page
  const items = DISCOVER_ITEMS.filter(item => {
    // Only show features that are accessible (not explicitly false)
    if (features[item.id] === false) return false
    // Filter by module if specified
    if (module && item.module === module) return false // Don't show current module's features
    return true
  })

  // Sort: unvisited first, visited last (faded)
  const sorted = [...items].sort((a, b) => {
    const aVisited = visited.has(a.id) ? 1 : 0
    const bVisited = visited.has(b.id) ? 1 : 0
    return aVisited - bVisited
  })

  if (sorted.length === 0) return null

  function scroll(direction: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = el.clientWidth * 0.7
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
  }

  function handleClick(featureId: string) {
    markFeatureVisitedLocal(featureId)
    recordVisitToApi(featureId) // Fire-and-forget — don't block navigation
    setVisited(prev => new Set([...prev, featureId]))
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-zinc-400" />
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Ontdek
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Scroll links"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Scroll rechts"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sorted.map(item => {
          const isVisited = visited.has(item.id)
          const colors = MODULE_COLORS[item.module]

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => handleClick(item.id)}
              className={`group flex w-[260px] shrink-0 flex-col rounded-xl border p-4 transition-all hover:shadow-md ${
                isVisited
                  ? 'border-zinc-100 bg-zinc-50/50 opacity-60 hover:opacity-80'
                  : `${colors.border} ${colors.bg} hover:shadow-${item.module === 'kern' ? 'amber' : item.module === 'wil' ? 'teal' : 'purple'}-100`
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isVisited ? 'bg-zinc-300' : colors.dot}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isVisited ? 'text-zinc-400' : colors.text}`}>
                  {item.module === 'kern' ? 'De Kern' : item.module === 'wil' ? 'De Wil' : 'De Horizon'}
                </span>
              </div>
              <p className={`text-sm font-semibold ${isVisited ? 'text-zinc-500' : 'text-zinc-900'}`}>
                {item.label}
              </p>
              <p className={`mt-1 text-xs leading-relaxed ${isVisited ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {isVisited ? item.description : item.teaser}
              </p>
              {!isVisited && (
                <span className={`mt-auto pt-3 text-[11px] font-medium ${colors.text} opacity-0 transition-opacity group-hover:opacity-100`}>
                  Ontdekken &rarr;
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
