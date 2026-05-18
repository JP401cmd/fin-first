'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { BriefingCardSpec, BriefingComposeResponse, TemporalContext, PreviousBriefingSummary, BriefingLongTermMemory, CardModule } from '@/lib/briefing/types'
import { condenseDashboardData } from '@/lib/briefing/condense'
import { getVisitedFeaturesLocal } from '@/components/app/discover-carousel'
import { logCardEngagement } from '@/lib/briefing/engagement'
import { buildUserPreferenceBlock, persistFeedback, logVisitTimestamp, readVisitTimestamps, detectBriefingFrequency, readBriefingCadence, saveBriefingCadence, getStaleThresholdMs, type BriefingCadence } from '@/lib/briefing/user-preferences'
import { loadPreviousSnapshot, saveSnapshot, buildSnapshot, detectProgressionEvents } from '@/lib/briefing/progression'
import { updateSeasonalSnapshot } from '@/lib/briefing/seasonal'
import { BriefingHeader } from './briefing-header'
import { BriefingCardGrid } from './briefing-card-grid'
import { BriefingComposingIndicator } from './briefing-skeleton'
import { BriefingFooter } from './briefing-footer'
import { BriefingStaleBanner } from './briefing-stale-banner'

interface Props {
  data: DashboardData
  temporal: TemporalContext
  userName?: string
  aiEnabled?: boolean
}

import { saveBriefingToLocalHistory } from './briefing-history'

/** Persist a completed briefing to history (localStorage + optional server) */
function saveBriefingToHistory(cards: BriefingCardSpec[], composedAt: string): void {
  // Primary: localStorage (immediate, no dependency on migration)
  saveBriefingToLocalHistory(cards, composedAt)
  // Secondary: server-side persistence (for cross-device sync, when migration is applied)
  fetch('/api/briefing/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards, composedAt }),
  }).catch(() => { /* non-critical — silent fail */ })
}

/** Stable cache key — v3 breaks old sessionStorage cache intentionally */
const CACHE_KEY = 'briefing_v3'

/** Key for previous briefing summary (session continuity) */
const PREVIOUS_KEY = 'briefing_previous'

/** Key for long-term briefing memory (cross-session via localStorage) */
const LONG_TERM_KEY = 'briefing_memory'

/** Extract key metrics from completed briefing cards */
function extractKeyMetrics(cards: BriefingCardSpec[]): Record<string, string> {
  const metrics: Record<string, string> = {}
  for (const card of cards) {
    if (card.type === 'metric') {
      metrics[card.label] = card.value
      if (card.delta) metrics[`${card.label}_delta`] = card.delta
    } else if (card.type === 'progressRing') {
      metrics[card.label] = card.value
    } else if (card.type === 'milestone') {
      metrics[card.label] = `${card.percentage}%`
    }
  }
  return metrics
}

/** Save a summary of the completed briefing for next-session continuity */
function saveBriefingSummary(cards: BriefingCardSpec[], composedAt: string): void {
  try {
    const summary: PreviousBriefingSummary = {
      composedAt,
      cardTypes: cards.map(c => c.type),
      keyMetrics: extractKeyMetrics(cards),
    }
    sessionStorage.setItem(PREVIOUS_KEY, JSON.stringify(summary))
  } catch { /* quota / SSR */ }
}

