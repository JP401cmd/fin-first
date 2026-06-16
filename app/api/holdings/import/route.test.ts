import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests voor POST /api/holdings/import — bulk import van investment_holdings
 * + investment_transactions met twee modes:
 *   - 'append' (default): legacy pad, units worden opgeteld bij bestaande holdings
 *   - 'snapshot': idempotente vervanging — units VERVANGEN, niet opgeteld;
 *     holdings die niet in de CSV zitten worden soft-deactivated.
 *
 * Mocking-strategie: dezelfde `mockFrom`-gebaseerde aanpak als
 * app/api/ai/recommendations/[id]/route.test.ts — een `from`-spy die per
 * tabel-naam een chainable mock retourneert.
 */

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted)
// ---------------------------------------------------------------------------

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSyncAssetValue = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromInvestmentHoldings: mockSyncAssetValue,
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_ID = 'user-uuid-1111'

/** Minimal valid holding for re-use across tests. */
function makeHolding(overrides: Partial<{
  name: string
  ticker: string | null
  isin: string | null
  units: number
  avg_purchase_price: number
  current_price: number | null
  purchase_date: string | null
  exchange: string | null
  asset_id: string | null
}> = {}) {
  return {
    name: 'VWCE',
    ticker: 'VWCE',
    isin: 'IE00B3RBWM25',
    units: 10,
    avg_purchase_price: 100,
    current_price: null,
    purchase_date: null,
    exchange: null,
    asset_id: null,
    ...overrides,
  }
}

/** Minimal valid transaction for re-use across tests. */
function makeTx(overrides: Partial<{
  holding_index: number
  type: 'buy' | 'sell' | 'dividend'
  units: number
  price_per_unit: number
  total_amount: number
  date: string | null
  fees: number
  notes: string | null
  external_trade_id?: string | null
}> = {}) {
  return {
    holding_index: 0,
    type: 'buy' as const,
    units: 10,
    price_per_unit: 100,
    total_amount: 1000,
    date: '2024-01-15',
    fees: 0,
    notes: null,
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

// ---------------------------------------------------------------------------
// Chainable query-builder builders
// ---------------------------------------------------------------------------

/**
 * Builds a fully chainable query mock.
 * The `resolveWith` value is what the chain returns when awaited.
 */
function makeChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain

  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(self)
  chain.limit = vi.fn(self)
  chain.single = vi.fn(() => Promise.resolve(resolveWith))
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveWith))
  chain.update = vi.fn(self)
  chain.insert = vi.fn(self)
  chain.upsert = vi.fn(() => Promise.resolve(resolveWith))

  // Make the chain itself thenable (for `await supabase.from(...).select(...).eq(...).eq(...)`)
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  return chain
}

// ---------------------------------------------------------------------------
// 1. 401 — niet ingelogd
// ---------------------------------------------------------------------------

