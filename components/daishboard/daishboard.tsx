'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { BriefingCardSpec, BriefingComposeResponse, BriefingSSEEvent, TemporalContext, PreviousBriefingSummary, BriefingLongTermMemory, CardModule } from '@/lib/briefing/types'
import { condenseDashboardData } from '@/lib/briefing/condense'
import { logCardEngagement } from '@/lib/briefing/engagement'
import { buildUserPreferenceBlock, persistFeedback } from '@/lib/briefing/user-preferences'
import { loadPreviousSnapshot, saveSnapshot, buildSnapshot, detectProgressionEvents } from '@/lib/briefing/progression'
import { BriefingHeader } from './briefing-header'
import { BriefingCardGrid } from './briefing-card-grid'
import { BriefingComposingIndicator } from './briefing-skeleton'
import { BriefingFooter } from './briefing-footer'

interface Props {
  data: DashboardData
  temporal: TemporalContext
  userName?: string
}

/** Cache TTL: 2 hours */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

/** Stable cache key */
const CACHE_KEY = 'briefing_v2'

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
    const savingsRate = data.monthlyIncome > 0
      ? Math.round(((data.monthlyIncome - data.monthlyExpenses) / data.monthlyIncome) * 100)
      : 0

    const memory: BriefingLongTermMemory = {
      lastBriefingDate: composedAt,
      lastNetWorth: Math.round(data.netWorth),
      lastSavingsRate: savingsRate,
      lastFreedomPct: Math.round(data.freedomPct),
      briefingCount: (existing?.briefingCount ?? 0) + 1,
      adviceHistory: mergedAdvice,
    }
    localStorage.setItem(LONG_TERM_KEY, JSON.stringify(memory))
  } catch { /* quota / SSR */ }
}

/** Compact hash of key financial metrics for cache invalidation */
function hashDashboardData(data: DashboardData): string {
  const parts = [
    Math.round(data.netWorth),
    Math.round(data.totalAssets),
    Math.round(data.totalDebts),
    Math.round(data.monthlyExpenses),
    Math.round(data.monthlyIncome),
    Math.round(data.budgetTotals.expense.spent),
    Math.round(data.budgetTotals.expense.limit),
    Math.round(data.budgetTotals.income.spent),
    data.openActions,
    Math.round(data.freedomPct),
  ]
  return parts.join('|')
}

interface CachedBriefing extends BriefingComposeResponse {
  dataHash?: string
}

/** Read cache synchronously — called during initial render, not in an effect */
function readCache(currentHash: string): BriefingComposeResponse | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedBriefing
    const age = Date.now() - new Date(parsed.composedAt).getTime()
    // Invalidate if TTL expired, no cards, or data has changed
    if (age >= CACHE_TTL_MS || parsed.cards.length === 0) return null
    if (parsed.dataHash && parsed.dataHash !== currentHash) return null
    return parsed
  } catch { /* SSR / storage errors */ }
  return null
}

/** Parse SSE text buffer into events, returns remaining unparsed text */
function parseSSEBuffer(buffer: string, onEvent: (event: BriefingSSEEvent) => void): string {
  const lines = buffer.split('\n')
  let remaining = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // If this is the last line and doesn't end with a newline, it's incomplete
    if (i === lines.length - 1 && !buffer.endsWith('\n')) {
      remaining = line
      break
    }

    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6)) as BriefingSSEEvent
        onEvent(data)
      } catch { /* malformed JSON, skip */ }
    }
  }

  return remaining
}

