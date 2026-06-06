import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoachSuggestion } from './use-coach-suggestion'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

vi.mock('next/navigation', () => ({ usePathname: () => '/overzicht' }))

const fullGaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

describe('useCoachSuggestion', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('levert na delayMs de eerste open data-gap', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 1000 }),
    )
    expect(result.current.suggestion).toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('dismiss bewaart de key en verbergt de suggestie', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    act(() => { result.current.dismiss() })
    expect(result.current.suggestion).toBeNull()
    expect(localStorage.getItem('trifinity_coach_dismissed_suggestions')).toContain('gap_bank')
  })
})
