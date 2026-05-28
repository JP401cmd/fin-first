import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInsightVisibility, useHiddenInsights } from './use-insight-visibility'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useInsightVisibility', () => {
  it('defaults to visible', () => {
    const { result } = renderHook(() => useInsightVisibility('compound-insight'))
    expect(result.current.visible).toBe(true)
  })

  it('hide() schrijft id naar localStorage en zet visible op false', () => {
    const { result } = renderHook(() => useInsightVisibility('compound-insight'))
    act(() => result.current.hide())
    expect(result.current.visible).toBe(false)
    const stored = JSON.parse(window.localStorage.getItem('tf-insight-hidden') ?? '[]')
    expect(stored).toContain('compound-insight')
  })

  it('twee instances voor verschillende ids zijn onafhankelijk', () => {
    const a = renderHook(() => useInsightVisibility('compound-insight'))
    const b = renderHook(() => useInsightVisibility('fee-impact'))
    act(() => a.result.current.hide())
    expect(a.result.current.visible).toBe(false)
    expect(b.result.current.visible).toBe(true)
  })

  it('twee instances voor dezelfde id blijven in sync via custom event', () => {
    const a = renderHook(() => useInsightVisibility('compound-insight'))
    const b = renderHook(() => useInsightVisibility('compound-insight'))
    act(() => a.result.current.hide())
    expect(b.result.current.visible).toBe(false)
  })
})

describe('useHiddenInsights', () => {
  it('mounted gaat na een tick op true (SSR-safe)', async () => {
    const { result, rerender } = renderHook(() => useHiddenInsights(['compound-insight']))
    rerender()
    expect(result.current.mounted).toBe(true)
  })

  it('hiddenCount telt alleen ids uit de meegegeven lijst', () => {
    window.localStorage.setItem(
      'tf-insight-hidden',
      JSON.stringify(['compound-insight', 'fee-impact', 'inflation-impact']),
    )
    const { result } = renderHook(() => useHiddenInsights(['compound-insight', 'fee-impact']))
    expect(result.current.hiddenCount).toBe(2)
  })

  it('restoreAll verwijdert alleen de meegegeven ids uit de hidden-set', () => {
    window.localStorage.setItem(
      'tf-insight-hidden',
      JSON.stringify(['compound-insight', 'fee-impact', 'inflation-impact']),
    )
    const { result } = renderHook(() => useHiddenInsights(['compound-insight', 'fee-impact']))
    act(() => result.current.restoreAll())
    expect(result.current.hiddenCount).toBe(0)
    const stored = JSON.parse(window.localStorage.getItem('tf-insight-hidden') ?? '[]')
    expect(stored).toEqual(['inflation-impact'])
  })
})
