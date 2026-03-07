'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { BriefingCardSpec, BriefingComposeResponse, BriefingSSEEvent, TemporalContext } from '@/lib/briefing/types'
import { condenseDashboardData } from '@/lib/briefing/condense'
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
    const dataSummary = condenseDashboardData(data, temporal)

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    if (isRefresh) {
      setRefreshing(true)
      setCards([])
      setError(null)
    }
    setComposing(true)

    fetch('/api/briefing/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSummary, temporal, phase, level }),
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
          <BriefingCardGrid cards={cards} data={data} />
          {!composing && composedAt && (
            <BriefingFooter composedAt={composedAt} source="ai" onRefresh={handleRefresh} refreshing={refreshing} />
          )}
        </>
      )}
    </div>
  )
}
