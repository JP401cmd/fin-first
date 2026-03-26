'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import type { SuggestedEvent } from '@/components/app/horizon/whatif-suggestion-cards'
import { isSignificantDelta, buildSuggestionPrompt } from '@/lib/whatif-suggestions'

interface UseWhatIfSuggestionsOptions {
  overrides: WhatIfOverrides | null
  baseline: WhatIfOverrides | null
  fireAgeDelta: number | null
  activeEventNames: string[]
  debounceMs?: number
}

interface UseWhatIfSuggestionsResult {
  suggestions: SuggestedEvent[]
  loading: boolean
  dismiss: (index: number) => void
  dismissAll: () => void
}

export function useWhatIfSuggestions({
  overrides,
  baseline,
  fireAgeDelta,
  activeEventNames,
  debounceMs = 2000,
}: UseWhatIfSuggestionsOptions): UseWhatIfSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dismiss suggestions on any slider change so stale results never linger.
  useEffect(() => {
    setSuggestions([])
  }, [overrides])

  // Debounced fetch — only fires when the delta is significant enough to warrant AI suggestions.
  useEffect(() => {
    if (!overrides || !baseline) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (!isSignificantDelta(overrides, baseline, fireAgeDelta)) return

      // Abort any in-flight request before issuing a new one.
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const prompt = buildSuggestionPrompt({
          overrides,
          baseline,
          fireAgeDelta,
          activeEventNames,
        })

        const res = await fetch('/api/whatif/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })

        if (res.ok) {
          const data = await res.json()
          if (!controller.signal.aborted) {
            setSuggestions(data.suggestions ?? [])
          }
        }
      } catch (err) {
        // Aborted requests are expected — swallow them silently.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // All other errors degrade silently; suggestions are non-critical.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [overrides, baseline, fireAgeDelta, activeEventNames, debounceMs])

  // Abort any pending request and clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const dismiss = useCallback((index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index))
  }, [])

  const dismissAll = useCallback(() => {
    setSuggestions([])
  }, [])

  return { suggestions, loading, dismiss, dismissAll }
}
