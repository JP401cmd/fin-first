import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  acquireOverlay,
  getOverlayCount,
  useOverlayOpen,
  __resetOverlayCount,
} from './overlay-signal'

// Elke test start met een schone teller — een niet-vrijgegeven acquire uit een
// vorige test mag niet naar de volgende lekken (module-scoped state).
beforeEach(() => __resetOverlayCount())
afterEach(() => __resetOverlayCount())

describe('overlay-signal — ref-counting', () => {
  it('acquire verhoogt, release verlaagt de teller', () => {
    expect(getOverlayCount()).toBe(0)
    const release = acquireOverlay()
    expect(getOverlayCount()).toBe(1)
    release()
    expect(getOverlayCount()).toBe(0)
  })

  it('telt geneste overlays op (ref-count) en telt in volgorde af', () => {
    const r1 = acquireOverlay()
    const r2 = acquireOverlay()
    expect(getOverlayCount()).toBe(2)
    r1()
    expect(getOverlayCount()).toBe(1)
    r2()
    expect(getOverlayCount()).toBe(0)
  })

  it('release is idempotent — dubbel aanroepen telt niet dubbel af', () => {
    const r1 = acquireOverlay()
    const r2 = acquireOverlay()
    r1()
    r1() // tweede keer: no-op
    expect(getOverlayCount()).toBe(1)
    r2()
    expect(getOverlayCount()).toBe(0)
  })

  it('zakt nooit onder 0', () => {
    const release = acquireOverlay()
    release()
    release() // extra release na 0
    expect(getOverlayCount()).toBe(0)
  })
})

describe('overlay-signal — useOverlayOpen', () => {
  it('is false zonder open overlay', () => {
    const { result } = renderHook(() => useOverlayOpen())
    expect(result.current).toBe(false)
  })

  it('wordt true bij acquire en weer false bij release', () => {
    const { result } = renderHook(() => useOverlayOpen())
    let release: () => void = () => {}
    act(() => {
      release = acquireOverlay()
    })
    expect(result.current).toBe(true)
    act(() => {
      release()
    })
    expect(result.current).toBe(false)
  })

  it('blijft true zolang minstens één overlay open is (ref-count)', () => {
    const { result } = renderHook(() => useOverlayOpen())
    let r1: () => void = () => {}
    let r2: () => void = () => {}
    act(() => {
      r1 = acquireOverlay()
      r2 = acquireOverlay()
    })
    expect(result.current).toBe(true)
    act(() => {
      r1()
    })
    // Nog één overlay open → pill blijft verborgen.
    expect(result.current).toBe(true)
    act(() => {
      r2()
    })
    expect(result.current).toBe(false)
  })
})
