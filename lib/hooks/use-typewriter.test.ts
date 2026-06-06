import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from './use-typewriter'

describe('useTypewriter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('onthult tekst teken-voor-teken en wordt done', () => {
    const { result } = renderHook(() => useTypewriter('abc', { cps: 100 })) // 10ms/teken
    expect(result.current.shown).toBe('')
    expect(result.current.done).toBe(false)
    act(() => { vi.advanceTimersByTime(10) })
    expect(result.current.shown).toBe('a')
    act(() => { vi.advanceTimersByTime(20) })
    expect(result.current.shown).toBe('abc')
    expect(result.current.done).toBe(true)
  })

  it('toont alles ineens bij prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const { result } = renderHook(() => useTypewriter('hallo'))
    expect(result.current.shown).toBe('hallo')
    expect(result.current.done).toBe(true)
  })

  it('blijft leeg zolang start=false', () => {
    const { result } = renderHook(() => useTypewriter('abc', { start: false }))
    expect(result.current.shown).toBe('')
    expect(result.current.done).toBe(false)
  })

  it('reset wanneer text halverwege het typen wijzigt', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as unknown as MediaQueryList)
    const { result, rerender } = renderHook(
      ({ text }) => useTypewriter(text, { cps: 100 }),
      { initialProps: { text: 'abc' } },
    )
    act(() => { vi.advanceTimersByTime(10) })
    expect(result.current.shown).toBe('a')
    rerender({ text: 'xy' })
    expect(result.current.shown).toBe('')
    expect(result.current.done).toBe(false)
    act(() => { vi.advanceTimersByTime(10) })
    expect(result.current.shown).toBe('x')
  })
})
