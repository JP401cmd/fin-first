import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOpenOnHash } from './use-open-on-hash'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useOpenOnHash', () => {
  it('Given het anker in de URL bij het laden, When de hook mount, Then opent hij en haalt het anker weg met behoud van history.state', () => {
    window.history.replaceState({ __NA: true }, '', '/overzicht?x=1#gezondheid')
    const onMatch = vi.fn()
    renderHook(() => useOpenOnHash('#gezondheid', onMatch))
    expect(onMatch).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('')
    expect(window.location.pathname + window.location.search).toBe('/overzicht?x=1')
    expect(window.history.state).toEqual({ __NA: true })
  })

  it('Given een fragmentnavigatie op dezelfde pagina, When hashchange vuurt, Then opent hij', () => {
    window.history.replaceState(null, '', '/overzicht')
    const onMatch = vi.fn()
    renderHook(() => useOpenOnHash('#gezondheid', onMatch))
    expect(onMatch).not.toHaveBeenCalled()
    window.history.replaceState(null, '', '/overzicht#gezondheid')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(onMatch).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('')
  })

  it('Given een ander anker, When hashchange vuurt, Then gebeurt er niets', () => {
    window.history.replaceState(null, '', '/overzicht#acties')
    const onMatch = vi.fn()
    renderHook(() => useOpenOnHash('#gezondheid', onMatch))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(onMatch).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#acties')
  })

  it('Given unmount, When hashchange vuurt, Then luistert hij niet meer', () => {
    window.history.replaceState(null, '', '/overzicht')
    const onMatch = vi.fn()
    const { unmount } = renderHook(() => useOpenOnHash('#gezondheid', onMatch))
    unmount()
    window.history.replaceState(null, '', '/overzicht#gezondheid')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(onMatch).not.toHaveBeenCalled()
  })
})
