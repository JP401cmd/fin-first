import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNewsUnread } from './use-news-unread'
import { __resetInflight } from '@/lib/inflight'

/**
 * useNewsUnread voedt de freshness-dot op de "Nieuws"-rij in de sidebar.
 *
 * Gedrag:
 *  - false bij loading/fout (defensief, progressive enhancement)
 *  - true zodra minstens één item.id niet in readIds zit
 *  - false wanneer alle items gelezen zijn
 *  - false wanneer items leeg zijn
 *  - false wanneer /api/news of /api/news/read een niet-ok status geeft
 */

function makeFetch(responses: Array<{ ok: boolean; json?: object }>) {
  let call = 0
  return vi.fn(async () => {
    const r = responses[call++] ?? { ok: false }
    return {
      ok: r.ok,
      json: async () => r.json ?? {},
    } as Response
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  // In-flight dedupe-registratie wissen zodat een hangende/lopende fetch uit de
  // vorige test niet naar de volgende lekt (gedeelde module-state).
  __resetInflight()
})

describe('useNewsUnread', () => {
  it('slaat de fetch over wanneer entitlement ontbreekt (enabled=false)', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    const { result } = renderHook(() => useNewsUnread(false))
    await act(async () => {})
    expect(result.current).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('begint op false (loading-state)', async () => {
    // Laat fetch hangen zodat er nooit een state-update volgt — zuivere
    // test van de initiële waarde zonder act-warning.
    global.fetch = vi.fn(() => new Promise<Response>(() => {}))
    const { result } = renderHook(() => useNewsUnread())
    expect(result.current).toBe(false)
  })

  it('true wanneer een id niet in readIds staat', async () => {
    global.fetch = makeFetch([
      { ok: true, json: { ids: ['a', 'b'], peek: true } },
      { ok: true, json: { readIds: ['a'] } },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('false wanneer alle ids gelezen zijn', async () => {
    global.fetch = makeFetch([
      { ok: true, json: { ids: ['a'], peek: true } },
      { ok: true, json: { readIds: ['a'] } },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false wanneer ids-lijst leeg is (geen editie)', async () => {
    global.fetch = makeFetch([
      { ok: true, json: { ids: [], peek: true } },
      { ok: true, json: { readIds: [] } },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false bij een niet-ok /api/news response', async () => {
    global.fetch = makeFetch([
      { ok: false },
      { ok: true, json: { readIds: [] } },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false bij een niet-ok /api/news/read response', async () => {
    global.fetch = makeFetch([
      { ok: true, json: { ids: ['a'], peek: true } },
      { ok: false },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('false bij een fetch throw (netwerk-fout)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('undefined/null-id in ids-array wordt overgeslagen (id null guard)', async () => {
    // Een null-id in de ids-array telt niet mee als "ongelezen"
    global.fetch = makeFetch([
      { ok: true, json: { ids: [null, 'b'], peek: true } },
      { ok: true, json: { readIds: ['b'] } },
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    // 'b' is gelezen, null-id wordt overgeslagen → geen unread
    expect(result.current).toBe(false)
  })

  it('ontbrekende ids/readIds-keys worden behandeld als lege arrays', async () => {
    global.fetch = makeFetch([
      { ok: true, json: {} },          // geen ids-key
      { ok: true, json: {} },          // geen readIds-key
    ])
    const { result } = renderHook(() => useNewsUnread())
    await act(async () => {})
    expect(result.current).toBe(false)
  })
})
