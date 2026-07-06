import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchPriceData, clearPriceCache } from './price-feed'

/**
 * Prijs-normalisatie bij de bron (lib/price-feed.ts → fetchPriceData).
 *
 * Yahoo Finance levert Londen-genoteerde (LSE) instrumenten die in pence
 * noteren met `meta.currency === "GBp"` (kleine p) of "GBX", en de prijzen
 * (regularMarketPrice / chartPreviousClose) in PENCE — dus 100× te hoog
 * t.o.v. echte ponden. Downstream doet `.toUpperCase()` waardoor "GBp"→"GBP"
 * collapse't en de forex-conversie de pence-waarde als ponden behandelt
 * (marktwaarde 100× te hoog, absurd rendement).
 *
 * De normalisatie hoort in de bron: fetchPriceData deelt pence-prijzen door
 * 100 en zet currency op "GBP" vóór het cachen, zodat élke consument
 * (cron-route, handmatige refresh, loader, UI, ticker-validatie) canonieke
 * ponden krijgt. Het percentage is schaal-invariant en blijft ongewijzigd.
 */

/** Mock één Yahoo chart-respons met de gegeven `meta`. */
function mockChartFetch(meta: Record<string, unknown>) {
  return vi.fn(async () => {
    return {
      ok: true,
      json: async () => ({ chart: { result: [{ meta }] } }),
    } as Response
  })
}

beforeEach(() => {
  clearPriceCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchPriceData — pence/GBp-normalisatie', () => {
  it('normaliseert GBp (pence) → GBP en deelt de prijzen door 100', async () => {
    vi.stubGlobal(
      'fetch',
      mockChartFetch({
        currency: 'GBp',
        regularMarketPrice: 2947.5,
        chartPreviousClose: 2961.4,
        shortName: 'AIAG',
      }),
    )

    const data = await fetchPriceData('AIAG.L')
    expect(data).not.toBeNull()

    // 2947.5 pence = £29,475
    expect(data!.price).toBeCloseTo(29.475, 4)
    // 2961.4 pence = £29,614
    expect(data!.previousClose).toBeCloseTo(29.614, 4)
    // Genormaliseerd naar echte ponden
    expect(data!.currency).toBe('GBP')

    // Percentage is schaal-invariant: identiek aan de ruwe ratio (~-0.47%)
    const expectedPct = ((2947.5 - 2961.4) / 2961.4) * 100
    expect(data!.dailyChangePercent).toBeCloseTo(expectedPct, 6)
    // dailyChange in ponden (niet pence)
    expect(data!.dailyChange).toBeCloseTo(29.475 - 29.614, 6)
  })

  it('normaliseert de hoofdletter-variant GBX → GBP', async () => {
    vi.stubGlobal(
      'fetch',
      mockChartFetch({
        currency: 'GBX',
        regularMarketPrice: 2947.5,
        chartPreviousClose: 2961.4,
        shortName: 'SOME.LSE',
      }),
    )

    const data = await fetchPriceData('SOME.L')
    expect(data).not.toBeNull()
    expect(data!.price).toBeCloseTo(29.475, 4)
    expect(data!.previousClose).toBeCloseTo(29.614, 4)
    expect(data!.currency).toBe('GBP')

    const expectedPct = ((2947.5 - 2961.4) / 2961.4) * 100
    expect(data!.dailyChangePercent).toBeCloseTo(expectedPct, 6)
  })

  it('deelt een echt pond-instrument (GBP, hoofdletter P) NIET door 100', async () => {
    vi.stubGlobal(
      'fetch',
      mockChartFetch({
        currency: 'GBP',
        regularMarketPrice: 42.5,
        chartPreviousClose: 42.0,
        shortName: 'REAL.GBP',
      }),
    )

    const data = await fetchPriceData('REALGBP.L')
    expect(data).not.toBeNull()
    expect(data!.price).toBe(42.5)
    expect(data!.previousClose).toBe(42.0)
    expect(data!.currency).toBe('GBP')
  })

  it('laat USD-genoteerde instrumenten onaangeroerd', async () => {
    vi.stubGlobal(
      'fetch',
      mockChartFetch({
        currency: 'USD',
        regularMarketPrice: 187.25,
        chartPreviousClose: 185.0,
        shortName: 'AAPL',
      }),
    )

    const data = await fetchPriceData('AAPL')
    expect(data).not.toBeNull()
    expect(data!.price).toBe(187.25)
    expect(data!.currency).toBe('USD')
  })
})