/** Read previous briefing summary (if any) */
function readPreviousBriefing(): PreviousBriefingSummary | null {
  try {
    const raw = sessionStorage.getItem(PREVIOUS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PreviousBriefingSummary
  } catch { /* SSR / storage errors */ }
  return null
}

/** Read long-term briefing memory from localStorage */
function readLongTermMemory(): BriefingLongTermMemory | null {
  try {
    const raw = localStorage.getItem(LONG_TERM_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BriefingLongTermMemory
  } catch { /* SSR / storage errors */ }
  return null
}

/** Update long-term briefing memory in localStorage after each briefing */
function updateLongTermMemory(
  cards: BriefingCardSpec[],
  composedAt: string,
  data: DashboardData,
): void {
  try {
    const existing = readLongTermMemory()

    // Extract insight/tip texts (max 50 chars each)
    const newAdvice: string[] = cards
      .filter(c => c.type === 'insight' && (c.emphasis === 'observation' || c.emphasis === 'tip'))
      .map(c => (c as { text: string }).text.slice(0, 50))

    // Merge with existing advice history, keep last 5
    const prevAdvice = existing?.adviceHistory ?? []
    const mergedAdvice = [...prevAdvice, ...newAdvice].slice(-5)

    // Compute savings rate from data
    const income = data.monthlyIncome ?? 0
    const expenses = data.monthlyExpenses ?? 0
    const savingsRate = income > 0
      ? Math.round(((income - expenses) / income) * 100)
      : 0

    const memory: BriefingLongTermMemory = {
      lastBriefingDate: composedAt,
      lastNetWorth: Math.round(data.netWorth ?? 0),
      lastSavingsRate: savingsRate,
      lastFreedomPct: Math.round(data.freedomPct ?? 0),
      briefingCount: (existing?.briefingCount ?? 0) + 1,
      adviceHistory: mergedAdvice,
    }
    localStorage.setItem(LONG_TERM_KEY, JSON.stringify(memory))
  } catch { /* quota / SSR */ }
}

/** Compact hash of key financial metrics for cache invalidation */
function hashDashboardData(data: DashboardData): string {
  const bt = data.budgetTotals
  const expense = bt?.expense ?? { spent: 0, limit: 0 }
  const income = bt?.income ?? { spent: 0, limit: 0 }
  const parts = [
    Math.round(data.netWorth ?? 0),
    Math.round(data.totalAssets ?? 0),
    Math.round(data.totalDebts ?? 0),
    Math.round(data.monthlyExpenses ?? 0),
    Math.round(data.monthlyIncome ?? 0),
    Math.round(expense.spent),
    Math.round(expense.limit),
    Math.round(income.spent),
    data.openActions ?? 0,
    Math.round(data.freedomPct ?? 0),
  ]
  return parts.join('|')
}

interface CachedBriefing extends BriefingComposeResponse {
  dataHash?: string
}

/** Read cache synchronously — called during initial render, not in an effect.
 *  Cache is now persistent (localStorage). No TTL or hash invalidation —
 *  the user decides when to refresh via the stale-banner or footer button. */
function readCache(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedBriefing
    if (!parsed.cards?.length) return null
    return parsed
  } catch { /* SSR / storage errors */ }
  return null
}

export function DAIshboard({ data, temporal, userName, aiEnabled = true }: Props) {
  const [cards, setCards] = useState<BriefingCardSpec[]>([])
  const [composedAt, setComposedAt] = useState('')
  const [composing, setComposing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [polling, setPolling] = useState(false)
  const [cachedHash, setCachedHash] = useState<string | undefined>(undefined)
  const [cadence, setCadence] = useState<BriefingCadence>('daily')
  const controllerRef = useRef<AbortController | null>(null)
  const hasFetchedRef = useRef(false)

  // Compute data hash for stale-banner data-changed detection
  const dataHash = hashDashboardData(data)

  // Log visit timestamp on mount for briefing frequency detection
  useEffect(() => {
    logVisitTimestamp()
  }, [])

  // Read cache and cadence after hydration but before paint — avoids hydration
  // mismatch while preventing a flash of the composing indicator for cached briefings
  useLayoutEffect(() => {
    setCadence(readBriefingCadence())
    const cached = readCache()
    if (cached) {
      setCards(cached.cards)
      setComposedAt(cached.composedAt)
      setCachedHash(cached.dataHash)
      setComposing(false)
      hasFetchedRef.current = true
    }
  }, [])

  const phase = data.currentPhaseId
  const level = data.sovereigntyLevel

  const streamFromAI = useCallback((isRefresh = false) => {
    // Detect progression events by comparing with previous snapshot
    const previousSnapshot = loadPreviousSnapshot()
    const currentSnapshot = buildSnapshot(
      data.sovereigntyLevel ?? 0,
      data.freedomPct ?? 0,
      data.hasConsumerDebt ?? false,
      data.netWorth ?? 0,
      data.monthsCovered ?? 0,
    )
    const progressionEvents = detectProgressionEvents(previousSnapshot, currentSnapshot)
    // Save current snapshot for next briefing comparison
    saveSnapshot(currentSnapshot)

    // Extract phase transition info for prominent AI instruction
    const phaseTransitionEvent = progressionEvents.find(e => e.type === 'phase_transition')
    const phaseTransition = phaseTransitionEvent
      ? { previousPhase: String(phaseTransitionEvent.previousValue), currentPhase: String(phaseTransitionEvent.currentValue) }
      : undefined

    const visitedFeatures = typeof window !== 'undefined' ? getVisitedFeaturesLocal() : new Set<string>()
    const dataSummary = condenseDashboardData(data, temporal, progressionEvents, visitedFeatures)

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    if (isRefresh) {
      setRefreshing(true)
      setCards([])
      setError(null)
    }
    setComposing(true)

    // Read previous briefing summary for continuity
    const previousBriefing = readPreviousBriefing()
    // Read long-term memory for cross-session context
    const longTermMemory = readLongTermMemory()
    // Build user preference block from engagement + feedback data
    const userPreferences = buildUserPreferenceBlock()
    // Detect briefing frequency from visit history
    const visitTimestamps = readVisitTimestamps()
    const briefingFrequency = detectBriefingFrequency(visitTimestamps)

    fetch('/api/briefing/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSummary, temporal, phase, level, previousBriefing, longTermMemory, userPreferences, phaseTransition, briefingFrequency }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.status === 'composing') {
          setPolling(true)
          return
        }

        // Direct error from preparation phase
        if (result.type === 'error' || result.error) {
          setError(result.message ?? result.error ?? 'AI compositie mislukt')
          setComposing(false)
          setRefreshing(false)
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        console.error('[DAIshboard] Compose request failed:', err)
        setError('Verbinding met Will mislukt. Probeer het opnieuw.')
        setComposing(false)
        setRefreshing(false)
      })
  }, [data, temporal, phase, level])

  // Only fetch from AI on mount if there was no valid cache hit
  useEffect(() => {
    if (!aiEnabled) {
      setComposing(false)
      return
    }
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    streamFromAI()
    return () => {
      controllerRef.current?.abort()
      hasFetchedRef.current = false
    }
  }, [streamFromAI, aiEnabled])

  // Poll for background composition — handles partial cards progressively
  useEffect(() => {
    if (!polling) return
    const poll = async () => {
      try {
        const res = await fetch('/api/briefing/compose')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.status === 'composing') {
          // Show partial cards as they arrive
          if (result.cards?.length && result.cards.length > cards.length) {
            setCards(result.cards)
          }
          return // Keep polling
        }

        if (result.type === 'done') {
          // Final set (layout-validated, possibly reordered)
          setCards(result.cards)
          setComposedAt(result.composedAt)
          setComposing(false)
          setRefreshing(false)
          setPolling(false)
          // Cache the complete response with data hash in localStorage
          try {
            const cacheData: CachedBriefing = {
              cards: result.cards,
              composedAt: result.composedAt,
              source: 'ai',
              dataHash,
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
            setCachedHash(dataHash)
          } catch { /* quota */ }
          // Save briefing summary for next-briefing continuity
          saveBriefingSummary(result.cards, result.composedAt)
          // Update long-term memory in localStorage
          updateLongTermMemory(result.cards, result.composedAt, data)
          // Update seasonal snapshot for year-over-year comparisons
          updateSeasonalSnapshot(temporal.month, temporal.year, data.monthlyExpenses ?? 0, data.monthlyIncome ?? 0)
          // Persist to server-side history for /will briefing archive
          saveBriefingToHistory(result.cards, result.composedAt)
        } else if (result.type === 'error') {
          setError(result.message)
          setComposing(false)
          setRefreshing(false)
          setPolling(false)
        }
      } catch (err) {
        console.error('[DAIshboard] Poll failed:', err)
        setError('Verbinding met Will mislukt. Probeer het opnieuw.')
        setComposing(false)
        setRefreshing(false)
        setPolling(false)
      }
    }
    const interval = setInterval(poll, 2500)
    return () => clearInterval(interval)
  }, [polling, data, dataHash, temporal, cards.length])

  const handleRefresh = useCallback(() => {
    try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
    setPolling(false)
    streamFromAI(true)
  }, [streamFromAI])

  const handleRetry = useCallback(() => {
    setError(null)
    setCards([])
    setPolling(false)
    streamFromAI()
  }, [streamFromAI])

  const handleCardEngage = useCallback((cardType: string, module: string | undefined) => {
    logCardEngagement(cardType, module as CardModule | undefined)
  }, [])

  /** Key for per-session card feedback storage */
  const FEEDBACK_KEY = 'briefing_feedback'

  const handleCadenceChange = useCallback((newCadence: BriefingCadence) => {
    setCadence(newCadence)
    saveBriefingCadence(newCadence)
  }, [])

  const handleFeedback = useCallback((cardIndex: number, cardType: string, positive: boolean) => {
    try {
      const raw = sessionStorage.getItem(FEEDBACK_KEY)
      const existing = raw ? (JSON.parse(raw) as { cardIndex: number; cardType: string; positive: boolean; timestamp: string }[]) : []
      existing.push({ cardIndex, cardType, positive, timestamp: new Date().toISOString() })
      sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing))
    } catch { /* quota / SSR */ }
    // Also persist to localStorage for long-term preference building
    persistFeedback(cardType, positive)
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <BriefingHeader temporal={temporal} userName={userName} cadence={cadence} onCadenceChange={handleCadenceChange} />

      {!aiEnabled ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          </div>
          <h3 className="text-sm font-semibold text-[var(--ink-2)]">AI-features zijn uitgeschakeld</h3>
          <p className="mt-1 max-w-sm text-xs text-[var(--ink-3)]">
            Je kunt AI weer inschakelen via Instellingen &gt; Privacy &amp; AI. Zonder AI werkt de app als puur financieel dashboard.
          </p>
        </div>
      ) : error && cards.length === 0 ? (
        <>
          <BriefingCardGrid cards={cards} data={data} onCardEngage={handleCardEngage} onFeedback={handleFeedback} />
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-[var(--ink-3)] mb-3">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-sm font-medium text-wil-600 hover:text-wil-700 transition-colors"
            >
              Opnieuw proberen
            </button>
          </div>
        </>
      ) : cards.length === 0 && composing ? (
        <BriefingComposingIndicator />
      ) : (
        <>
          {composing && (
            <div className="mb-4 text-center">
              <p className="text-xs text-[var(--ink-4)] animate-pulse">Will stelt je briefing samen...</p>
            </div>
          )}
          {!composing && composedAt && (Date.now() - new Date(composedAt).getTime()) >= getStaleThresholdMs(cadence) && (
            <BriefingStaleBanner
              composedAt={composedAt}
              dataChanged={cachedHash !== undefined && cachedHash !== dataHash}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              cadence={cadence}
            />
          )}
          <BriefingCardGrid cards={cards} data={data} onCardEngage={handleCardEngage} onFeedback={handleFeedback} />
          {!composing && composedAt && (
            <BriefingFooter composedAt={composedAt} source="ai" onRefresh={handleRefresh} refreshing={refreshing} cadence={cadence} onCadenceChange={handleCadenceChange} />
          )}
        </>
      )}
    </div>
  )
}
