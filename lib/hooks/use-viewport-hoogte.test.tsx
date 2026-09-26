import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewportHoogte } from './use-viewport-hoogte'

const oorspronkelijk = window.innerHeight

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: oorspronkelijk })
  vi.restoreAllMocks()
})

describe('useViewportHoogte', () => {
  it('meet bij mount', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const { result } = renderHook(() => useViewportHoogte())
    expect(result.current).toBe(844)
  })

  it('volgt een oriëntatiewissel, niet een gewone resize (iOS-werkbalk)', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const { result } = renderHook(() => useViewportHoogte())
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(844)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
    act(() => {
      window.dispatchEvent(new Event('orientationchange'))
    })
    expect(result.current).toBe(390)
  })
})
