import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tellers van de investment-kant in GET /api/holdings/refresh-prices/cron.
 *
 * Given een mix van posities (gesloten, broker-omschrijving als ticker, ISIN in
 * het tickerveld, een geldig symbool zonder koers en geldige symbolen mét koers)
 * When de nachtelijke koersronde draait
 * Then vraagt de cron alleen koersen op voor OPEN posities met een echte
 * symboolvorm, en telt hij gesloten (`closed`), niet-prijsbare
 * (`not_priceable`) en werkelijk gemiste (`stale`) posities apart.
 *
 * Aanleiding (17 sep 2026): productie meldde 109 van 134 posities als `stale`,
 * terwijl 104 daarvan gesloten waren en de rest omschrijvingen die Yahoo nooit
 * kan prijzen — de teller zei niets meer over echte koersuitval.
 */

const mockFetchPriceData = vi.fn()
vi.mock('@/lib/price-feed', () => ({
  fetchPriceData: (...a: unknown[]) => mockFetchPriceData(...a),
}))
vi.mock('@/lib/job-runs', () => ({ recordJobRun: vi.fn() }))
vi.mock('@/lib/holdings-classification', () => ({ buildClassificationUpdate: () => ({}) }))
vi.mock('@/lib/integrations/coingecko-client', () => ({ fetchCoinPricesEurBatch: async () => ({}) }))
vi.mock('@/lib/forex', () => ({ fetchBatchForexRates: async () => ({}) }))
vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromInvestmentHoldings: async () => ({ synced: true }),
  syncAssetValueFromCryptoHoldings: async () => ({ synced: true }),
}))
vi.mock('@/lib/integrations/exchange-cron', () => ({
  syncAllExchangeConnections: async () => ({ total: 0, ok: 0, failed: 0, skipped: 0, errors: [] }),
}))
vi.mock('@/lib/integrations/wallet-cron', () => ({
  syncAllWalletAddresses: async () => ({ total: 0, ok: 0, failed: 0, errors: [] }),
}))
vi.mock('@/lib/integrations/health-probe', () => ({ probeIntegrations: async () => [] }))

const INVESTMENT_ROWS = [
  { id: 'gesloten', user_id: 'u1', asset_id: 'a1', ticker: 'ASML.AS', isin: 'NL0010273215', units: 0, currency: 'EUR' },
  { id: 'open-asml', user_id: 'u2', asset_id: 'a2', ticker: 'ASML.AS', isin: 'NL0010273215', units: 4, currency: 'EUR' },
  { id: 'omschrijving', user_id: 'u1', asset_id: 'a1', ticker: 'AIRBUS SE', isin: 'NL0000235190', units: 5, currency: 'EUR' },
  { id: 'isin-als-ticker', user_id: 'u1', asset_id: 'a1', ticker: 'NL0011794037', isin: null, units: 3, currency: 'EUR' },
  { id: 'geen-koers', user_id: 'u3', asset_id: 'a3', ticker: 'MEESMAN-WWT', isin: null, units: 2, currency: 'EUR' },
  { id: 'mrvl', user_id: 'u1', asset_id: 'a1', ticker: 'MRVL', isin: 'US5738741041', units: 1, currency: 'USD' },
]

let updatedIds: string[]

function makeService() {
  function from(table: string) {
    const result =
      table === 'investment_holdings'
        ? { data: INVESTMENT_ROWS, error: null }
        : table === 'crypto_holdings'
          ? { data: [], error: null }
          : { data: null, error: null }
    let isUpdate = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      or: () => b,
      upsert: () => b,
      update: () => {
        isUpdate = true
        return b
      },
      eq: (col: string, val: string) => {
        if (isUpdate && col === 'id') updatedIds.push(val)
        return b
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(isUpdate ? { error: null } : result).then(res, rej),
    }
    return b
  }
  return { from }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeService() }))

import { GET } from './route'

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  updatedIds = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  delete process.env.CRON_SECRET
  mockFetchPriceData.mockImplementation(async (ticker: string) =>
    ticker === 'ASML.AS' || ticker === 'MRVL'
      ? {
          price: 100,
          previousClose: null,
          dailyChangePercent: null,
          currency: 'EUR',
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          source: 'cache',
        }
      : null,
  )
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('refresh-prices cron — investment-tellers', () => {
  it('vraagt alleen koersen op voor open posities met een echte symboolvorm', async () => {
    const res = await GET(new Request('https://x.test/api/holdings/refresh-prices/cron'))
    expect(res.status).toBe(200)

    const requested = mockFetchPriceData.mock.calls.map((c) => c[0]).sort()
    expect(requested).toEqual(['ASML.AS', 'MEESMAN-WWT', 'MRVL'])
  })

  it('telt gesloten, niet-prijsbaar en echt gemist apart', async () => {
    const res = await GET(new Request('https://x.test/api/holdings/refresh-prices/cron'))
    const body = await res.json()

    expect(body.summary.investment).toMatchObject({
      total: 6,
      closed: 1,
      not_priceable: 2,
      stale: 1,
      updated: 2,
      errors: 0,
    })
  })

  it('schrijft geen koers naar een gesloten positie, ook niet als hetzelfde symbool open elders wél een koers krijgt', async () => {
    await GET(new Request('https://x.test/api/holdings/refresh-prices/cron'))
    expect(updatedIds.sort()).toEqual(['mrvl', 'open-asml'])
  })
})
