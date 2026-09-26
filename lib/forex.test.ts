import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearForexCache, fetchBatchForexRates, fetchForexRate } from './forex'

function yahoo(rate: number) {
  return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: rate } }] } }), { status: 200 })
}

describe('forex — cache', () => {
  beforeEach(() => clearForexCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('een fallback wordt 5 minuten gecachet: een hangende Yahoo kost niet elke load opnieuw de timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'))
    vi.stubGlobal('fetch', fetchMock)

    const eerste = await fetchForexRate('USD')
    const tweede = await fetchForexRate('USD')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Een gecachte fallback blijft 'fallback' heten; /beheer/jobs meldt dat op basis van source.
    expect(eerste?.source).toBe('fallback')
    expect(tweede?.source).toBe('fallback')
  })

  it('na 5 minuten probeert hij Yahoo opnieuw en cachet hij de live koers', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(yahoo(0.9))
    vi.stubGlobal('fetch', fetchMock)

    expect((await fetchForexRate('USD'))?.source).toBe('fallback')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(await fetchForexRate('USD')).toMatchObject({ source: 'yahoo_finance', rate: 0.9 })
    expect((await fetchForexRate('USD'))?.source).toBe('cache')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('een fallback die later binnenkomt overschrijft een net gecachete live koers niet', async () => {
    let lateTimeout: (e: Error) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { lateTimeout = reject }))
      .mockResolvedValueOnce(yahoo(0.9))
    vi.stubGlobal('fetch', fetchMock)

    const traag = fetchForexRate('USD') // A: hangt
    expect(await fetchForexRate('USD')).toMatchObject({ source: 'yahoo_finance', rate: 0.9 }) // B: live
    lateTimeout(new Error('timeout'))
    expect((await traag)?.source).toBe('fallback')
    expect(await fetchForexRate('USD')).toMatchObject({ source: 'cache', rate: 0.9 })
  })

  it('een batch wacht niet tussen de verzoeken', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => yahoo(1.1)))
    // Zou er nog een setTimeout tussen zitten, dan blijft deze promise met fake timers hangen.
    const uit = await fetchBatchForexRates(['USD', 'GBP', 'CHF'])
    expect([...uit.keys()]).toEqual(['USD', 'GBP', 'CHF'])
  })
})
