import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoachSuggestion } from './use-coach-suggestion'
import { PATH_SUGGESTION_COOLDOWN_MS, type CoachDataGaps } from '@/lib/coach-suggestions'

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

  it('houdt een route-tip tegen binnen de rustpauze na een dismissal (H17)', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    localStorage.setItem('trifinity_coach_last_dismissed_at', String(Date.now() - 60_000))
    const { result } = renderHook(() => useCoachSuggestion({ dataGaps: fullGaps(), delayMs: 0 }))
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion).toBeNull()
  })

  it('toont de route-tip weer zodra de rustpauze voorbij is (H17)', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    localStorage.setItem('trifinity_coach_last_dismissed_at', String(Date.now() - PATH_SUGGESTION_COOLDOWN_MS - 1))
    const { result } = renderHook(() => useCoachSuggestion({ dataGaps: fullGaps(), delayMs: 0 }))
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('path_core')
  })

  it('laat een data-gap-tip ongemoeid binnen de rustpauze (H17)', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    localStorage.setItem('trifinity_coach_last_dismissed_at', String(Date.now() - 60_000))
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('legt het sluitmoment vast voor de rustpauze (H17)', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss() })
    expect(Number(localStorage.getItem('trifinity_coach_last_dismissed_at'))).toBe(Date.now())
  })

  it('toont geen nieuwe suggestie na dismiss (dismissedThisMount-guard)', () => {
    const { result, rerender } = renderHook(
      ({ gaps }) => useCoachSuggestion({ dataGaps: gaps, delayMs: 0 }),
      { initialProps: { gaps: fullGaps({ hasBank: false }) } },
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    act(() => { result.current.dismiss() })
    rerender({ gaps: fullGaps({ hasBank: false, hasAssets: false }) })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion).toBeNull()
  })
})
