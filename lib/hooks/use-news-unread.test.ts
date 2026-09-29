import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNewsUnread, __resetNewsUnread } from './use-news-unread'
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

/**
 * De tijdlijn-peek (Krant 1C fase 2) komt eerst. In de AI-Krant-tests hieronder
 * leest de lezer de tijdlijn niet: die peek geeft 403 en telt niet mee in de
 * volgorde van `responses`.
 */
function makeFetch(responses: Array<{ ok: boolean; json?: object }>) {
  let call = 0
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).startsWith('/api/krant/tijdlijn')) return { ok: false, status: 403, json: async () => ({}) } as Response
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
  __resetNewsUnread()
})

describe('useNewsUnread', () => {
  it('slaat de AI-fetch over wanneer entitlement ontbreekt (enabled=false) — alleen de tijdlijn-peek', async () => {
    const fetchSpy = makeFetch([])
    global.fetch = fetchSpy as unknown as typeof fetch
    const { result } = renderHook(() => useNewsUnread(false))
    await act(async () => {})
    expect(result.current).toBe(false)
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual(['/api/krant/tijdlijn?peek=1'])
  })

  describe('tijdlijn (Krant 1C fase 2)', () => {
    it('leest de lezer de tijdlijn, dan komt de stip uit { nieuw } — ook zonder AI-recht, zonder /api/news', async () => {
      const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nieuw: true }) }) as Response)
      global.fetch = fetchSpy as unknown as typeof fetch
      const { result } = renderHook(() => useNewsUnread(false))
      await act(async () => {})
      expect(result.current).toBe(true)
      expect(fetchSpy.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['/api/krant/tijdlijn?peek=1'])
    })

    it('{ nieuw: false } → grijs', async () => {
      global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nieuw: false }) }) as Response)
      const { result } = renderHook(() => useNewsUnread())
      await act(async () => {})
      expect(result.current).toBe(false)
    })

    it('tijdlijn dicht voor deze lezer (tijdlijnMogelijk=false): geen tijdlijn-peek, dus geen 403 per paginalading', async () => {
      // Zonder AI-recht: helemaal geen verzoek.
      const zonderAi = makeFetch([])
      global.fetch = zonderAi as unknown as typeof fetch
      const eerste = renderHook(() => useNewsUnread(false, false))
      await act(async () => {})
      expect(eerste.result.current).toBe(false)
      expect(zonderAi).not.toHaveBeenCalled()

      // Met AI-recht: direct het AI-pad, zonder eerst de tijdlijn te proberen.
      __resetInflight()
      const metAi = makeFetch([
        { ok: true, json: { ids: ['a'], peek: true } },
        { ok: true, json: { readIds: [] } },
      ])
      global.fetch = metAi as unknown as typeof fetch
      const tweede = renderHook(() => useNewsUnread(true, false))
      await act(async () => {})
      expect(tweede.result.current).toBe(true)
      expect(metAi.mock.calls.map((c) => c[0])).toEqual(['/api/news?peek=1', '/api/news/read'])
    })

    it('een 403 op de tijdlijn wordt onthouden: de volgende mount vraagt hem niet opnieuw', async () => {
      const fetchSpy = makeFetch([])
      global.fetch = fetchSpy as unknown as typeof fetch
      renderHook(() => useNewsUnread(false))
      await act(async () => {})
      __resetInflight()
      renderHook(() => useNewsUnread(false))
      await act(async () => {})
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
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
