/**
 * `fetchRecentNetWorthSnapshots` — de snapshotreeks van `loadCoreData`.
 *
 * Twee defecten in de oude inline-query van lib/core-data-loader.ts
 * (`.order(asc).limit(24)`, zonder user-filter), security-review 27 sep 2026:
 *
 *  1. VENSTER. `order(asc).limit(24)` levert bij meer dan 24 rijen de OUDSTE 24.
 *     Live heeft één gebruiker er 89. De consumenten lezen er juist de recente
 *     kant uit: het groei-pijltje (laatste twee rijen), de snapshot-FIRE-leeftijd
 *     (laatste rij met fire_age) en de net-vermogen-delta-spaarquote (eerste en
 *     laatste rij). Dezelfde foutklasse als getNetWorthSnapshots12m (dfe496b62).
 *  2. SCOPING. De SELECT-policy op `net_worth_snapshots` is huishoud-gedeeld en
 *     `ownership` is door de gebruiker zelf schrijfbaar; zonder `.eq('user_id')`
 *     schuift een gedeelde partnerrij de reeks in.
 *
 * De simulatie past de filters werkelijk toe en laat RLS weg.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasEq, makePostgrestSim } from '@/lib/test-utils/postgrest-sim'

const mockCachedUser = vi.hoisted(() => ({ current: { id: 'ik' } as { id: string } | null }))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: async () => mockCachedUser.current,
}))

import { fetchRecentNetWorthSnapshots, RECENT_SNAPSHOT_LIMIT } from './recent-net-worth-snapshots'

function snap(user_id: string, snapshot_date: string, total_assets: number, extra: Record<string, unknown> = {}) {
  return { user_id, snapshot_date, total_assets, total_debts: 0, net_worth: total_assets, fire_age: null, ...extra }
}

/** 30 eigen rijen, één per maand: apr 2024 t/m sep 2026. */
function ownSeries() {
  const rows = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(2024, 3 + i, 15))
    rows.push(snap('ik', d.toISOString().slice(0, 10), 100_000 + i * 1_000))
  }
  return rows
}

beforeEach(() => {
  mockCachedUser.current = { id: 'ik' }
})

describe('fetchRecentNetWorthSnapshots — recentste reeks, eigen rijen, oplopend', () => {
  it('Given meer dan 24 eigen rijen, When de reeks geladen wordt, Then zit de recentste maand erin en is de reeks oplopend', async () => {
    const sim = makePostgrestSim({ net_worth_snapshots: ownSeries() })

    const { data, error } = await fetchRecentNetWorthSnapshots(sim.client)

    expect(error).toBeNull()
    expect(data).toHaveLength(RECENT_SNAPSHOT_LIMIT)
    const dates = (data ?? []).map(r => r.snapshot_date)
    expect(dates.at(-1)).toBe('2026-09-15')
    expect(dates[0]).toBe('2024-10-15')
    expect([...dates].sort()).toEqual(dates)
  })

  it('Given een recentere gedeelde partnerrij, When de reeks geladen wordt, Then valt die weg en draagt de query .eq(user_id)', async () => {
    const sim = makePostgrestSim({
      net_worth_snapshots: [
        ...ownSeries(),
        snap('partner', '2026-09-26', 900_000, { ownership: 'shared', fire_age: 41 }),
      ],
    })

    const { data } = await fetchRecentNetWorthSnapshots(sim.client)

    expect((data ?? []).every(r => r.snapshot_date !== '2026-09-26')).toBe(true)
    expect(data?.at(-1)?.total_assets).toBe(129_000)
    const [call] = sim.callsTo('net_worth_snapshots')
    expect(hasEq(call, 'user_id', 'ik')).toBe(true)
  })

  it('Given geen sessie, When de reeks geladen wordt, Then is hij leeg en draait er geen query (fail-closed)', async () => {
    mockCachedUser.current = null
    const sim = makePostgrestSim({ net_worth_snapshots: ownSeries() }, null)

    const { data, error } = await fetchRecentNetWorthSnapshots(sim.client)

    expect(data).toEqual([])
    expect(error).toBeNull()
    expect(sim.callsTo('net_worth_snapshots')).toHaveLength(0)
  })
})
