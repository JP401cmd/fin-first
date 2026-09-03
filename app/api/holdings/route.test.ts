import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressietest WF-BEZIT-21 (S0): `POST /api/holdings` schreef ELKE holding
 * onvoorwaardelijk naar `investment_holdings`, ook wanneer de meegegeven
 * `asset_id` naar een crypto-asset wees. De crypto-holding werd zo onzichtbaar
 * op de crypto-pagina, en de daaropvolgende asset-value-sync (die
 * `crypto_holdings` bevraagt) vond 0 rijen en nulde de bestaande asset-waarde.
 *
 * De fix routeert/valideert op basis van het `asset_type` van de asset: een
 * crypto-asset_id wordt geweigerd (400) i.p.v. stilzwijgend in de verkeerde
 * tabel geschreven. Een investment-asset gedraagt zich ongewijzigd.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSyncAssetValue = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
  getAuthClaims: vi.fn(),
}))

vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromHoldings: (...args: unknown[]) => mockSyncAssetValue(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }
const ASSET_ID = 'asset-crypto-1'

/** Chainable Supabase-query stub die op elke terminal hetzelfde resultaat geeft. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'ilike', 'in', 'limit', 'order']) {
    chain[m] = () => chain
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

const insertSpy = vi.fn()

/**
 * Bouwt een `from`-dispatcher. `assetType` bepaalt wat de asset-type-lookup
 * teruggeeft; investment_holdings.insert wordt via `insertSpy` opgevangen.
 */
function setupFrom(assetType: string) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'assets') {
      return makeChain({ data: { asset_type: assetType, id: ASSET_ID }, error: null })
    }
    if (table === 'investment_holdings') {
      const chain = makeChain({ data: [], error: null }) as Record<string, unknown>
      chain.insert = (row: Record<string, unknown>) => {
        insertSpy(row)
        return makeChain({ data: { id: 'holding-1', asset_id: ASSET_ID }, error: null })
      }
      return chain
    }
    return makeChain({ data: null, error: null })
  })
}

function postRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  mockAuthGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockFrom.mockReset()
  mockSyncAssetValue.mockReset().mockResolvedValue({ synced: true, totalValue: 0 })
  insertSpy.mockReset()
})

describe('POST /api/holdings — crypto-asset_id routing (WF-BEZIT-21)', () => {
  it('weigert een POST met een crypto-asset_id (400) en schrijft NIET in investment_holdings', async () => {
    setupFrom('crypto')

    const res = await POST(
      postRequest({
        asset_id: ASSET_ID,
        name: 'Bitcoin',
        units: 0.5,
        avg_purchase_price: 25000,
        current_price: 58000,
      }),
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(typeof json.error).toBe('string')
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('laat een investment-asset_id ongewijzigd door naar investment_holdings (201)', async () => {
    setupFrom('investment')

    const res = await POST(
      postRequest({
        asset_id: ASSET_ID,
        name: 'VWRL',
        units: 10,
        avg_purchase_price: 90,
        current_price: 100,
      }),
    )

    expect(res.status).toBe(201)
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })
})

/**
 * Regressietest WF-BEZIT-14-bug4 (S1): `investment_holdings.ticker` is NOT NULL
 * (migratie 20260502000003), maar de route bouwde `ticker: ticker || null`. Wie
 * het optioneel ogende veld "Ticker / ISIN" leeg liet, kreeg daardoor een
 * constraint-schending en dus een generieke 500 — er werd géén rij aangemaakt.
 *
 * De fix leidt de ticker af uit de naam, precies zoals de backfill in diezelfde
 * migratie (`COALESCE(h.ticker, h.name)`) en de CSV-import doen. De insert-rij
 * mag dus nooit meer een lege of null-ticker dragen.
 */
describe('POST /api/holdings — lege ticker valt terug op de naam (WF-BEZIT-14-bug4)', () => {
  it('insert zonder ticker-veld draagt de naam als ticker (nooit null)', async () => {
    setupFrom('investment')

    const res = await POST(
      postRequest({
        asset_id: ASSET_ID,
        name: 'Vanguard S&P 500 UCITS',
        units: 50,
        avg_purchase_price: 95,
      }),
    )

    expect(res.status).toBe(201)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy.mock.calls[0][0].ticker).toBe('Vanguard S&P 500 UCITS')
  })

  it('insert met een lege/whitespace ticker valt eveneens terug op de naam', async () => {
    setupFrom('investment')

    await POST(
      postRequest({
        asset_id: ASSET_ID,
        name: '  Meesman Aandelen Wereldwijd  ',
        ticker: '   ',
        units: 10,
        avg_purchase_price: 100,
      }),
    )

    expect(insertSpy.mock.calls[0][0].ticker).toBe('Meesman Aandelen Wereldwijd')
  })

  it('laat een ingevulde ticker ongemoeid (alleen getrimd)', async () => {
    setupFrom('investment')

    await POST(
      postRequest({
        asset_id: ASSET_ID,
        name: 'Vanguard FTSE All-World',
        ticker: ' VWRL ',
        units: 10,
        avg_purchase_price: 100,
      }),
    )

    expect(insertSpy.mock.calls[0][0].ticker).toBe('VWRL')
  })
})
