import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCountUp } from './use-count-up'

/**
 * useCountUp drijft het hero-getal aan. Twee gedrags-takken worden vastgelegd:
 * reduced-motion (meteen de eindwaarde) en start=false (blijf op 0). De
 * easing-curve zelf is lager-waardig om te testen.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCountUp', () => {
  it('toont meteen de eindwaarde bij prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as unknown as MediaQueryList)
    const { result } = renderHook(() => useCountUp(60))
    expect(result.current).toBe(60)
  })

  it('blijft op 0 zolang start false is', () => {
    const { result } = renderHook(() => useCountUp(60, { start: false }))
    expect(result.current).toBe(0)
  })
})
