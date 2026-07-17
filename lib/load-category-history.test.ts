/**
 * Unit tests voor `loadWealthGroupHistory` in `lib/load-category-history.ts`
 * (netto-vermogen-verloop, brok B1).
 *
 * Dekt: weging met `net_worth_inclusion_pct` (incl. de MCP-SQL-string-gotcha),
 * LOCF forward-fill, provenance measured-vs-locf, de "entiteit-aangemaakt-ná-
 * maand-X"-edge case (geen leading fill), asset- én debt-groepering, de
 * "laatste-snapshot-per-maand-wint" (niet sommeren) en de lege-bron-uitkomst.
 *
 * Mock-patroon: een chainable Supabase-stub (spiegelt de builder-keten
 * `.from().select().in().gte().order()`) die awaitable is en `{ data, error }`
 * teruggeeft — vergelijkbaar met de bestaande loader-tests.
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadWealthGroupHistory } from './load-category-history'

// ── Mock-helpers ─────────────────────────────────────────────────

interface SnapInput {
  entity_id: string
  entity_type?: 'asset' | 'debt'
  entity_subtype: string
  balance: number | string
  incl?: number | string
  /** Maanden terug vanaf de huidige maand (0 = huidige maand). */
  offset: number
}

interface SnapRow {
  snapshot_date: string
  entity_id: string
  entity_type: 'asset' | 'debt'
  entity_subtype: string
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

/** `YYYY-MM(-15)` voor de maand die `offset` maanden vóór nu ligt (lokaal). */
function monthAt(offset: number): { key: string; date: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 15)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return { key, date: `${key}-15` }
}

function snap(s: SnapInput): SnapRow {
  return {
    snapshot_date: monthAt(s.offset).date,
    entity_id: s.entity_id,
    entity_type: s.entity_type ?? 'asset',
    entity_subtype: s.entity_subtype,
    balance: s.balance,
    net_worth_inclusion_pct: s.incl ?? 100,
  }
}

/** Chainable, awaitable Supabase-stub die `rows` teruggeeft als `data`. */
function makeSnapshotClient(rows: SnapRow[]): SupabaseClient {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: SnapRow[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  }
  return { from: () => builder } as unknown as SupabaseClient
}

// ── Tests ────────────────────────────────────────────────────────

