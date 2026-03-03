'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { BriefingCardSpec, BriefingComposeResponse, TemporalContext } from '@/lib/briefing/types'
import { condenseDashboardData } from '@/lib/briefing/condense'
import { composeBriefingFallback } from '@/lib/briefing/fallback'
import { BriefingHeader } from './briefing-header'
import { BriefingCardGrid } from './briefing-card-grid'
import { BriefingSkeleton } from './briefing-skeleton'
import { BriefingFooter } from './briefing-footer'

interface Props {
  data: DashboardData
  temporal: TemporalContext
  userName?: string
}

/** Cache TTL: 2 hours */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

/** Stable cache key — ignores minor data fluctuations within same session */
const CACHE_KEY = 'briefing_v1'

export function DAIshboard({ data, temporal, userName }: Props) {
  const [cards, setCards] = useState<BriefingCardSpec[] | null>(null)
  const [composedAt, setComposedAt] = useState<string>('')
  const [source, setSource] = useState<'ai' | 'fallback'>('ai')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  const phase = data.currentPhaseId
  const level = data.sovereigntyLevel

  const useFallback = useCallback(() => {
    const fallbackCards = composeBriefingFallback(data, temporal)
    setCards(fallbackCards)
    setComposedAt(new Date().toISOString())
    setSource('fallback')
    setLoading(false)
    setRefreshing(false)
  }, [data, temporal])

  const fetchBriefing = useCallback((force = false) => {
    // Check session cache (2 hour TTL)
    if (!force) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as BriefingComposeResponse
          const age = Date.now() - new Date(parsed.composedAt).getTime()
          if (age < CACHE_TTL_MS && parsed.cards.length > 0) {
            setCards(parsed.cards)
            setComposedAt(parsed.composedAt)
            setSource(parsed.source)
            setLoading(false)
            return
          }
        }
      } catch {
        // Ignore session storage errors
      }
    }

    if (force) setRefreshing(true)

    const dataSummary = condenseDashboardData(data, temporal)

    // Abort previous in-flight request
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    fetch('/api/briefing/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSummary, temporal, phase, level }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<BriefingComposeResponse>
      })
      .then(result => {
        if (result.cards.length === 0) {
          useFallback()
          return
        }

        setCards(result.cards)
        setComposedAt(result.composedAt)
        setSource(result.source)
        setLoading(false)
        setRefreshing(false)

        // Persist to session storage
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(result))
        } catch {
          // Ignore quota errors
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        console.error('[DAIshboard] AI compose failed, using fallback:', err)
        useFallback()
      })
  }, [data, temporal, phase, level, useFallback])

  // Initial load: use cache or fetch
  useEffect(() => {
    fetchBriefing(false)
    return () => controllerRef.current?.abort()
  }, [fetchBriefing])

  const handleRefresh = useCallback(() => {
    // Clear cache and re-fetch from AI
    try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
    fetchBriefing(true)
  }, [fetchBriefing])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <BriefingHeader temporal={temporal} userName={userName} />

      {loading || !cards ? (
        <BriefingSkeleton />
      ) : (
        <>
          {refreshing && (
            <div className="mb-4 text-center">
              <p className="text-xs text-[var(--ink-4)] animate-pulse">Will stelt je briefing opnieuw samen...</p>
            </div>
          )}
          <BriefingCardGrid cards={cards} data={data} />
          <BriefingFooter composedAt={composedAt} source={source} onRefresh={handleRefresh} refreshing={refreshing} />
        </>
      )}
    </div>
  )
}
