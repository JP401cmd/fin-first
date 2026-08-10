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
const mockSyncHoldingAggregates = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromInvestmentHoldings: mockSyncAssetValue,
  syncHoldingAggregatesFromTransactions: mockSyncHoldingAggregates,
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
  /** Het rúwe broker-id; de server leidt de dedup-sleutel hieruit af. */
  external_id?: string | null
  /** Bewust genegeerd door de route — de sleutel is server-bepaald. */
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
  chain.delete = vi.fn(self)
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
    mockSyncHoldingAggregates.mockReset()
    mockSyncHoldingAggregates.mockResolvedValue({ synced: true, units: 0, avgPurchasePrice: 0 })
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
      // no targetAssetId and no newAssetName
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Snapshot-import vereist een doel-bezitting')
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

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
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

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
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
  // 6. De dedup-sleutel is SERVER-bepaald
  // ---------------------------------------------------------------------------
  //
  // Het bankpad (/api/transactions/import) herberekent `import_hash` zelf en
  // negeert wat de client stuurt. Deze route hoort hetzelfde te doen: een
  // client-geleverde sleutel is een vertrouwensgrens die je niet weggeeft — een
  // sleutel die met een bestaande rij botst zou die rij stil als duplicaat laten
  // overslaan.

  /** Mock-opstelling voor een append-import zonder doel-bezitting, die de
   *  weggeschreven transactierijen vastlegt. */
  function captureUpsertedRows() {
    const captured: { rows: Array<Record<string, unknown>> } = { rows: [] }

    const defaultAssetChain = makeChain({ data: { id: 'asset-1' }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })
    const holdingInsertChain = makeChain({ data: { id: 'h-1', asset_id: 'asset-1' }, error: null })

    const txChain: Record<string, unknown> = {}
    txChain.upsert = vi.fn((rows: Array<Record<string, unknown>>) => {
      captured.rows = rows
      return txChain
    })
    txChain.select = vi.fn(() => Promise.resolve({ data: rows2ids(captured.rows), error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 2) return holdingsExistingChain
      // Elke volgende holdings-aanroep is een insert — het aantal hangt af van
      // hoeveel holdings de test meestuurt.
      if (table === 'investment_holdings') return holdingInsertChain
      if (table === 'investment_transactions') return txChain
      return makeChain({ data: null, error: null })
    })

    return captured
  }

  function rows2ids(rows: Array<Record<string, unknown>>) {
    return rows.map((_, i) => ({ id: `tx-${i}` }))
  }

  it('negeert een client-geleverde external_trade_id en leidt de sleutel zelf af', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const captured = captureUpsertedRows()

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [makeTx({ external_trade_id: 'VERZONNEN-DOOR-DE-CLIENT' })],
      broker: 'degiro',
    }))

    expect(res.status).toBe(201)
    expect(captured.rows[0].external_trade_id).not.toBe('VERZONNEN-DOOR-DE-CLIENT')
    // Zonder broker-id valt de sleutel terug op de inhoud van de rij: datum,
    // instrument, soort, aantal, prijs en bedrag — met vaste decimalen, zodat
    // drijvendekomma-ruis dezelfde transactie niet twee sleutels geeft.
    expect(captured.rows[0].external_trade_id).toBe(
      'row|2024-01-15|IE00B3RBWM25|buy|10.000000|100.0000|1000.00',
    )
  })

  it('gebruikt het broker-id wanneer de export er een levert', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const captured = captureUpsertedRows()

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [makeTx({ external_id: 'order-a' })],
      broker: 'degiro',
    }))

    expect(res.status).toBe(201)
    // Soort en datum horen erbij: eToro geeft de open- en sluitregel van dezelfde
    // positie hetzelfde id, dus het id alleen zou de sluitregel als duplicaat
    // van de openregel laten sneuvelen.
    expect(captured.rows[0].external_trade_id).toBe('id:order-a|buy|2024-01-15')
  })

  it('de sleutel volgt de BESTANDSVOLGORDE, niet de holding-groepering', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const captured = captureUpsertedRows()

    // Twee identieke rijen van hetzelfde fonds met daartussen een rij van een
    // ander fonds — precies het geval waarin groeperen-per-holding het volgnummer
    // zou laten verschuiven en een overlappende upload dubbele rijen zou geven.
    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 }), makeHolding({ isin: 'NL0011794037', ticker: 'NT', units: 1 })],
      transactions: [
        makeTx({ holding_index: 0 }),
        makeTx({ holding_index: 1, units: 1, price_per_unit: 50, total_amount: 50 }),
        makeTx({ holding_index: 0 }),
      ],
      broker: 'degiro',
    }))

    expect(res.status).toBe(201)
    const keys = captured.rows.map((r) => r.external_trade_id)
    // Rij 1 en 3 zijn identiek → de tweede krijgt een volgnummer, zodat een
    // deelexecutie niet als duplicaat van de eerste sneuvelt.
    expect(keys[0]).not.toBe(keys[2])
    expect(String(keys[2])).toContain('#2')
    expect(new Set(keys).size).toBe(3)
  })

  it('schrijft alles via upsert weg — er is geen rij meer zonder dedup-sleutel', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    let plainInsertCalled = false
    const defaultAssetChain = makeChain({ data: { id: 'asset-1' }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })
    const holdingInsertChain = makeChain({ data: { id: 'h-1', asset_id: 'asset-1' }, error: null })

    const txChain: Record<string, unknown> = {}
    txChain.upsert = vi.fn(() => txChain)
    txChain.select = vi.fn(() => Promise.resolve({ data: [{ id: 'tx-0' }], error: null }))
    txChain.insert = vi.fn(() => {
      plainInsertCalled = true
      return Promise.resolve({ error: null })
    })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 2) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingInsertChain
      if (table === 'investment_transactions') return txChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [makeTx()],
      broker: 'degiro',
      // append (default): vroeger ging een rij zonder sleutel hier plain-insert
      // in, en dat was precies het pad waarlangs overlap dubbele rijen gaf.
    }))

    expect(res.status).toBe(201)
    expect(plainInsertCalled).toBe(false)
    expect(txChain.upsert).toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // 8. clearExisting — harde delete van de doel-bezitting vóór de import
  // ---------------------------------------------------------------------------

  it('clearExisting: verwijdert alle posities van de doel-bezitting en meldt het aantal', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    let deleteCalled = false
    const deleteFilters: Array<[string, unknown]> = []

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })

    // .delete().eq('user_id').eq('asset_id').select('id') → twee verwijderde rijen
    const deleteChain: Record<string, unknown> = {}
    deleteChain.delete = vi.fn(() => {
      deleteCalled = true
      return deleteChain
    })
    deleteChain.eq = vi.fn((col: string, val: unknown) => {
      deleteFilters.push([col, val])
      return deleteChain
    })
    deleteChain.select = vi.fn(() =>
      Promise.resolve({ data: [{ id: 'gone-1' }, { id: 'gone-2' }], error: null }),
    )

    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    // Na het wissen is de bezitting leeg — geen bestaande posities meer.
    const holdingsExistingChain = makeChain({ data: [], error: null })
    const insertChain = makeChain({ data: { id: 'new-h', asset_id: VALID_UUID }, error: null })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'investment_holdings' && fromCallIndex === 2) return deleteChain
      if (table === 'assets' && fromCallIndex === 3) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 5) return insertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
      clearExisting: true,
    }))

    expect(res.status).toBe(201)
    expect(deleteCalled).toBe(true)
    // De delete is strikt afgebakend: eigen rijen én alleen dit asset.
    expect(deleteFilters).toEqual([
      ['user_id', USER_ID],
      ['asset_id', VALID_UUID],
    ])

    const body = await res.json()
    expect(body.summary.holdings_deleted).toBe(2)
    // Alles is daarna nieuw — niets om bij te werken of te deactiveren.
    expect(body.summary.holdings_created).toBe(1)
    expect(body.summary.holdings_updated).toBe(0)
    expect(body.summary.holdings_deactivated).toBe(0)
  })

  it('clearExisting zonder doel-bezitting → 400', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
      // append zonder doel — wissen zou de hele portefeuille raken
      clearExisting: true,
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('één bezitting')
  })

  // ---------------------------------------------------------------------------
  // 9. newAssetName — de wizard laat een nieuwe bezitting aanmaken
  // ---------------------------------------------------------------------------

  it('newAssetName: maakt de bezitting aan en pint de import erop vast', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const CREATED_ASSET_ID = 'created-asset-id'
    let createdAssetRow: Record<string, unknown> | undefined
    let insertedHolding: Record<string, unknown> | undefined

    const createAssetChain: Record<string, unknown> = {}
    createAssetChain.insert = vi.fn((row: Record<string, unknown>) => {
      createdAssetRow = row
      return createAssetChain
    })
    createAssetChain.select = vi.fn(() => createAssetChain)
    createAssetChain.single = vi.fn(() =>
      Promise.resolve({ data: { id: CREATED_ASSET_ID }, error: null }),
    )

    const defaultAssetChain = makeChain({ data: { id: 'some-other-asset' }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })

    const holdingInsertChain: Record<string, unknown> = {}
    holdingInsertChain.insert = vi.fn((row: Record<string, unknown>) => {
      insertedHolding = row
      return holdingInsertChain
    })
    holdingInsertChain.select = vi.fn(() => holdingInsertChain)
    holdingInsertChain.single = vi.fn(() =>
      Promise.resolve({ data: { id: 'h-new', asset_id: CREATED_ASSET_ID }, error: null }),
    )

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return createAssetChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return holdingInsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      newAssetName: '  DEGIRO beleggingsrekening  ',
    }))

    expect(res.status).toBe(201)
    // Naam getrimd, als belegging aangemaakt, en meteen met posities-weergave aan
    // (staat standaard op false — anders blijft het overzicht leeg).
    expect(createdAssetRow!.name).toBe('DEGIRO beleggingsrekening')
    expect(createdAssetRow!.asset_type).toBe('investment')
    expect(createdAssetRow!.has_holdings_tracking).toBe(true)
    // De positie hangt aan de NIEUWE bezitting, niet aan de default-bak.
    expect(insertedHolding!.asset_id).toBe(CREATED_ASSET_ID)

    const body = await res.json()
    expect(body.summary.asset_id).toBe(CREATED_ASSET_ID)
  })

  it('targetAssetId én newAssetName samen → 400', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding()],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
      newAssetName: 'Dubbelop',
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('niet allebei')
  })

  // ---------------------------------------------------------------------------
  // 10. APPEND mét doel-bezitting — het pad van een transactie-export
  // ---------------------------------------------------------------------------

  it('APPEND met targetAssetId: blijft binnen die bezitting en deactiveert NIETS', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const existingEqFilters: Array<[string, unknown]> = []
    let deactivateCalled = false

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })

    // De existing-query: leg de filters vast om de afbakening te bewijzen.
    const holdingsExistingChain: Record<string, unknown> = {}
    holdingsExistingChain.select = vi.fn(() => holdingsExistingChain)
    holdingsExistingChain.eq = vi.fn((col: string, val: unknown) => {
      existingEqFilters.push([col, val])
      return holdingsExistingChain
    })
    ;(holdingsExistingChain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            id: 'holding-untouched',
            ticker: 'MSFT',
            isin: null,
            units: 3,
            avg_purchase_price: 300,
            asset_id: VALID_UUID,
          },
        ],
        error: null,
      }).then(resolve)

    const holdingInsertChain = makeChain({ data: { id: 'h-new', asset_id: VALID_UUID }, error: null })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return holdingInsertChain
      if (table === 'investment_holdings' && fromCallIndex >= 5) {
        deactivateCalled = true
        return makeChain({ data: null, error: null })
      }
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      // VWCE zit niet in de bestaande set; MSFT wél maar niet in dit bestand
      holdings: [makeHolding({ units: 10 })],
      transactions: [],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    // Afgebakend tot de gekozen bezitting — niet de hele portefeuille.
    expect(existingEqFilters).toContainEqual(['asset_id', VALID_UUID])

    const body = await res.json()
    // MSFT stond niet in het bestand maar blijft ongemoeid: een transactie-export
    // beslaat maar een periode en bewijst niets over de rest van je bezit.
    expect(body.summary.holdings_deactivated).toBe(0)
    expect(deactivateCalled).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 11. has_holdings_tracking wordt aangezet als die uitstond
  // ---------------------------------------------------------------------------

  it('zet has_holdings_tracking aan wanneer de doel-bezitting die uit had staan', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    let trackingUpdate: Record<string, unknown> | undefined

    const ownershipChain = makeChain({
      data: { id: VALID_UUID, has_holdings_tracking: false },
      error: null,
    })

    const trackingChain: Record<string, unknown> = {}
    trackingChain.update = vi.fn((updates: Record<string, unknown>) => {
      trackingUpdate = updates
      return trackingChain
    })
    let trackingEq = 0
    trackingChain.eq = vi.fn(() => {
      trackingEq++
      if (trackingEq >= 2) return Promise.resolve({ error: null })
      return trackingChain
    })

    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })
    const insertChain = makeChain({ data: { id: 'h-1', asset_id: VALID_UUID }, error: null })

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return trackingChain
      if (table === 'assets' && fromCallIndex === 3) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 5) return insertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    expect(trackingUpdate).toEqual({ has_holdings_tracking: true })
  })

  // ---------------------------------------------------------------------------
  // 12. Overlappende transactie-upload — de bug uit de melding
  // ---------------------------------------------------------------------------
  //
  // De gebruiker mag bij zijn broker een ruimere periode exporteren dan strikt
  // nodig; liever overlap dan een gat. Dat vraagt twee dingen tegelijk:
  //   (a) de transactieRIJ mag niet dubbel binnenkomen — dat doet de unieke
  //       index via de dedup-sleutel;
  //   (b) het AANTAL mag niet dubbel meetellen. Dat is de val: de client stuurt
  //       een netto positie mee die uit het BESTAND volgt, en die optellen bij
  //       wat er al stond telt elke overlappende transactie alsnog een tweede
  //       keer mee. Vandaar dat de positie na afloop opnieuw wordt afgeleid uit
  //       de transacties die daadwerkelijk in de database staan.

  it('OVERLAP: al bekende transacties worden overgeslagen en tellen niet dubbel in de positie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const EXISTING_HOLDING = 'h-overlap'
    let upsertedRows: Array<Record<string, unknown>> = []
    let onConflictOpts: Record<string, unknown> | undefined

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })

    // De positie stond al op 10 stuks uit een eerdere import.
    const holdingsExistingChain = makeChain({
      data: [
        {
          id: EXISTING_HOLDING,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: 10,
          avg_purchase_price: 100,
          asset_id: VALID_UUID,
        },
      ],
      error: null,
    })

    const matchUpdateChain: Record<string, unknown> = {}
    matchUpdateChain.update = vi.fn(() => matchUpdateChain)
    let matchEq = 0
    matchUpdateChain.eq = vi.fn(() => {
      matchEq++
      if (matchEq >= 2) return Promise.resolve({ error: null })
      return matchUpdateChain
    })

    // Upsert: beide rijen zaten er al → RETURNING levert niets terug.
    const txUpsertChain: Record<string, unknown> = {}
    txUpsertChain.upsert = vi.fn((rows: Array<Record<string, unknown>>, opts: Record<string, unknown>) => {
      upsertedRows = rows
      onConflictOpts = opts
      return txUpsertChain
    })
    txUpsertChain.select = vi.fn(() => Promise.resolve({ data: [], error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return matchUpdateChain
      if (table === 'investment_transactions' && fromCallIndex === 5) return txUpsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      // Het opnieuw geüploade bestand bevat dezelfde koop van 10.
      holdings: [makeHolding({ units: 10 })],
      transactions: [makeTx({ units: 10, external_id: 'order-a' })],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)

    // De sleutel bereikt de database — zonder deze regel is ontdubbelen onmogelijk.
    // Hij is SERVER-afgeleid uit het meegestuurde broker-id, soort en datum.
    expect(upsertedRows[0].external_trade_id).toBe('id:order-a|buy|2024-01-15')
    // onConflict MOET de kolommen van de unieke index noemen, inclusief user_id:
    // broker-trade-ids zijn niet globaal uniek (Trading 212 'T-001', eToro).
    expect(onConflictOpts?.onConflict).toBe('user_id,external_source,external_trade_id')
    expect(onConflictOpts?.ignoreDuplicates).toBe(true)

    const body = await res.json()
    // Niets nieuws ingevoegd, één rij herkend als al aanwezig.
    expect(body.summary.transactions_created).toBe(0)
    expect(body.summary.transactions_deduped).toBe(1)

    // DE KERN: de positie wordt opnieuw AFGELEID uit de transacties die in de
    // database staan, in plaats van opgeteld bij wat er al stond. Zonder deze
    // stap zou een overlappende upload het aantal verdubbelen terwijl de
    // transactierij zelf keurig is ontdubbeld. De afleiding zelf is de canonieke
    // helper (getest in lib/holdings-sync.test.ts) — hier bewijzen we dat de
    // import 'm aanroept voor de geraakte positie, en dus geen eigen som doet.
    expect(mockSyncHoldingAggregates).toHaveBeenCalledTimes(1)
    expect(mockSyncHoldingAggregates).toHaveBeenCalledWith(
      expect.anything(),
      { holdings: 'investment_holdings', transactions: 'investment_transactions' },
      EXISTING_HOLDING,
      USER_ID,
    )
  })

  it('een mislukte herberekening laat de import NIET als geslaagd eindigen', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // De append-tak heeft het aantal dan al incrementeel opgehoogd; stilzwijgend
    // 201 teruggeven zou een te hoge positie als succes presenteren.
    mockSyncHoldingAggregates.mockResolvedValue({ synced: false, units: 0, avgPurchasePrice: 0 })

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })
    const insertChain = makeChain({ data: { id: 'h-1', asset_id: VALID_UUID }, error: null })
    const txUpsertChain: Record<string, unknown> = {}
    txUpsertChain.upsert = vi.fn(() => txUpsertChain)
    txUpsertChain.select = vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return insertChain
      if (table === 'investment_transactions' && fromCallIndex === 5) return txUpsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 10 })],
      transactions: [makeTx({ external_trade_id: 'k-1' })],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(500)
  })

  it('APPEND: nieuwe transacties worden geteld en de positie volgt uit de volledige historie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const EXISTING_HOLDING = 'h-groei'

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const holdingsExistingChain = makeChain({
      data: [
        {
          id: EXISTING_HOLDING,
          ticker: 'VWCE',
          isin: 'IE00B3RBWM25',
          units: 10,
          avg_purchase_price: 100,
          asset_id: VALID_UUID,
        },
      ],
      error: null,
    })

    const matchUpdateChain: Record<string, unknown> = {}
    matchUpdateChain.update = vi.fn(() => matchUpdateChain)
    let matchEq = 0
    matchUpdateChain.eq = vi.fn(() => {
      matchEq++
      if (matchEq >= 2) return Promise.resolve({ error: null })
      return matchUpdateChain
    })

    // Eén van de twee rijen is nieuw.
    const txUpsertChain: Record<string, unknown> = {}
    txUpsertChain.upsert = vi.fn(() => txUpsertChain)
    txUpsertChain.select = vi.fn(() => Promise.resolve({ data: [{ id: 'tx-nieuw' }], error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return matchUpdateChain
      if (table === 'investment_transactions' && fromCallIndex === 5) return txUpsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ units: 5 })],
      transactions: [
        makeTx({ units: 10, external_trade_id: 'oud' }),
        makeTx({ units: 5, price_per_unit: 120, total_amount: 600, external_trade_id: 'nieuw' }),
      ],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.summary.transactions_created).toBe(1)
    expect(body.summary.transactions_deduped).toBe(1)

    // De positie van de geraakte holding wordt opnieuw afgeleid uit de volledige
    // historie — één aanroep, want beide rijen horen bij dezelfde holding.
    expect(mockSyncHoldingAggregates).toHaveBeenCalledTimes(1)
    expect(mockSyncHoldingAggregates.mock.calls[0][2]).toBe(EXISTING_HOLDING)
  })

  // -------------------------------------------------------------------------
  // Negatieve netto-positie bij een transactie-export
  // -------------------------------------------------------------------------
  //
  // Given een transactie-export waarvan het venster de oorspronkelijke aankoop
  // NIET bevat (de gebruiker exporteert alleen de laatste maanden), zodat een
  // instrument in dat bestand alleen een verkoop heeft;
  // When de wizard die netto positie (negatief) meestuurt in mode 'append';
  // Then moet de import slagen — bij 'append' is `units` geen gezaghebbend veld:
  // de positie wordt na afloop toch volledig herleid uit de transactiehistorie
  // in de database (syncHoldingAggregatesFromTransactions).

  it("APPEND: een negatieve netto-positie blokkeert de import niet — 'units' is daar niet gezaghebbend", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })

    const insertChain: Record<string, unknown> = {}
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn(() => Promise.resolve({
      data: { id: 'h-nieuw', asset_id: VALID_UUID },
      error: null,
    }))

    const txUpsertChain: Record<string, unknown> = {}
    txUpsertChain.upsert = vi.fn(() => txUpsertChain)
    txUpsertChain.select = vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return insertChain
      if (table === 'investment_transactions' && fromCallIndex === 5) return txUpsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({
        name: 'AEX 485.9SPSOPENG',
        ticker: null,
        isin: 'NL0014440877',
        units: -5,
        avg_purchase_price: 0,
        current_price: 0,
      })],
      transactions: [makeTx({ type: 'sell', units: 5, price_per_unit: 116.66, total_amount: 583.3 })],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)

    // De weggeschreven holding-rij start op 0, nooit op een negatief aantal.
    const inserted = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as { units: number }
    expect(inserted.units).toBe(0)
  })

  // De klem op 0 is verdedigbaar, maar mag niet stil zijn: zonder terugkoppeling
  // ziet de gebruiker een geslaagde import en een positie van 0 stuks, zonder te
  // weten dát en waaróm er gecorrigeerd is (importtoets 5).
  it('meldt in de samenvatting hoeveel posities een onvolledige historie hadden', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockSyncHoldingAggregates.mockResolvedValue({
      synced: true,
      units: 0,
      avgPurchasePrice: 0,
      historyIncomplete: true,
    })

    const ownershipChain = makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null })
    const defaultAssetChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const holdingsExistingChain = makeChain({ data: [], error: null })

    const insertChain: Record<string, unknown> = {}
    insertChain.insert = vi.fn(() => insertChain)
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn(() => Promise.resolve({
      data: { id: 'h-nieuw', asset_id: VALID_UUID },
      error: null,
    }))

    const txUpsertChain: Record<string, unknown> = {}
    txUpsertChain.upsert = vi.fn(() => txUpsertChain)
    txUpsertChain.select = vi.fn(() => Promise.resolve({ data: [{ id: 'tx-1' }], error: null }))

    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      if (table === 'assets' && fromCallIndex === 1) return ownershipChain
      if (table === 'assets' && fromCallIndex === 2) return defaultAssetChain
      if (table === 'investment_holdings' && fromCallIndex === 3) return holdingsExistingChain
      if (table === 'investment_holdings' && fromCallIndex === 4) return insertChain
      if (table === 'investment_transactions' && fromCallIndex === 5) return txUpsertChain
      return makeChain({ data: null, error: null })
    })

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ name: 'AEX 485.9SPSOPENG', units: 0, avg_purchase_price: 0 })],
      transactions: [makeTx({ type: 'sell', units: 5, price_per_unit: 116.66, total_amount: 583.3 })],
      broker: 'degiro',
      mode: 'append',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.summary.holdings_incomplete_history).toBe(1)
  })

  it('SNAPSHOT: een negatieve positie blijft een fout — daar is de export wél het volledige beeld', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockImplementation(() => makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null }))

    const res = await callRoute(makeRequest({
      holdings: [makeHolding({ name: 'AEX 485.9SPSOPENG', units: -5 })],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    // De melding noemt het instrument, niet een indexnummer in een array die de
    // UI nooit toont.
    expect(body.error).toContain('AEX 485.9SPSOPENG')
    expect(body.error).not.toMatch(/^Holding \d+:/)
  })

  it('meldt ALLE ongeldige holdings in één keer, niet alleen de eerste', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockFrom.mockImplementation(() => makeChain({ data: { id: VALID_UUID, has_holdings_tracking: true }, error: null }))

    const res = await callRoute(makeRequest({
      holdings: [
        makeHolding({ name: 'GOED' }),
        makeHolding({ name: 'FOUT EEN', units: -5 }),
        makeHolding({ name: 'FOUT TWEE', avg_purchase_price: -1 }),
      ],
      transactions: [],
      broker: 'degiro',
      mode: 'snapshot',
      targetAssetId: VALID_UUID,
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('FOUT EEN')
    expect(body.error).toContain('FOUT TWEE')
  })
})
