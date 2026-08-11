import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { PriceData } from '@/lib/price-feed'

/**
 * Regressietests voor POST /api/holdings/refresh-prices.
 *
 * Vastlegt dat de refactor van een sequentiële per-holding-lus naar een
 * gebonden concurrency-pool (`mapWithConcurrency`, `REFRESH_CONCURRENCY = 4`)
 * gedrag-behoudend is:
 *   1. Volledigheid — N holdings (> poolgrootte) leveren ALLE N resultaten
 *      terug, niets valt weg of wordt dubbel verwerkt, en de pool overschrijdt
 *      de limiet nooit (want alle 4 workers starten hun eerste `fetchPriceData`
 *      synchroon vóór er ook maar één resolvet — dit is deterministisch, geen
 *      timing-gok).
 *   2. Gedeeltelijk falen — een mix van updated/stale/error wordt correct
 *      opgeteld in `summary` (voedt de eerlijke gedeeltelijk-succes-melding in
 *      `components/core/holdings-client.tsx`).
 *   3. Gesloten positie (0 stuks) wordt geskipt ZONDER netwerkcall.
 *
 * Mocking-strategie: zelfde `mockFrom`-gebaseerde aanpak als
 * app/api/holdings/import/route.test.ts, maar met een chain-factory die per
 * `.from('investment_holdings')`-aanroep zelf detecteert of het een
 * lijst-query (`.select`) of een per-holding-update (`.update` + `.eq('id',…)`)
 * is — want onder concurrentie is de aanroepvolgorde tussen holdings NIET
 * gegarandeerd (in tegenstelling tot de sequentiële import-route), dus routeren
 * op call-index zou vlaggen misplaatsen.
 */

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted)
// ---------------------------------------------------------------------------

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSyncInvestment = vi.fn()
const mockSyncCrypto = vi.fn()
const mockFetchPriceData = vi.fn<(ticker: string) => Promise<PriceData | null>>()
const mockResolveYahooSymbol = vi.fn()
const mockFetchBatchForexRates = vi.fn()
const mockGetEURRateSync = vi.fn()
const mockFetchCoinPricesEurBatch = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/price-feed', () => ({
  fetchPriceData: mockFetchPriceData,
  resolveYahooSymbol: mockResolveYahooSymbol,
}))

vi.mock('@/lib/forex', () => ({
  fetchBatchForexRates: mockFetchBatchForexRates,
  getEURRateSync: mockGetEURRateSync,
}))

vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromInvestmentHoldings: mockSyncInvestment,
  syncAssetValueFromCryptoHoldings: mockSyncCrypto,
}))