export function DAIshboard({ data, temporal, userName }: Props) {
  const [cards, setCards] = useState<BriefingCardSpec[]>([])
  const [composedAt, setComposedAt] = useState('')
  const [composing, setComposing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const hasFetchedRef = useRef(false)

  // Compute data hash for cache invalidation
  const dataHash = hashDashboardData(data)

  // Read cache after hydration but before paint — avoids hydration mismatch
  // while preventing a flash of the composing indicator for cached briefings
  useLayoutEffect(() => {
    const cached = readCache(dataHash)
    if (cached) {
      setCards(cached.cards)
      setComposedAt(cached.composedAt)
      setComposing(false)
      hasFetchedRef.current = true
    }
  }, [dataHash])

  const phase = data.currentPhaseId
  const level = data.sovereigntyLevel

  const streamFromAI = useCallback((isRefresh = false) => {
    // Detect progression events by comparing with previous snapshot
    const previousSnapshot = loadPreviousSnapshot()
    const currentSnapshot = buildSnapshot(
      data.sovereigntyLevel,
      data.freedomPct,
      data.hasConsumerDebt,
      data.netWorth,
      data.monthsCovered,
    )
    const progressionEvents = detectProgressionEvents(previousSnapshot, currentSnapshot)
    // Save current snapshot for next briefing comparison
    saveSnapshot(currentSnapshot)

    // Extract phase transition info for prominent AI instruction
    const phaseTransitionEvent = progressionEvents.find(e => e.type === 'phase_transition')
    const phaseTransition = phaseTransitionEvent
      ? { previousPhase: String(phaseTransitionEvent.previousValue), currentPhase: String(phaseTransitionEvent.currentValue) }
      : undefined

    const dataSummary = condenseDashboardData(data, temporal, progressionEvents)

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

    fetch('/api/briefing/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSummary, temporal, phase, level, previousBriefing, longTermMemory, userPreferences }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.body) throw new Error('No response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const streamedCards: BriefingCardSpec[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          buffer = parseSSEBuffer(buffer, (event) => {
            switch (event.type) {
              case 'card':
                streamedCards.push(event.spec)
                setCards([...streamedCards])
                break
              case 'done':
                setComposedAt(event.composedAt)
                setComposing(false)
                setRefreshing(false)
                // Cache the complete response with data hash
                try {
                  const cacheData: CachedBriefing = {
                    cards: streamedCards,
                    composedAt: event.composedAt,
                    source: 'ai',
                    dataHash,
                  }
                  sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
                } catch { /* quota */ }
                // Save briefing summary for next-briefing continuity
                saveBriefingSummary(streamedCards, event.composedAt)
                // Update long-term memory in localStorage
                updateLongTermMemory(streamedCards, event.composedAt, data)
                break
              case 'error':
                setError(event.message)
                setComposing(false)
                setRefreshing(false)
                break
            }
          })
        }

        // If stream ended without a done event, mark composing as false
        if (streamedCards.length > 0) {
          setComposing(false)
          setRefreshing(false)
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        console.error('[DAIshboard] Stream failed:', err)
        setError('Verbinding met Will mislukt. Probeer het opnieuw.')
        setComposing(false)
        setRefreshing(false)
      })
  }, [data, temporal, phase, level])

  // Only fetch from AI on mount if there was no valid cache hit
  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    streamFromAI()
    return () => controllerRef.current?.abort()
  }, [streamFromAI])

  const handleRefresh = useCallback(() => {
    try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
    streamFromAI(true)
  }, [streamFromAI])

  const handleRetry = useCallback(() => {
    setError(null)
    setCards([])
    streamFromAI()
  }, [streamFromAI])

  const handleCardEngage = useCallback((cardType: string, module: string | undefined) => {
    logCardEngagement(cardType, module as CardModule | undefined)
  }, [])

  /** Key for per-session card feedback storage */
  const FEEDBACK_KEY = 'briefing_feedback'

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
      <BriefingHeader temporal={temporal} userName={userName} />

      {error && cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--ink-3)] mb-3">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-sm font-medium text-wil-600 hover:text-wil-700 transition-colors"
          >
            Opnieuw proberen
          </button>
        </div>
      ) : cards.length === 0 && composing ? (
        <BriefingComposingIndicator />
      ) : (
        <>
          {composing && (
            <div className="mb-4 text-center">
              <p className="text-xs text-[var(--ink-4)] animate-pulse">Will stelt je briefing samen...</p>
            </div>
          )}
          <BriefingCardGrid cards={cards} data={data} onCardEngage={handleCardEngage} onFeedback={handleFeedback} />
          {!composing && composedAt && (
            <BriefingFooter composedAt={composedAt} source="ai" onRefresh={handleRefresh} refreshing={refreshing} />
          )}
        </>
      )}
    </div>
  )
}