/**
 * H1-regressie: rate-limiter blokkeert nu i.p.v. instant `null`.
 *
 * `acquireRateLimitToken()` is een synchrone token-bucket (5 tokens, 5/s
 * refill) — vóór de fix gaf `fetchPriceData` bij een lege bucket instant
 * `null` terug, waardoor een concurrente burst die de initiële 5 tokens
 * overschrijdt (zoals de refresh-prices-concurrency-pool met 4 workers × meer
 * dan 5 holdings) een deel van de holdings ten onrechte als 'stale' markeerde
 * — ook al was Yahoo prima bereikbaar, er was alleen even geen token.
 * `acquireRateLimitTokenBlocking` (regel ~88) wacht nu kort en probeert
 * opnieuw tot een gebonden deadline (15s), zodat elke aanroeper zichzelf op de
 * refill-rate paced i.p.v. voortijdig opgeven.
 *
 * We mocken `global.fetch` (NIET `fetchPriceData` zelf) zodat de ECHTE
 * token-bucket + blocking-retry meelopen — dit bewijst het gedrag van de
 * fix zelf, niet alleen dat een gemockte functie een waarde teruggeeft.
 * Tickers zijn allemaal DISTINCT zodat de 5-minuten-prijscache geen tweede
 * aanroep voor dezelfde ticker maskeert (dat zou de rate-limiter nooit raken).
 *
 * Timing: bewust ECHTE timers (geen fake timers). De rate-limiter combineert
 * `Date.now()`-gebaseerde refill mét `setTimeout`-retries; dat exact synchroon
 * laten lopen met fake timers zou fragieler zijn dan gewoon de ~1-2s reële
 * kloktijd accepteren die een bescheiden burst van 12 tickers kost (5 direct,
 * daarna ~5/s refill voor de resterende 7) — vandaar ook een ruimere
 * test-timeout hieronder.
 *
 * Let op: de token-bucket is module-scoped singleton-state die NIET door
 * `clearPriceCache()` gereset wordt, en dus ook door eerdere tests in dit
 * bestand beïnvloed kan zijn (die verbruikten al 4 tokens). We asserten dus
 * NIET op een exact startaantal tokens — alleen dat ALLE aanvragen in de
 * burst uiteindelijk (binnen de test-timeout) een geldige, niet-null prijs
 * krijgen. Dat is precies de garantie die de fix levert, ongeacht de exacte
 * startreserve.
 */
describe('fetchPriceData — rate-limiter burst (H1: acquireRateLimitTokenBlocking)', () => {
  it('12 concurrente DISTINCTE tickers (> 5 initiële tokens): ALLE 12 krijgen een niet-null prijs', async () => {
    const fetchMock = mockChartFetch({
      currency: 'EUR',
      regularMarketPrice: 100,
      chartPreviousClose: 95,
      shortName: 'Burst Instrument',
    })
    vi.stubGlobal('fetch', fetchMock)

    const tickers = Array.from({ length: 12 }, (_, i) => `BURSTA${i}.TEST`)
    const results = await Promise.all(tickers.map((t) => fetchPriceData(t)))

    // Vóór de fix zouden de tickers ná de initiële bucket-capaciteit instant
    // `null` teruggeven omdat acquireRateLimitToken() synchroon faalde i.p.v.
    // te wachten op refill.
    expect(results.every((r) => r !== null)).toBe(true)
    for (const r of results) {
      expect(r!.price).toBe(100)
      expect(r!.previousClose).toBe(95)
      expect(r!.currency).toBe('EUR')
    }

    // Elke ticker deed ECHT een netwerk-call — niemand werd op basis van de
    // rate-limiter overgeslagen (anders was fetch voor die ticker nooit
    // aangeroepen).
    expect(fetchMock).toHaveBeenCalledTimes(12)
  }, 10_000)

  it('een burst binnen de initiële capaciteit (4 tickers) slaagt sowieso volledig', async () => {
    const fetchMock = mockChartFetch({
      currency: 'EUR',
      regularMarketPrice: 50,
      chartPreviousClose: 48,
      shortName: 'Small burst',
    })
    vi.stubGlobal('fetch', fetchMock)

    const tickers = Array.from({ length: 4 }, (_, i) => `BURSTB${i}.TEST`)
    const results = await Promise.all(tickers.map((t) => fetchPriceData(t)))

    expect(results.every((r) => r !== null)).toBe(true)
    for (const r of results) {
      expect(r!.price).toBe(50)
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  }, 10_000)
})