vi.mock('@/lib/integrations/coingecko-client', () => ({
  fetchCoinPricesEurBatch: mockFetchCoinPricesEurBatch,
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1111'

type InvHoldingRow = {
  id: string
  asset_id: string | null
  ticker: string | null
  isin: string | null
  name: string | null
  currency: string | null
  current_price: number | null
  last_price_update: string | null
  units: number
  avg_purchase_price: number
  asset_class: string | null
  geography: string | null
  exchange: string | null
}

function makeHoldingRow(overrides: Partial<InvHoldingRow> & { id: string }): InvHoldingRow {
  return {
    asset_id: `asset-${overrides.id}`,
    ticker: null,
    isin: null,
    name: null,
    currency: 'EUR',
    current_price: 10,
    last_price_update: null,
    units: 1,
    avg_purchase_price: 10,
    asset_class: null,
    geography: null,
    exchange: null,
    ...overrides,
  }
}

function makePriceData(overrides: Partial<PriceData> = {}): PriceData {
  return {
    price: 100,
    previousClose: 99,
    dailyChange: 1,
    dailyChangePercent: 1.0101,
    currency: 'EUR',
    displayName: 'Test Instrument',
    instrumentType: null,
    exchangeName: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    marketTime: null,
    timestamp: new Date().toISOString(),
    source: 'yahoo_finance',
    ...overrides,
  }
}

function makeRequest(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

async function callRoute(req: NextRequest) {
  // Dynamic import so the vi.mock hoisting applies correctly.
  const mod = await import('./route')
  return mod.POST(req)
}

/** Generic chain for tables we don't need fine-grained control over (best-effort upserts etc). */
function makeGenericChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(self)
  chain.update = vi.fn(self)
  chain.upsert = vi.fn(() => Promise.resolve(resolveWith))
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)
  return chain
}

/**
 * Chain-factory for `investment_holdings`. Each call to `supabase.from(...)`
 * gets a FRESH chain instance (closure-local state), so concurrent holdings
 * never share mutable state. Mode ('list' vs 'update') is detected from which
 * builder method is invoked — not from call order — because under the
 * concurrency pool, holdings' `.update()` calls can interleave.
 */
function makeInvestmentHoldingsChainFactory(
  listRows: InvHoldingRow[],
  onUpdate: (id: string, fields: Record<string, unknown>) => { error: unknown },
  updateLog: Array<{ id: string; fields: Record<string, unknown> }>,
  selectLog?: string[],
) {
  return () => {
    let mode: 'list' | 'update' | null = null
    let updateId: string | undefined
    let updateFields: Record<string, unknown> | undefined
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn((cols?: string) => {
      mode = 'list'
      if (selectLog && typeof cols === 'string') selectLog.push(cols)
      return chain
    })
    chain.update = vi.fn((fields: Record<string, unknown>) => {
      mode = 'update'
      updateFields = fields
      return chain
    })
    chain.eq = vi.fn((col: string, val: unknown) => {
      if (mode === 'update' && col === 'id') updateId = val as string
      return chain
    })
    ;(chain as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      let result: unknown
      if (mode === 'list') {
        result = { data: listRows, error: null }
      } else {
        updateLog.push({ id: updateId!, fields: updateFields! })
        result = onUpdate(updateId!, updateFields!)
      }
      return Promise.resolve(result).then(resolve, reject)
    }
    return chain
  }
}

describe('POST /api/holdings/refresh-prices', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthGetUser.mockReset()
    mockFrom.mockReset()
    mockSyncInvestment.mockReset().mockResolvedValue(undefined)
    mockSyncCrypto.mockReset().mockResolvedValue(undefined)
    mockFetchPriceData.mockReset()
    mockResolveYahooSymbol.mockReset().mockResolvedValue(null)
    mockFetchBatchForexRates.mockReset().mockResolvedValue(undefined)
    mockGetEURRateSync.mockReset().mockReturnValue(1)
    mockFetchCoinPricesEurBatch.mockReset().mockResolvedValue({})
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  // -------------------------------------------------------------------------
  // 1. Volledigheid + pool-grens: N=7 holdings (> REFRESH_CONCURRENCY=4)
  // -------------------------------------------------------------------------

  it('7 holdings (> poolgrootte 4): ALLE 7 resultaten komen terug, pool overschrijdt de limiet van 4 nooit', async () => {
    const holdings = Array.from({ length: 7 }, (_, i) =>
      makeHoldingRow({ id: `h${i}`, ticker: `TICK${i}`, units: 1 }),
    )

    let concurrent = 0
    let maxConcurrent = 0
    const seenTickers: string[] = []
    mockFetchPriceData.mockImplementation(async (ticker: string) => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      seenTickers.push(ticker)
      // Yield a tick so overlapping in-flight calls have a chance to show up
      // before this one resolves — the pool-bound is structural (poolSize
      // workers dispatched synchronously via Promise.all), not timing-based,
      // so this is deterministic rather than a timing gamble.
      await Promise.resolve()
      concurrent--
      return makePriceData({ displayName: ticker })
    })

    const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investment_holdings') {
        return makeInvestmentHoldingsChainFactory(holdings, () => ({ error: null }), updateLog)()
      }
      if (table === 'investment_holding_prices') {
        return makeGenericChain({ error: null })
      }
      return makeGenericChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Completeness: nothing dropped, nothing duplicated.
    expect(body.results.length).toBe(7)
    const resultIds = body.results.map((r: { id: string }) => r.id).sort()
    expect(resultIds).toEqual(holdings.map((h) => h.id).sort())
    expect(new Set(resultIds).size).toBe(7) // no duplicates

    expect(body.summary.total).toBe(7)
    expect(body.summary.updated).toBe(7)
    expect(body.summary.errors).toBe(0)
    expect(body.summary.stale).toBe(0)

    // Every holding was actually fetched exactly once.
    expect(mockFetchPriceData).toHaveBeenCalledTimes(7)
    expect(new Set(seenTickers).size).toBe(7)

    // Pool bound respected: never more than REFRESH_CONCURRENCY (4)
    // in-flight fetchPriceData calls at once, and with 7 items > 4 the pool
    // did actually saturate to the limit (not silently running less parallel).
    expect(maxConcurrent).toBeLessThanOrEqual(4)
    expect(maxConcurrent).toBe(4)

    // Result order in the response matches input/index order (pool writes
    // back into an index-ordered array, not append-on-completion order).
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(holdings.map((h) => h.id))
  })

  // -------------------------------------------------------------------------
  // 2. Gedeeltelijk falen: mix van updated / stale / error
  // -------------------------------------------------------------------------

  it('gemengde uitkomst: summary telt updated/stale/errors correct op', async () => {
    const holdings = [
      makeHoldingRow({ id: 'h-ok-1', ticker: 'OK1', units: 2 }),
      makeHoldingRow({ id: 'h-ok-2', ticker: 'OK2', units: 3 }),
      makeHoldingRow({ id: 'h-stale', ticker: 'NOPRICE', units: 1 }),
      makeHoldingRow({ id: 'h-error', ticker: 'BADSAVE', units: 1 }),
    ]

    mockFetchPriceData.mockImplementation(async (ticker: string) => {
      if (ticker === 'NOPRICE') return null // → stale (no price feed data)
      return makePriceData({ displayName: ticker })
    })

    const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investment_holdings') {
        return makeInvestmentHoldingsChainFactory(
          holdings,
          (id) => (id === 'h-error' ? { error: { message: 'kon niet opslaan' } } : { error: null }),
          updateLog,
        )()
      }
      if (table === 'investment_holding_prices') {
        return makeGenericChain({ error: null })
      }
      return makeGenericChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary.total).toBe(4)
    expect(body.summary.updated).toBe(2)
    expect(body.summary.stale).toBe(1)
    expect(body.summary.errors).toBe(1)
    expect(body.summary.skipped).toBe(0)

    const byId = Object.fromEntries(body.results.map((r: { id: string; status: string }) => [r.id, r.status]))
    expect(byId['h-ok-1']).toBe('updated')
    expect(byId['h-ok-2']).toBe('updated')
    expect(byId['h-stale']).toBe('stale')
    expect(byId['h-error']).toBe('error')

    // The error holding's failed write is NOT counted as a silent "updated" —
    // and the sync roll-up must only run for successfully updated assets.
    expect(mockSyncInvestment).toHaveBeenCalledTimes(2) // h-ok-1's + h-ok-2's asset_id only
  })

  // -------------------------------------------------------------------------
  // 3. Gesloten positie (0 stuks): skip zonder netwerkcall
  // -------------------------------------------------------------------------

  it('gesloten positie (0 stuks) wordt geskipt zonder fetchPriceData-aanroep', async () => {
    const holdings = [
      makeHoldingRow({ id: 'h-open', ticker: 'OPEN1', units: 5 }),
      makeHoldingRow({ id: 'h-closed', ticker: 'CLOSED1', units: 0, current_price: 42 }),
    ]

    mockFetchPriceData.mockImplementation(async (ticker: string) => makePriceData({ displayName: ticker }))

    const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investment_holdings') {
        return makeInvestmentHoldingsChainFactory(holdings, () => ({ error: null }), updateLog)()
      }
      if (table === 'investment_holding_prices') {
        return makeGenericChain({ error: null })
      }
      return makeGenericChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary.total).toBe(2)
    expect(body.summary.skipped).toBe(1)
    expect(body.summary.updated).toBe(1)

    const closed = body.results.find((r: { id: string }) => r.id === 'h-closed')
    expect(closed.status).toBe('skipped')
    expect(closed.message).toMatch(/Gesloten positie/)
    expect(closed.current_price).toBe(42) // untouched, still shows last known value

    // No network call for the closed position — only the open one was fetched.
    expect(mockFetchPriceData).toHaveBeenCalledTimes(1)
    expect(mockFetchPriceData).toHaveBeenCalledWith('OPEN1')

    // No write to investment_holdings.update() for the skipped holding either.
    expect(updateLog.some((u) => u.id === 'h-closed')).toBe(false)
    expect(updateLog.some((u) => u.id === 'h-open')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 4. Classificatie uit de feed-metadata (asset_class / geography)
  // -------------------------------------------------------------------------

  /**
   * De classificatie komt UITSLUITEND uit `instrumentType`/`exchangeName` van de
   * verse Yahoo-response — nooit uit de request-body — en vult alleen lege
   * kolommen. De harde eisen die hier vastliggen:
   *   a. EQUITY + AMS → aandelen/nederland.
   *   b. ETF → assetklasse 'etf', maar NOOIT een geografie uit de
   *      noteringsbeurs (VWRL noteert in Amsterdam, belegt wereldwijd).
   *   c. Een bestaande (handmatige) waarde wordt niet overschreven → een
   *      tweede refresh op al geclassificeerde posities verandert niets.
   *   d. Legacy 'equity'/'bonds' worden wél genormaliseerd (afgebakende
   *      uitzondering).
   */
  function runWithHoldings(holdings: InvHoldingRow[]) {
    const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investment_holdings') {
        return makeInvestmentHoldingsChainFactory(holdings, () => ({ error: null }), updateLog)()
      }
      if (table === 'investment_holding_prices') {
        return makeGenericChain({ error: null })
      }
      return makeGenericChain({ data: null, error: null })
    })
    return updateLog
  }

  it('EQUITY op AMS vult lege kolommen met aandelen/nederland en telt mee als geclassificeerd', async () => {
    const holdings = [makeHoldingRow({ id: 'h-asml', ticker: 'ASML.AS' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: 'EQUITY', exchangeName: 'AMS' }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    const write = updateLog.find((u) => u.id === 'h-asml')!
    expect(write.fields.asset_class).toBe('aandelen')
    expect(write.fields.geography).toBe('nederland')
    expect(write.fields.exchange).toBe('AMS')
    expect(body.summary.classified).toBe(1)
    expect(body.message).toMatch(/1 positie geclassificeerd/)
  })

  it('ETF op AMS krijgt assetklasse etf maar GEEN geografie uit de noteringsbeurs', async () => {
    const holdings = [makeHoldingRow({ id: 'h-vwrl', ticker: 'VWRL.AS' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: 'ETF', exchangeName: 'AMS' }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    const write = updateLog.find((u) => u.id === 'h-vwrl')!
    expect(write.fields.asset_class).toBe('etf')
    // Kern-eis: de kolom wordt niet meegeschreven — geen 'nederland' voor een
    // wereldwijd beleggend fonds. De beurscode zelf is wél een feit en mag.
    expect('geography' in write.fields).toBe(false)
    expect(write.fields.exchange).toBe('AMS')
    expect(body.summary.classified).toBe(1)
  })

  it('onbekend instrumentType laat assetklasse/geografie ongemoeid (onbekend is geen categorie)', async () => {
    const holdings = [makeHoldingRow({ id: 'h-raar', ticker: 'RAAR' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: 'FUTURE', exchangeName: 'ZZZ' }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    const write = updateLog.find((u) => u.id === 'h-raar')!
    expect('asset_class' in write.fields).toBe(false)
    expect('geography' in write.fields).toBe(false)
    // De beurscode hangt niet af van of wij het instrumenttype herkennen.
    expect(write.fields.exchange).toBe('ZZZ')
    expect(body.summary.classified).toBe(1)
    // De prijs wordt uiteraard wél gewoon bijgewerkt.
    expect(write.fields.current_price).toBe(100)
  })

  it('feed zonder type én zonder beurs schrijft geen enkel classificatieveld', async () => {
    const holdings = [makeHoldingRow({ id: 'h-kaal', ticker: 'KAAL' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: null, exchangeName: null }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    const write = updateLog.find((u) => u.id === 'h-kaal')!
    for (const col of ['asset_class', 'geography', 'exchange']) {
      expect(col in write.fields).toBe(false)
    }
    expect(body.summary.classified).toBe(0)
    expect(body.message).not.toMatch(/geclassificeerd/)
  })

  it('TWEEDE RONDE: al geclassificeerde posities blijven ongewijzigd (handmatige keuze wint)', async () => {
    // Exact de staat die de eerste ronde achterlaat, plus een handmatige keuze
    // die afwijkt van wat de feed zou afleiden.
    const holdings = [
      makeHoldingRow({
        id: 'h-al-gezet',
        ticker: 'ASML.AS',
        asset_class: 'aandelen',
        geography: 'nederland',
        exchange: 'AMS',
      }),
      makeHoldingRow({
        id: 'h-handmatig',
        ticker: 'VWRL.AS',
        asset_class: 'obligaties', // gebruiker weet dat dit een obligatie-ETF is
        geography: 'wereld',
        exchange: 'EURONEXT', // eigen schrijfwijze — mag niet overschreven worden
      }),
    ]
    mockFetchPriceData.mockImplementation(async (ticker: string) =>
      makePriceData({
        instrumentType: ticker === 'ASML.AS' ? 'EQUITY' : 'ETF',
        exchangeName: 'AMS',
      }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    for (const id of ['h-al-gezet', 'h-handmatig']) {
      const write = updateLog.find((u) => u.id === id)!
      expect('asset_class' in write.fields).toBe(false)
      expect('geography' in write.fields).toBe(false)
      expect('exchange' in write.fields).toBe(false)
    }
    // Niets nieuws geclassificeerd → de teller is eerlijk 0 bij een herhaling.
    expect(body.summary.classified).toBe(0)
  })

  it('legacy-sleutels equity/bonds worden genormaliseerd, geografie blijft ongemoeid', async () => {
    const holdings = [
      makeHoldingRow({ id: 'h-legacy-eq', ticker: 'MRVL', asset_class: 'equity', geography: 'noord_amerika' }),
      makeHoldingRow({ id: 'h-legacy-bd', ticker: 'BOND', asset_class: 'bonds', geography: 'europa' }),
    ]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: 'EQUITY', exchangeName: 'NMS' }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    expect(updateLog.find((u) => u.id === 'h-legacy-eq')!.fields.asset_class).toBe('aandelen')
    // 'bonds' → 'obligaties', ook al zegt de feed EQUITY: normalisatie van de
    // bestaande waarde, geen herclassificatie uit de feed.
    expect(updateLog.find((u) => u.id === 'h-legacy-bd')!.fields.asset_class).toBe('obligaties')
    for (const id of ['h-legacy-eq', 'h-legacy-bd']) {
      expect('geography' in updateLog.find((u) => u.id === id)!.fields).toBe(false)
    }
    expect(body.summary.classified).toBe(2)
  })

  it('classificatie komt niet uit de request-body — meegestuurde velden worden genegeerd', async () => {
    const holdings = [makeHoldingRow({ id: 'h-body', ticker: 'MRVL' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ instrumentType: 'EQUITY', exchangeName: 'NMS' }),
    )
    const updateLog = runWithHoldings(holdings)

    await callRoute(
      makeRequest({ bucket: 'investment', asset_class: 'crypto', geography: 'opkomend' }),
    )

    const write = updateLog.find((u) => u.id === 'h-body')!
    expect(write.fields.asset_class).toBe('aandelen') // feed wint, body genegeerd
    expect(write.fields.geography).toBe('noord_amerika')
  })

  it('leest de exchange-kolom mee — anders is "leeg" niet van "handmatig gezet" te onderscheiden', async () => {
    const selectLog: string[] = []
    const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = []
    mockFetchPriceData.mockResolvedValue(makePriceData())
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investment_holdings') {
        return makeInvestmentHoldingsChainFactory(
          [makeHoldingRow({ id: 'h-sel', ticker: 'SEL' })],
          () => ({ error: null }),
          updateLog,
          selectLog,
        )()
      }
      return makeGenericChain({ error: null })
    })

    await callRoute(makeRequest({ bucket: 'investment' }))

    expect(selectLog.length).toBeGreaterThan(0)
    for (const cols of ['asset_class', 'geography', 'exchange']) {
      expect(selectLog[0]).toContain(cols)
    }
  })

  // -------------------------------------------------------------------------
  // 5. 52-weeks bereik — KOERSveld, geen classificatie
  // -------------------------------------------------------------------------

  /**
   * Het verschil met de classificatie hierboven is het hele punt: assetklasse,
   * geografie en beurs worden ÉÉN keer ingevuld en daarna met rust gelaten; het
   * 52-weeks bereik schuift dagelijks op en moet dus ELKE ronde opnieuw uit de
   * verse feed komen. Landt het per ongeluk onder de "alleen als leeg"-regel,
   * dan bevriest de eerste refresh het bereik voorgoed — en dat is aan de
   * buitenkant onzichtbaar, want er staat gewoon een getal.
   */
  it('schrijft het 52-weeks bereik weg bij de koersvelden', async () => {
    const holdings = [makeHoldingRow({ id: 'h-52w', ticker: 'MRVL' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ fiftyTwoWeekHigh: 127.48, fiftyTwoWeekLow: 46.21 }),
    )
    const updateLog = runWithHoldings(holdings)

    await callRoute(makeRequest({ bucket: 'investment' }))

    const write = updateLog.find((u) => u.id === 'h-52w')!
    expect(write.fields.fifty_two_week_high).toBe(127.48)
    expect(write.fields.fifty_two_week_low).toBe(46.21)
  })

  it('ververst het bereik ÉLKE ronde — ook als de classificatie niets meer doet', async () => {
    // Exact de staat ná een eerdere refresh: alles al geclassificeerd.
    const holdings = [
      makeHoldingRow({
        id: 'h-tweede',
        ticker: 'MRVL',
        asset_class: 'aandelen',
        geography: 'noord_amerika',
        exchange: 'NMS',
      }),
    ]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({
        instrumentType: 'EQUITY',
        exchangeName: 'NMS',
        fiftyTwoWeekHigh: 131.0, // bereik is opgeschoven sinds de vorige ronde
        fiftyTwoWeekLow: 47.5,
      }),
    )
    const updateLog = runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    const write = updateLog.find((u) => u.id === 'h-tweede')!
    // Classificatie doet niets meer…
    expect(body.summary.classified).toBe(0)
    expect('asset_class' in write.fields).toBe(false)
    expect('exchange' in write.fields).toBe(false)
    // …maar het bereik wordt wél opnieuw geschreven.
    expect(write.fields.fifty_two_week_high).toBe(131.0)
    expect(write.fields.fifty_two_week_low).toBe(47.5)
  })

  it('overschrijft een bestaande waarde NIET met null wanneer de feed niets levert', async () => {
    const holdings = [makeHoldingRow({ id: 'h-geen-52w', ticker: 'THIN' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({ fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null }),
    )
    const updateLog = runWithHoldings(holdings)

    await callRoute(makeRequest({ bucket: 'investment' }))

    const write = updateLog.find((u) => u.id === 'h-geen-52w')!
    // De kolommen worden niet meegeschreven — de laatst bekende waarde blijft
    // staan i.p.v. leeggemaakt te worden door een tijdelijk magere feed.
    expect('fifty_two_week_high' in write.fields).toBe(false)
    expect('fifty_two_week_low' in write.fields).toBe(false)
    expect(write.fields.current_price).toBe(100) // de prijs gaat gewoon door
  })

  it('telt NIET mee in de classified-teller (anders is die teller betekenisloos)', async () => {
    const holdings = [
      makeHoldingRow({
        id: 'h-alles-gezet',
        ticker: 'MRVL',
        asset_class: 'aandelen',
        geography: 'noord_amerika',
        exchange: 'NMS',
      }),
    ]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({
        instrumentType: 'EQUITY',
        exchangeName: 'NMS',
        fiftyTwoWeekHigh: 131.0,
        fiftyTwoWeekLow: 47.5,
      }),
    )
    runWithHoldings(holdings)

    const res = await callRoute(makeRequest({ bucket: 'investment' }))
    const body = await res.json()

    expect(body.summary.updated).toBe(1)
    // Zou het bereik meetellen, dan was classified altijd gelijk aan updated.
    expect(body.summary.classified).toBe(0)
    expect(body.message).not.toMatch(/geclassificeerd/)
  })

  it('rekent het bereik mee om naar EUR — zelfde wisselkoers als de prijs', async () => {
    // EUR-gedenomineerde holding met een USD-koers: de route rekent prijs en
    // vorige slotkoers om. Blijft het bereik in USD staan, dan lijkt een
    // Amerikaans aandeel structureel op/onder zijn 52-weeks laag.
    const holdings = [makeHoldingRow({ id: 'h-usd', ticker: 'MRVL', currency: 'EUR' })]
    mockFetchPriceData.mockResolvedValue(
      makePriceData({
        currency: 'USD',
        price: 100,
        previousClose: 98,
        fiftyTwoWeekHigh: 130,
        fiftyTwoWeekLow: 50,
      }),
    )
    mockGetEURRateSync.mockReturnValue(0.9)
    const updateLog = runWithHoldings(holdings)

    await callRoute(makeRequest({ bucket: 'investment' }))

    const write = updateLog.find((u) => u.id === 'h-usd')!
    expect(write.fields.current_price).toBeCloseTo(90, 6)
    expect(write.fields.previous_close).toBeCloseTo(88.2, 6)
    expect(write.fields.currency).toBe('EUR')
    expect(write.fields.fifty_two_week_high).toBeCloseTo(117, 6)
    expect(write.fields.fifty_two_week_low).toBeCloseTo(45, 6)
  })
})
