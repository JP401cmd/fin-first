import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tests voor `loadHoldingsImportTargets` — de keuzelijst van de CSV-import.
 *
 * Twee dingen moeten hard vastliggen:
 *  1. De lijst is strikt van de ingelogde gebruiker. De SELECT-policy op
 *     `assets` is huishoud-gedeeld, dus zonder expliciete user_id-filter zou de
 *     partner's bezittingen in de lijst verschijnen — en importeren in de
 *     bezitting van een ander is precies wat niet mag.
 *  2. `lastTransactionDate` is de NIEUWSTE transactie per bezitting. Dat getal
 *     stuurt de exportperiode die de gebruiker bij zijn broker kiest; een te
 *     oude datum levert dubbele rijen, een te nieuwe een gat.
 */

const mockFrom = vi.fn()
const mockGetCachedUser = vi.fn()

vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (client: unknown) => mockGetCachedUser(client),
}))

const USER_ID = 'user-1'

/** Opgevangen query per tabel, zodat we filters en kolomlijst kunnen keuren. */
interface CapturedQuery {
  table: string
  select?: string
  eq: Array<[string, unknown]>
  limit?: number
  order?: Array<[string, unknown]>
}

function buildClient(rows: Record<string, unknown[]>): {
  client: SupabaseClient
  queries: CapturedQuery[]
} {
  const queries: CapturedQuery[] = []

  mockFrom.mockImplementation((table: string) => {
    const captured: CapturedQuery = { table, eq: [], order: [] }
    queries.push(captured)

    const chain: Record<string, unknown> = {}
    chain.select = vi.fn((cols: string) => {
      captured.select = cols
      return chain
    })
    chain.eq = vi.fn((col: string, val: unknown) => {
      captured.eq.push([col, val])
      return chain
    })
    chain.order = vi.fn((col: string, opts: unknown) => {
      captured.order!.push([col, opts])
      return chain
    })
    chain.limit = vi.fn((n: number) => {
      captured.limit = n
      return chain
    })
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve)

    return chain
  })

  return { client: { from: mockFrom } as unknown as SupabaseClient, queries }
}

async function load(client: SupabaseClient) {
  const mod = await import('./holdings-import-targets')
  return mod.loadHoldingsImportTargets(client)
}

describe('loadHoldingsImportTargets', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFrom.mockReset()
    mockGetCachedUser.mockReset()
    mockGetCachedUser.mockResolvedValue({ id: USER_ID })
  })

  it('geeft een lege lijst zonder ingelogde gebruiker', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const { client } = buildClient({})
    expect(await load(client)).toEqual([])
  })

  it('filtert assets op de eigen user_id en vraagt een expliciete kolomlijst', async () => {
    const { client, queries } = buildClient({ assets: [], investment_holdings: [] })
    await load(client)

    const assetQuery = queries.find((q) => q.table === 'assets')!
    expect(assetQuery.eq).toContainEqual(['user_id', USER_ID])
    // Nooit `*` op assets: die tabel draagt ciphertext-kolommen en een blind index.
    expect(assetQuery.select).not.toContain('*')
    expect(assetQuery.select).toContain('asset_type')
  })

  it('neemt beleggingen mee, plus elke bezitting die posities of transacties draagt', async () => {
    const { client } = buildClient({
      assets: [
        { id: 'a-inv', name: 'DEGIRO', asset_type: 'investment', institution: 'DEGIRO' },
        { id: 'a-spaar', name: 'Spaarrekening', asset_type: 'savings', institution: 'ING' },
        { id: 'a-oud', name: 'Oude bak', asset_type: 'savings', institution: null },
        { id: 'a-huis', name: 'Woning', asset_type: 'real_estate', institution: null },
      ],
      investment_holdings: [
        // Historische uitzondering: posities op een savings-bezitting.
        { id: 'h-1', asset_id: 'a-spaar', is_active: true },
      ],
      investment_transactions: [
        // a-oud heeft geen actieve positie meer, maar wél historie.
        { holding_id: 'h-oud', date: '2025-03-01' },
      ],
    })

    const targets = await load(client)
    const ids = targets.map((t) => t.id)

    expect(ids).toContain('a-inv')
    expect(ids).toContain('a-spaar')
    // Woning draagt niets beleggings-achtigs en hoort niet in de keuzelijst.
    expect(ids).not.toContain('a-huis')
  })

  it('telt alleen ACTIEVE posities in holdingsCount', async () => {
    const { client } = buildClient({
      assets: [{ id: 'a-1', name: 'DEGIRO', asset_type: 'investment', institution: null }],
      investment_holdings: [
        { id: 'h-1', asset_id: 'a-1', is_active: true },
        { id: 'h-2', asset_id: 'a-1', is_active: true },
        // Verkocht: telt niet mee voor "wat staat er nu in".
        { id: 'h-3', asset_id: 'a-1', is_active: false },
      ],
      investment_transactions: [],
    })

    const targets = await load(client)
    expect(targets[0].holdingsCount).toBe(2)
  })

  it('neemt de nieuwste transactiedatum per bezitting — ook via een verkochte positie', async () => {
    const { client, queries } = buildClient({
      assets: [{ id: 'a-1', name: 'DEGIRO', asset_type: 'investment', institution: null }],
      investment_holdings: [
        { id: 'h-actief', asset_id: 'a-1', is_active: true },
        { id: 'h-verkocht', asset_id: 'a-1', is_active: false },
      ],
      // De route levert ze op datum aflopend; de eerste treffer is de laatste.
      investment_transactions: [
        { holding_id: 'h-verkocht', date: '2026-02-10' },
        { holding_id: 'h-actief', date: '2025-11-01' },
      ],
    })

    const targets = await load(client)
    expect(targets[0].lastTransactionDate).toBe('2026-02-10')

    // De aanname "aflopend gesorteerd" moet echt in de query staan, anders is de
    // eerste-treffer-logica hierboven toevallig goed.
    const txQuery = queries.find((q) => q.table === 'investment_transactions')!
    expect(txQuery.order).toContainEqual(['date', { ascending: false }])
    expect(txQuery.eq).toContainEqual(['user_id', USER_ID])
    // Expliciete cap i.p.v. stil afkappen op PostgREST's max_rows.
    expect(txQuery.limit).toBeGreaterThan(0)
  })

  it('geeft null als er nog geen enkele transactie is', async () => {
    const { client } = buildClient({
      assets: [{ id: 'a-1', name: 'DEGIRO', asset_type: 'investment', institution: null }],
      investment_holdings: [],
      investment_transactions: [],
    })

    const targets = await load(client)
    expect(targets[0].lastTransactionDate).toBeNull()
    expect(targets[0].holdingsCount).toBe(0)
  })
})