describe('loadWealthGroupHistory', () => {
  it('weegt met net_worth_inclusion_pct en verwerkt string-kolommen (MCP-SQL-gotcha)', async () => {
    // balance én incl als string — NUMERIC komt via de MCP-SQL als JSON-string.
    const rows = [snap({ entity_id: 'a1', entity_subtype: 'investment', balance: '10000', incl: '50', offset: 0 })]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 3 })

    expect(data.months).toHaveLength(3)
    // investment → beleggingen; eerste snapshot in huidige maand (index 2).
    expect(data.assetGroups.beleggingen).toEqual([0, 0, 5000])
    // Andere asset-groepen blijven nul; geldige structuur.
    expect(data.assetGroups.spaargeld).toEqual([0, 0, 0])
    expect(data.provenance['asset:beleggingen']).toEqual(['measured', 'measured', 'measured'])
  })

  it('vult ontbrekende maanden forward (LOCF) en markeert die als locf', async () => {
    // Eén snapshot in de oudste maand (index 0), niets erna → LOCF voor idx 1 & 2.
    const rows = [snap({ entity_id: 'a1', entity_subtype: 'savings', balance: 1000, offset: -2 })]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 3 })

    expect(data.assetGroups.spaargeld).toEqual([1000, 1000, 1000])
    expect(data.provenance['asset:spaargeld']).toEqual(['measured', 'locf', 'locf'])
  })

  it('provenance is locf zodra één bijdragende entiteit in die maand forward-gevuld is', async () => {
    // Window = 2 maanden: idx0 = vorige maand, idx1 = huidige maand.
    // A: beide maanden gemeten; B: alleen de vorige maand → idx1 = LOCF voor B.
    const rows = [
      snap({ entity_id: 'A', entity_subtype: 'investment', balance: 100, offset: -1 }),
      snap({ entity_id: 'A', entity_subtype: 'investment', balance: 120, offset: 0 }),
      snap({ entity_id: 'B', entity_subtype: 'investment', balance: 50, offset: -1 }),
    ]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 2 })

    // idx0: A=100 + B=50 = 150 ; idx1: A=120 (gemeten) + B=50 (LOCF) = 170.
    expect(data.assetGroups.beleggingen).toEqual([150, 170])
    expect(data.provenance['asset:beleggingen']).toEqual(['measured', 'locf'])
  })

  it('entiteit met eerste snapshot in maand X draagt vóór X niets bij (geen leading fill)', async () => {
    // Window = 3 maanden. a1 verschijnt pas in de middelste maand (index 1).
    const rows = [snap({ entity_id: 'a1', entity_subtype: 'cash', balance: 2000, offset: -1 })]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 3 })

    // cash → spaargeld. Geen fictieve €0-terug-LOCF: idx0 blijft 0.
    expect(data.assetGroups.spaargeld).toEqual([0, 2000, 2000])
    // idx0: geen bijdrager → echte nul → 'measured'; idx1: gemeten; idx2: LOCF.
    expect(data.provenance['asset:spaargeld']).toEqual(['measured', 'measured', 'locf'])
  })

  it('groepeert assets én debts; debt-magnitudes zijn positief', async () => {
    const rows = [
      snap({ entity_id: 'inv', entity_subtype: 'investment', balance: 100000, offset: 0 }),
      snap({ entity_id: 'mort', entity_type: 'debt', entity_subtype: 'mortgage', balance: 248000, offset: 0 }),
      snap({ entity_id: 'cc', entity_type: 'debt', entity_subtype: 'credit_card', balance: 3000, offset: 0 }),
    ]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 1 })

    expect(data.months).toHaveLength(1)
    expect(data.assetGroups.beleggingen).toEqual([100000])
    expect(data.debtGroups.wonen).toEqual([248000])
    expect(data.debtGroups.consumptief).toEqual([3000])
    expect(data.debtGroups.overig).toEqual([0])
    // Positieve magnitude, geen negatief teken.
    expect(data.debtGroups.wonen[0]).toBeGreaterThan(0)
  })

  it('mapt asset_types op de juiste WealthGroup (pensioen/vastgoed/overig)', async () => {
    const rows = [
      snap({ entity_id: 'p', entity_subtype: 'retirement', balance: 80000, offset: 0 }),
      snap({ entity_id: 'h', entity_subtype: 'eigen_huis', balance: 400000, offset: 0 }),
      snap({ entity_id: 'c', entity_subtype: 'crypto', balance: 5000, offset: 0 }),
    ]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 1 })

    expect(data.assetGroups.pensioen).toEqual([80000])
    expect(data.assetGroups.vastgoed).toEqual([400000])
    expect(data.assetGroups.overig).toEqual([5000])
  })

  it('neemt per (entity, maand) de LAATSTE snapshot — telt niet op binnen een maand', async () => {
    const now = new Date()
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const rows: SnapRow[] = [
      { snapshot_date: `${key}-05`, entity_id: 'a1', entity_type: 'asset', entity_subtype: 'savings', balance: 1000, net_worth_inclusion_pct: 100 },
      { snapshot_date: `${key}-20`, entity_id: 'a1', entity_type: 'asset', entity_subtype: 'savings', balance: 1500, net_worth_inclusion_pct: 100 },
    ]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 1 })

    // De latere snapshot (dag 20) wint — 1500, niet 2500.
    expect(data.assetGroups.spaargeld).toEqual([1500])
  })

  it('onbekend asset-subtype valt in overig; default window = 12 maanden', async () => {
    const rows = [snap({ entity_id: 'x', entity_subtype: 'weird_type', balance: 500, offset: 0 })]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), {})

    expect(data.months).toHaveLength(12)
    expect(data.assetGroups.overig).toHaveLength(12)
    expect(data.assetGroups.overig[11]).toBe(500) // huidige maand = laatste index
  })

  it('lege balance_snapshots → consistente, volledig genulde structuur', async () => {
    const data = await loadWealthGroupHistory(makeSnapshotClient([]), { months: 6 })

    expect(data.months).toHaveLength(6)

    const assetKeys = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig'] as const
    for (const g of assetKeys) {
      expect(data.assetGroups[g]).toHaveLength(6)
      expect(data.assetGroups[g].every((v) => v === 0)).toBe(true)
    }
    const debtKeys = ['wonen', 'consumptief', 'overig'] as const
    for (const g of debtKeys) {
      expect(data.debtGroups[g]).toHaveLength(6)
      expect(data.debtGroups[g].every((v) => v === 0)).toBe(true)
    }

    // Alle 8 provenance-keys aanwezig, elk lengte 6, alles 'measured'.
    expect(Object.keys(data.provenance).sort()).toEqual([
      'asset:beleggingen', 'asset:overig', 'asset:pensioen', 'asset:spaargeld', 'asset:vastgoed',
      'debt:consumptief', 'debt:overig', 'debt:wonen',
    ].sort())
    for (const arr of Object.values(data.provenance)) {
      expect(arr).toHaveLength(6)
      expect(arr.every((p) => p === 'measured')).toBe(true)
    }
  })

  it('alle output-arrays hebben exact dezelfde lengte als months', async () => {
    const rows = [
      snap({ entity_id: 'a1', entity_subtype: 'investment', balance: 1000, offset: -3 }),
      snap({ entity_id: 'd1', entity_type: 'debt', entity_subtype: 'personal_loan', balance: 500, offset: -1 }),
    ]
    const data = await loadWealthGroupHistory(makeSnapshotClient(rows), { months: 5 })

    const n = data.months.length
    expect(n).toBe(5)
    for (const arr of Object.values(data.assetGroups)) expect(arr).toHaveLength(n)
    for (const arr of Object.values(data.debtGroups)) expect(arr).toHaveLength(n)
    for (const arr of Object.values(data.provenance)) expect(arr).toHaveLength(n)
  })
})
