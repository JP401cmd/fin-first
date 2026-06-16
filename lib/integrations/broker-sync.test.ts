/**
 * Unit tests voor `syncBrokerPositions` in broker-sync.ts.
 *
 * Beoogd gedrag per test:
 *  1. Nieuwe positie → INSERT (geen UPDATE, geen upsert).
 *  2. Bestaande positie (case-insensitive ticker-match) → UPDATE op gevonden id,
 *     geen tweede INSERT.
 *  3. `current_price` NIET geschreven wanneer position.currentPrice is null/undefined;
 *     `isin` alleen geschreven wanneer aanwezig.
 *  4. Soft-delete ALLEEN voor rijen van dezelfde connectionId die ontbreken in de
 *     broker-posities; manual/CSV-rijen (source_broker_connection_id=null) en
 *     andere connecties worden NIET aangeraakt.
 *  5. Positie met units===0 wordt overgeslagen (geen DB-call, telt niet in itemsSynced).
 *  6. syncAssetValueFromInvestmentHoldings wordt aangeroepen; zijn totalValue
 *     wordt doorgegeven in de SyncOutcome.
 *  7. Edge: lege positions-array + bestaande broker-holdings → allemaal
 *     gedeactiveerd voor deze connectie, manual/CSV onaangeraakt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrokerAdapter, BrokerPosition } from './broker-adapter'

// ── Mock @/lib/holdings-sync BEFORE importing the unit-under-test ───────────
// syncBrokerPositions roept syncAssetValueFromInvestmentHoldings aan als
// best-effort rollup. We mocken het zodat we de return-waarde kunnen sturen
// en controleren dat het precies één keer wordt aangeroepen.
vi.mock('@/lib/holdings-sync', () => ({
  syncAssetValueFromInvestmentHoldings: vi.fn(),
}))

import { syncBrokerPositions } from './broker-sync'
import { syncAssetValueFromInvestmentHoldings } from '@/lib/holdings-sync'

// ── Shared fixtures ─────────────────────────────────────────────────────────

const USER_ID = 'user-abc'
const ASSET_ID = 'asset-xyz'
const CONNECTION_ID = 'conn-t212'
const API_KEY = 'test-api-key'

// ── Supabase-mock helpers ────────────────────────────────────────────────────
//
// broker-sync heeft precies drie DB-paden:
//   A) SELECT om bestaande rijen op te halen
//   B) UPDATE op een gevonden rij (positie-update OF soft-delete)
//   C) INSERT voor een nieuwe rij
//
// We bouwen een stateful mock zodat elke from()-call naar de juiste handler
// gerouteerd wordt op basis van de methode die erop gechaind wordt.
// De mock houdt voor iedere call de tabel/method/payload/conditions bij
// zodat we er later assertions op kunnen doen.

interface MockCall {
  table: string
  method: 'select' | 'insert' | 'update'
  payload?: Record<string, unknown>
  conditions: Array<{ field: string; value: unknown }>
}

function buildSupabaseMock(existingRows: Record<string, unknown>[]) {
  const calls: MockCall[] = []

  const makeChain = (table: string, method: MockCall['method'], payload?: Record<string, unknown>) => {
    const conditions: Array<{ field: string; value: unknown }> = []
    const chain = {
      conditions,
      eq(field: string, value: unknown) {
        conditions.push({ field, value })
        return chain
      },
      // Resolving the chain (awaited): SELECT returns the existing rows,
      // INSERT/UPDATE return success.
      then(resolve: (v: { data: unknown; error: null }) => void) {
        calls.push({ table, method, payload, conditions: [...conditions] })
        if (method === 'select') {
          resolve({ data: existingRows, error: null })
        } else {
          resolve({ data: null, error: null })
        }
      },
    }
    return chain
  }

  const supabase = {
    from(table: string) {
      return {
        select(_cols: string) {
          return makeChain(table, 'select')
        },
        insert(payload: Record<string, unknown>) {
          return makeChain(table, 'insert', payload)
        },
        update(payload: Record<string, unknown>) {
          return makeChain(table, 'update', payload)
        },
      }
    },
  }

  return { supabase, calls }
}

function makeAdapter(positions: BrokerPosition[]): BrokerAdapter {
  return {
    name: 'trading212',
    validateCredentials: vi.fn(),
    fetchPositions: vi.fn().mockResolvedValue(positions),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('syncBrokerPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: rollup retourneert een gekende totalValue
    vi.mocked(syncAssetValueFromInvestmentHoldings).mockResolvedValue({
      synced: true,
      totalValue: 5000,
    })
  })

  // ── Test 1: nieuwe positie → INSERT ────────────────────────────────────────
  it('inserts a new position that does not yet exist in investment_holdings', async () => {
    const { supabase, calls } = buildSupabaseMock([]) // geen bestaande rijen

    const position: BrokerPosition = {
      ticker: 'AAPL_US_EQ',
      name: 'Apple Inc.',
      units: 10,
      currency: 'USD',
      currentPrice: 180.5,
      averagePrice: 160.0,
      isin: 'US0378331005',
    }

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([position]),
      apiKey: API_KEY,
    })

    // Verwacht precies één INSERT-call (de positie is nieuw)
    const inserts = calls.filter((c) => c.method === 'insert')
    const updates = calls.filter((c) => c.method === 'update')
    expect(inserts).toHaveLength(1)
    expect(updates).toHaveLength(0) // geen update, geen soft-delete (niks te deactiveren)

    const payload = inserts[0].payload as Record<string, unknown>
    // ticker verbatim (niet uppercase)
    expect(payload.ticker).toBe('AAPL_US_EQ')
    // verplichte velden
    expect(payload.external_source).toBe('trading212')
    expect(payload.source_broker_connection_id).toBe(CONNECTION_ID)
    expect(payload.is_active).toBe(true)
    // price + avg_purchase_price (INSERT-only)
    expect(payload.current_price).toBe(180.5)
    expect(payload.avg_purchase_price).toBe(160.0)
    // currency doorgegeven
    expect(payload.currency).toBe('USD')
    // ISIN aanwezig → geschreven
    expect(payload.isin).toBe('US0378331005')

    expect(outcome.itemsSynced).toBe(1)
    expect(outcome.itemsDeactivated).toBe(0)
  })

  // ── Test 2: bestaande positie (case-insensitief) → UPDATE, geen INSERT ─────
  it('updates an existing holding when ticker matches case-insensitively', async () => {
    // Bestaande rij heeft 'AAPL'; broker stuurt 'aapl' — dedup-map moet matchen
    const existingHolding = {
      id: 'holding-1',
      ticker: 'AAPL',
      is_active: true,
      source_broker_connection_id: CONNECTION_ID,
    }
    const { supabase, calls } = buildSupabaseMock([existingHolding])

    const position: BrokerPosition = {
      ticker: 'aapl', // lowercase — moeten we case-insensitief matchen
      name: 'Apple Inc.',
      units: 15,
      currency: 'USD',
      currentPrice: 182.0,
    }

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([position]),
      apiKey: API_KEY,
    })

    const inserts = calls.filter((c) => c.method === 'insert')
    const positionUpdates = calls.filter(
      (c) =>
        c.method === 'update' &&
        (c.payload as Record<string, unknown>)?.is_active === true,
    )

    // Geen INSERT (rij bestond al)
    expect(inserts).toHaveLength(0)
    // Wel één UPDATE op de positie
    expect(positionUpdates).toHaveLength(1)

    // UPDATE moet op de juiste id en user_id gaan
    const update = positionUpdates[0]
    expect(update.conditions).toContainEqual({ field: 'id', value: 'holding-1' })
    expect(update.conditions).toContainEqual({ field: 'user_id', value: USER_ID })

    // ticker in de UPDATE-payload is verbatim de broker-waarde ('aapl')
    expect((update.payload as Record<string, unknown>).ticker).toBe('aapl')

    // Positie is gezien → AAPL NIET gedeactiveerd
    const softDeletes = calls.filter(
      (c) =>
        c.method === 'update' &&
        (c.payload as Record<string, unknown>)?.is_active === false,
    )
    expect(softDeletes).toHaveLength(0)

    expect(outcome.itemsSynced).toBe(1)
    expect(outcome.itemsDeactivated).toBe(0)
  })

  // ── Test 3: current_price NIET geschreven bij null; isin NIET bij absent ───
  it('omits current_price when position.currentPrice is null, and isin when absent', async () => {
    const { supabase, calls } = buildSupabaseMock([])

    const position: BrokerPosition = {
      ticker: 'IWDA',
      units: 5,
      // currentPrice is undefined → NIET in payload
      // isin is absent → NIET in payload
    }

    await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([position]),
      apiKey: API_KEY,
    })

    const inserts = calls.filter((c) => c.method === 'insert')
    expect(inserts).toHaveLength(1)

    const payload = inserts[0].payload as Record<string, unknown>
    // current_price mag NIET aanwezig zijn (geen waarde om te overschrijven)
    expect(Object.prototype.hasOwnProperty.call(payload, 'current_price')).toBe(false)
    // isin mag NIET aanwezig zijn
    expect(Object.prototype.hasOwnProperty.call(payload, 'isin')).toBe(false)
    // currency fallback naar 'EUR' wanneer absent
    expect(payload.currency).toBe('EUR')
    // avg_purchase_price is null bij ontbrekende averagePrice
    expect(payload.avg_purchase_price).toBeNull()
  })

  // ── Test 4a: soft-delete ALLEEN rijen van déze connectie ─────────────────
  it('deactivates holdings for this connectionId that are absent from positions', async () => {
    const ownHolding = {
      id: 'own-1',
      ticker: 'TSLA',
      is_active: true,
      source_broker_connection_id: CONNECTION_ID, // van déze connectie
    }
    const manualHolding = {
      id: 'manual-1',
      ticker: 'MSFT',
      is_active: true,
      source_broker_connection_id: null, // handmatig/CSV → NIET aanraken
    }
    const otherConnHolding = {
      id: 'other-1',
      ticker: 'NVDA',
      is_active: true,
      source_broker_connection_id: 'conn-other', // andere broker-connectie → NIET aanraken
    }

    const { supabase, calls } = buildSupabaseMock([ownHolding, manualHolding, otherConnHolding])

    // Lege posities → alles dat van déze connectie is en actief is, moet gedeactiveerd worden
    await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([]),
      apiKey: API_KEY,
    })

    const softDeletes = calls.filter(
      (c) =>
        c.method === 'update' &&
        (c.payload as Record<string, unknown>)?.is_active === false,
    )

    // Precies één soft-delete: voor 'own-1' (TSLA van déze connectie)
    expect(softDeletes).toHaveLength(1)
    expect(softDeletes[0].conditions).toContainEqual({ field: 'id', value: 'own-1' })

    // manual-1 en other-1 zijn NIET gedeactiveerd
    const deactivatedIds = softDeletes.map((c) => c.conditions.find((x) => x.field === 'id')?.value)
    expect(deactivatedIds).not.toContain('manual-1')
    expect(deactivatedIds).not.toContain('other-1')
  })

  // ── Test 4b: manual holding blijft onaangeraakt ook bij één matching positie
  it('protects manual holdings even when some positions are processed', async () => {
    const ownHolding = {
      id: 'own-2',
      ticker: 'AAPL',
      is_active: true,
      source_broker_connection_id: CONNECTION_ID,
    }
    const manualHolding = {
      id: 'manual-2',
      ticker: 'MSFT', // niet in positions → zou gecandideerd zijn als scoping het toestaat
      is_active: true,
      source_broker_connection_id: null,
    }

    const { supabase, calls } = buildSupabaseMock([ownHolding, manualHolding])

    // Alleen AAPL positie — MSFT ontbreekt
    await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([{ ticker: 'AAPL', units: 10, currency: 'USD' }]),
      apiKey: API_KEY,
    })

    const softDeletes = calls.filter(
      (c) =>
        c.method === 'update' &&
        (c.payload as Record<string, unknown>)?.is_active === false,
    )

    // MSFT (manual) mag NIET gedeactiveerd worden, zelfs niet als het ontbreekt uit de sync
    expect(softDeletes).toHaveLength(0)
  })

  // ── Test 5: positie met units===0 → overgeslagen ──────────────────────────
  it('skips positions where units === 0', async () => {
    const { supabase, calls } = buildSupabaseMock([])

    const positions: BrokerPosition[] = [
      { ticker: 'CASH', units: 0, currency: 'EUR' }, // units 0 → skip
      { ticker: 'IWDA', units: 3, currency: 'EUR', currentPrice: 90 }, // normaal
    ]

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter(positions),
      apiKey: API_KEY,
    })

    const inserts = calls.filter((c) => c.method === 'insert')
    // Alleen IWDA geïnsert; CASH overgeslagen
    expect(inserts).toHaveLength(1)
    expect((inserts[0].payload as Record<string, unknown>).ticker).toBe('IWDA')
    expect(outcome.itemsSynced).toBe(1)
  })

  // ── Test 6: rollup wordt aangeroepen; totalValue stroomt in SyncOutcome ───
  it('calls syncAssetValueFromInvestmentHoldings once and returns its totalValue', async () => {
    vi.mocked(syncAssetValueFromInvestmentHoldings).mockResolvedValue({
      synced: true,
      totalValue: 12345.67,
    })

    const { supabase } = buildSupabaseMock([])

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([{ ticker: 'VWRL', units: 2, currency: 'EUR', currentPrice: 110 }]),
      apiKey: API_KEY,
    })

    expect(syncAssetValueFromInvestmentHoldings).toHaveBeenCalledOnce()
    expect(syncAssetValueFromInvestmentHoldings).toHaveBeenCalledWith(
      expect.anything(), // supabase
      ASSET_ID,
      USER_ID,
    )
    expect(outcome.totalValueEur).toBe(12345.67)
    expect(outcome.assetId).toBe(ASSET_ID)
  })

  // ── Test 7: lege positions + broker-holdings → allen gedeactiveerd; ────────
  //           manual/andere connecties onaangeraakt
  it('deactivates all own-connection holdings when positions list is empty', async () => {
    const existing = [
      { id: 'h1', ticker: 'AAPL', is_active: true, source_broker_connection_id: CONNECTION_ID },
      { id: 'h2', ticker: 'MSFT', is_active: true, source_broker_connection_id: CONNECTION_ID },
      { id: 'h3', ticker: 'GOOG', is_active: true, source_broker_connection_id: null }, // manual
      { id: 'h4', ticker: 'AMZN', is_active: true, source_broker_connection_id: 'conn-other' },
    ]

    const { supabase, calls } = buildSupabaseMock(existing)

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter([]), // lege posities
      apiKey: API_KEY,
    })

    const softDeletes = calls.filter(
      (c) =>
        c.method === 'update' &&
        (c.payload as Record<string, unknown>)?.is_active === false,
    )

    // h1 en h2 (van CONNECTION_ID) worden gedeactiveerd
    expect(softDeletes).toHaveLength(2)
    const deactivatedIds = softDeletes.map((c) => c.conditions.find((x) => x.field === 'id')?.value)
    expect(deactivatedIds).toContain('h1')
    expect(deactivatedIds).toContain('h2')
    // h3 (manual) en h4 (andere connectie) NIET
    expect(deactivatedIds).not.toContain('h3')
    expect(deactivatedIds).not.toContain('h4')

    expect(outcome.itemsSynced).toBe(0)
    expect(outcome.itemsDeactivated).toBe(2)

    // soft-delete payload bevat de juiste velden
    for (const sd of softDeletes) {
      expect((sd.payload as Record<string, unknown>).units).toBe(0)
      expect((sd.payload as Record<string, unknown>).is_active).toBe(false)
    }
  })

  // ── Extra: itemsSynced en itemsDeactivated tellingen kloppen in gemengd scenario
  it('counts itemsSynced and itemsDeactivated correctly in a mixed scenario', async () => {
    const existingHolding = {
      id: 'e1',
      ticker: 'TSLA',
      is_active: true,
      source_broker_connection_id: CONNECTION_ID,
    }
    const vanishedHolding = {
      id: 'e2',
      ticker: 'NVDA',
      is_active: true,
      source_broker_connection_id: CONNECTION_ID,
    }

    const { supabase } = buildSupabaseMock([existingHolding, vanishedHolding])

    const positions: BrokerPosition[] = [
      { ticker: 'TSLA', units: 5, currentPrice: 250 }, // update bestaande
      { ticker: 'AAPL', units: 3, currentPrice: 180 }, // nieuwe positie
      // NVDA ontbreekt → soft-delete
    ]

    const outcome = await syncBrokerPositions({
      supabase: supabase as never,
      userId: USER_ID,
      assetId: ASSET_ID,
      connectionId: CONNECTION_ID,
      adapter: makeAdapter(positions),
      apiKey: API_KEY,
    })

    expect(outcome.itemsSynced).toBe(2) // TSLA (update) + AAPL (insert)
    expect(outcome.itemsDeactivated).toBe(1) // NVDA
    expect(outcome.assetId).toBe(ASSET_ID)
  })
})