describe('POST /api/holdings/import', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthGetUser.mockReset()
    mockFrom.mockReset()
    mockSyncAssetValue.mockReset()
    mockSyncAssetValue.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
    }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/ingelogd/i)
  })

  // ---------------------------------------------------------------------------
  // 2. Snapshot validation — 400's
  // ---------------------------------------------------------------------------

  it('snapshot without targetAssetId → 400', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      // no targetAssetId
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Snapshot-import vereist een doel-asset')
  })

  it('snapshot with non-uuid targetAssetId → 400', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: 'not-a-uuid',
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('targetAssetId moet een geldige uuid zijn')
  })

  it('snapshot with targetAssetId not owned by user → 404', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // For this test we only need the assets ownership-check chain to resolve null.
    // The route hits `from('assets').select('id').eq('id',...).eq('user_id',...).maybeSingle()`
    const ownershipChain = makeChain({ data: null, error: null })
    mockFrom.mockImplementation(() => ownershipChain)

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Doel-asset niet gevonden')
  })

  // ---------------------------------------------------------------------------
  // 3. APPEND regression — legacy path unchanged
  // ---------------------------------------------------------------------------

  it('APPEND (no mode field): existing holding — units are ADDED, not replaced', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const existingHoldingId = 'existing-holding-id'
    const existingUnits = 5
    const importedUnits = 10
    const expectedUnits = existingUnits + importedUnits  // 15

    // Track what was passed to .update()
    let capturedUpdates: Record<string, unknown> | undefined

    // Call sequence for APPEND (no snapshot):
    //   1. from('assets') .select .eq .in .limit .single → defaultAsset
    //   2. from('investment_holdings') .select .eq .eq → existingHoldings (thenable)
    //   3. from('investment_holdings') .update .eq .eq → (for matched holding update)

    const holdingsExistingChain = makeChain({
      data: [
        {
          id: existingHoldingId,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: existingUnits,
          avg_purchase_price: 100,
          asset_id: 'asset-id-1',
        },
      ],
      error: null,
    })

    const holdingsUpdateChain = {
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    }
    holdingsUpdateChain.update = vi.fn((updates: Record<string, unknown>) => {
      capturedUpdates = updates
      return holdingsUpdateChain
    })
    // Final .eq().eq() should resolve
    let eqCount = 0
    holdingsUpdateChain.eq = vi.fn().mockImplementation(() => {
      eqCount++
      if (eqCount >= 2) return Promise.resolve({ error: null })
      return holdingsUpdateChain
    })

    const defaultAssetChain = makeChain({ data: { id: 'asset-id-1' }, error: null })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) {
        // Default asset lookup
        return defaultAssetChain
      }
      if (table === 'investment_holdings' && fromCallIndex === 2) {
        // Existing holdings fetch
        return holdingsExistingChain
      }
      if (table === 'investment_holdings' && fromCallIndex === 3) {
        // Update existing holding
        return holdingsUpdateChain
      }
      // Fallback
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: importedUnits, avg_purchase_price: 110 })],
      transactions: [],
      broker: 'degiro',
      // NO mode field — defaults to 'append'
    }))

    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.summary.holdings_updated).toBe(1)
    expect(body.summary.holdings_created).toBe(0)
    expect(body.summary.holdings_deactivated).toBe(0)

    // The critical assertion: units must be ADDED (15), not replaced (10)
    expect(capturedUpdates!['units']).toBe(expectedUnits)
    // Weighted avg: (100*5 + 110*10) / 15 = (500 + 1100) / 15 = 1600/15 ≈ 106.67
    expect(capturedUpdates!['avg_purchase_price']).toBeCloseTo(106.67, 1)
  })

  // ---------------------------------------------------------------------------
  // 4. SNAPSHOT match → REPLACE (not accumulate)
  // ---------------------------------------------------------------------------

  it('SNAPSHOT match: units REPLACE existing value, is_active set to true', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const existingHoldingId = 'existing-snapshot-holding'
    const existingUnits = 5
    const importedUnits = 12  // should REPLACE, not add

    let capturedUpdates: Record<string, unknown> | undefined

    // Snapshot call sequence:
    //   1. from('assets') .select .eq .eq .maybeSingle → targetAsset ownership check
    //   2. from('assets') .select .eq .in .limit .single → defaultAsset
    //   3. from('investment_holdings') .select .eq .eq .eq → existingHoldings (scoped to asset)
    //   4. from('investment_holdings') .update .eq .eq → update existing holding

    const ownershipChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })

    const holdingsExistingChain = makeChain({
      data: [
        {
          id: existingHoldingId,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: existingUnits,
          avg_purchase_price: 100,
          asset_id: VALID_UUID,
        },
      ],
      error: null,
    })

    const holdingsUpdateChain = {
      update: vi.fn(),
      eq: vi.fn().mockReturnThis(),
    }
    holdingsUpdateChain.update = vi.fn((updates: Record<string, unknown>) => {
      capturedUpdates = updates
      return holdingsUpdateChain
    })
    let eqUpdateCount = 0
    holdingsUpdateChain.eq = vi.fn().mockImplementation(() => {
      eqUpdateCount++
      if (eqUpdateCount >= 2) return Promise.resolve({ error: null })
      return holdingsUpdateChain
    })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return holdingsUpdateChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: importedUnits, avg_purchase_price: 115 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.summary.holdings_updated).toBe(1)
    expect(body.summary.holdings_created).toBe(0)

    // SNAPSHOT: units must be the CSV value, NOT added to existing
    expect(capturedUpdates!['units']).toBe(importedUnits)
    expect(capturedUpdates!['units']).not.toBe(existingUnits + importedUnits)

    // avg_purchase_price must be rounded (not a weighted average)
    expect(capturedUpdates!['avg_purchase_price']).toBe(115)

    // is_active must be explicitly set to true (re-activate if previously soft-deleted)
    expect(capturedUpdates!['is_active']).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 5. SNAPSHOT deactivation — unmatched holdings get soft-deactivated
  // ---------------------------------------------------------------------------

  it('SNAPSHOT: existing holding NOT in CSV is soft-deactivated, summary reflects count', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const matchedHoldingId = 'holding-in-csv'
    const soldHoldingId = 'holding-sold'

    let deactivateInArg: string[] | undefined
    let deactivateUpdates: Record<string, unknown> | undefined

    const ownershipChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })

    // Existing holds TWO holdings; the CSV only contains one (VWCE)
    const holdingsExistingChain = makeChain({
      data: [
        {
          id: matchedHoldingId,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: 5,
          avg_purchase_price: 100,
          asset_id: VALID_UUID,
        },
        {
          id: soldHoldingId,
          ticker: 'MSFT',
          isin: null,
          units: 3,
          avg_purchase_price: 300,
          asset_id: VALID_UUID,
        },
      ],
      error: null,
    })

    // Update chain for the matched holding (.update().eq().eq())
    const matchUpdateChain = { update: vi.fn(), eq: vi.fn().mockReturnThis() }
    matchUpdateChain.update = vi.fn(() => matchUpdateChain)
    let matchEqCount = 0
    matchUpdateChain.eq = vi.fn().mockImplementation(() => {
      matchEqCount++
      if (matchEqCount >= 2) return Promise.resolve({ error: null })
      return matchUpdateChain
    })

    // Deactivate chain for sold holdings (.update().in().eq())
    const deactivateChain = {
      update: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    }
    deactivateChain.update = vi.fn((updates: Record<string, unknown>) => {
      deactivateUpdates = updates
      return deactivateChain
    })
    deactivateChain.in = vi.fn((_col: unknown, ids: string[]) => {
      deactivateInArg = ids
      return deactivateChain
    })
    deactivateChain.eq = vi.fn(() => Promise.resolve({ error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return matchUpdateChain
      if (table === 'investment_holdings' && fromCallIndex === 5) return deactivateChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      // CSV only has VWCE — MSFT is "sold"
      holdings: [makeHolding({ units: 10 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    const body = await res.json()

    // Summary must report the deactivated count
    expect(body.summary.holdings_deactivated).toBe(1)
    expect(body.summary.holdings_updated).toBe(1)

    // The .in('id', [...]) call must have contained the sold holding ID
    expect(deactivateInArg).toEqual([soldHoldingId])

    // The update payload must zero units and set is_active false
    expect(deactivateUpdates!['units']).toBe(0)
    expect(deactivateUpdates!['is_active']).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 6. SNAPSHOT skips plain-insert transactions (no external_trade_id)
  // ---------------------------------------------------------------------------

  it('SNAPSHOT: transaction without external_trade_id is NOT plain-inserted', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // Track whether investment_transactions.insert() was called
    let txPlainInsertCalled = false
    let txUpsertCalled = false

    const ownershipChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })

    const existingHoldingId = 'h-id-1'
    const holdingsExistingChain = makeChain({
      data: [
        {
          id: existingHoldingId,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: 5,
          avg_purchase_price: 100,
          asset_id: VALID_UUID,
        },
      ],
      error: null,
    })

    const matchUpdateChain = { update: vi.fn(), eq: vi.fn().mockReturnThis() }
    matchUpdateChain.update = vi.fn(() => matchUpdateChain)
    let mEqCount = 0
    matchUpdateChain.eq = vi.fn().mockImplementation(() => {
      mEqCount++
      if (mEqCount >= 2) return Promise.resolve({ error: null })
      return matchUpdateChain
    })

    const txInsertChain = {
      insert: vi.fn(() => {
        txPlainInsertCalled = true
        return Promise.resolve({ error: null })
      }),
      upsert: vi.fn(() => {
        txUpsertCalled = true
        return Promise.resolve({ error: null })
      }),
    }

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return matchUpdateChain
      if (table === 'investment_transactions') return txInsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      // A transaction WITHOUT external_trade_id — should be skipped in snapshot mode
      transactions: [makeTx({ external_trade_id: null })],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)

    // Plain insert MUST NOT have been called
    expect(txPlainInsertCalled).toBe(false)
    // Upsert also not called (no rows with external_trade_id)
    expect(txUpsertCalled).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 7. APPEND: transaction without external_trade_id IS plain-inserted
  // ---------------------------------------------------------------------------

  it('APPEND: transaction without external_trade_id IS plain-inserted', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    let txPlainInsertCalled = false
    let capturedInsertRows: unknown = null

    const existingHoldingId = 'h-id-append'
    const defaultAssetChain = makeChain({ data: { id: 'asset-id-append' }, error: null })

    const holdingsExistingChain = makeChain({
      data: [
        {
          id: existingHoldingId,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: 5,
          avg_purchase_price: 100,
          asset_id: 'asset-id-append',
        },
      ],
      error: null,
    })

    const matchUpdateChain = { update: vi.fn(), eq: vi.fn().mockReturnThis() }
    matchUpdateChain.update = vi.fn(() => matchUpdateChain)
    let mEqCount = 0
    matchUpdateChain.eq = vi.fn().mockImplementation(() => {
      mEqCount++
      if (mEqCount >= 2) return Promise.resolve({ error: null })
      return matchUpdateChain
    })

    const txInsertChain = {
      insert: vi.fn((rows: unknown) => {
        txPlainInsertCalled = true
        capturedInsertRows = rows
        return Promise.resolve({ error: null })
      }),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 2) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return matchUpdateChain
      if (table === 'investment_transactions') return txInsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      // transaction WITHOUT external_trade_id — append mode should plain-insert it
      transactions: [makeTx({ external_trade_id: null })],
      broker: 'degiro',
      // no mode → 'append'
    }))

    expect(res.status).toBe(201)
    expect(txPlainInsertCalled).toBe(true)
    // The insert rows should be an array with 1 entry
    expect(Array.isArray(capturedInsertRows)).toBe(true)
    expect((capturedInsertRows as unknown[]).length).toBe(1)
  })
})
