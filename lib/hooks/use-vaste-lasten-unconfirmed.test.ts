import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVasteLastenUnconfirmed } from './use-vaste-lasten-unconfirmed'

/**
 * useVasteLastenUnconfirmed voedt de freshness-dot op de "Vaste lasten"-rij.
 *
 * Gedrag:
 *  - false bij loading/fout (defensief, progressive enhancement)
 *  - true zodra minstens één item.alreadyConfirmed === false
 *  - false wanneer alle items bevestigd zijn (alreadyConfirmed === true)
 *  - false wanneer subscriptions + vasteKosten beide leeg zijn
 *  - false bij niet-ok response of netwerk-fout
 */

function makeFetch(ok: boolean, json: object = {}) {
  return vi.fn(async () =>
    ({
      ok,
      json: async () => json,
    }) as Response,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useVasteLastenUnconfirmed', () => {
  it('begint op false (loading-state)', () => {
    global.fetch = makeFetch(true, { subscriptions: [], vasteKosten: [] })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    expect(result.current).toBe(false)
  })

  it('true wanneer een subscription niet bevestigd is', async () => {
    global.fetch = makeFetch(true, {
      subscriptions: [{ alreadyConfirmed: false }],
      vasteKosten: [],
    })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('true wanneer een vasteKost niet bevestigd is', async () => {
    global.fetch = makeFetch(true, {
      subscriptions: [],
      vasteKosten: [{ alreadyConfirmed: false }],
    })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('false wanneer alle items bevestigd zijn', async () => {
    global.fetch = makeFetch(true, {
      subscriptions: [{ alreadyConfirmed: true }],
      vasteKosten: [{ alreadyConfirmed: true }],
    })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false wanneer beide arrays leeg zijn', async () => {
    global.fetch = makeFetch(true, { subscriptions: [], vasteKosten: [] })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false bij een niet-ok response', async () => {
    global.fetch = makeFetch(false)
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false bij een fetch throw (netwerk-fout)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('ontbrekende subscriptions/vasteKosten-keys worden behandeld als lege arrays', async () => {
    global.fetch = makeFetch(true, {}) // geen keys
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('true wanneer mix: één bevestigd, één niet', async () => {
    global.fetch = makeFetch(true, {
      subscriptions: [{ alreadyConfirmed: true }, { alreadyConfirmed: false }],
      vasteKosten: [],
    })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('item zonder alreadyConfirmed-veld telt als niet-bevestigd (undefined → falsy)', async () => {
    // alreadyConfirmed ontbreekt → undefined → !undefined = true → unconfirmed
    global.fetch = makeFetch(true, {
      subscriptions: [{}],
      vasteKosten: [],
    })
    const { result } = renderHook(() => useVasteLastenUnconfirmed())
    await act(async () => {})
    expect(result.current).toBe(true)
  })
})
