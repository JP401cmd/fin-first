/**
 * De schrijfdiscipline van de gebruiksmeting per app-deel (ADR 0147 fase 2):
 * één POST per Amsterdamse dag per module per browsersessie, een mislukte POST
 * laat de vlag weer los, en meten gooit nooit — ook niet zonder sessionStorage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { meldModuleGebruik, moduleSessieSleutel } from './meld-module'

let fetchSpy: ReturnType<typeof vi.fn>

function flush() {
  return new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  sessionStorage.clear()
  fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('meldModuleGebruik', () => {
  it('post één keer per dag per module met alleen de modulesleutel', async () => {
    meldModuleGebruik('toekomst')
    meldModuleGebruik('toekomst')
    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/activity/module')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(init.body as string)).toEqual({ module: 'toekomst' })
  })

  it('een andere module post wél apart', async () => {
    meldModuleGebruik('toekomst')
    meldModuleGebruik('budget')
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('de sleutel draagt de Amsterdamse kalenderdag', () => {
    vi.useFakeTimers()
    // 23:30 UTC op 14 sep = 01:30 op 15 sep in Amsterdam (CEST).
    vi.setSystemTime(new Date('2026-09-14T23:30:00Z'))
    expect(moduleSessieSleutel('fin')).toBe('activity_module:2026-09-15:fin')
  })

  it('een mislukte POST haalt de vlag weg, zodat een volgende aanroep opnieuw post', async () => {
    fetchSpy.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    meldModuleGebruik('mijn')
    await flush()
    expect(sessionStorage.getItem(moduleSessieSleutel('mijn'))).toBeNull()

    meldModuleGebruik('mijn')
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem(moduleSessieSleutel('mijn'))).toBe('1')
  })

  it('gooit niet zonder sessionStorage of fetch', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('geblokkeerd')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('geblokkeerd')
    })
    expect(() => meldModuleGebruik('nieuws')).not.toThrow()
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    vi.stubGlobal('fetch', undefined)
    expect(() => meldModuleGebruik('nieuws')).not.toThrow()
  })
})
