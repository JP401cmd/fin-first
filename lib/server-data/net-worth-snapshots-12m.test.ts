/**
 * `getNetWorthSnapshots12m` — het 12-maandsvenster van `net_worth_snapshots`.
 *
 * Bug (26 sep 2026, gemeten op productie): de fetcher deed
 * `.gte(11 mnd).order(asc).limit(12)` zonder maand-dedupe. Auto-snapshots
 * landen op de echte kalenderdag, dus meerdere rijen per maand is normaal (max
 * 26 in één maand gemeten). Bij meer dan 12 rijen in het venster leverde
 * `order(asc).limit(12)` de OUDSTE 12 — de recente kant viel weg, terwijl de
 * consumenten er juist de "vorige/recentste" stand uit lezen (6 van 16
 * gebruikers).
 *
 * De mock hieronder SIMULEERT PostgREST: hij past `eq`/`gte`/`order`/`limit`
 * werkelijk toe op een vaste rijenset (twee gebruikers). Zo meet de test het
 * resultaat, niet de vorm van de query-aanroepen. RLS wordt bewust níet
 * gesimuleerd: de SELECT-policy is huishouden-gedeeld, dus een persoonlijke
 * reeks mag er niet op leunen en moet zelf op `user_id` scopen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('react', () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}))

const mockCachedUser = vi.hoisted(() => ({ current: { id: 'ik' } as { id: string } | null }))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: async () => mockCachedUser.current,
}))

import { getNetWorthSnapshots12m } from './base'

type Row = Record<string, unknown> & { user_id?: string; snapshot_date: string }

/** Minimale PostgREST-simulatie: filters worden echt op `rows` toegepast. */
function makePostgrestSim(rows: Row[]) {
  function from() {
    let result = [...rows]
    let limitN: number | null = null
    let columns: string[] = []
    // Projectie op de gevraagde kolommen, pas ná de filters (zoals PostgREST).
    const project = (r: Row) => Object.fromEntries(columns.map((c) => [c, r[c]]))
    const q: Record<string, unknown> = {
      select: (cols: string) => {
        columns = cols.split(',').map((c) => c.trim())
        return q
      },
      eq: (col: string, val: unknown) => {
        result = result.filter((r) => r[col] === val)
        return q
      },
      gte: (col: string, val: string) => {
        result = result.filter((r) => String(r[col]) >= val)
        return q
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const asc = opts?.ascending !== false
        result.sort((a, b) => (asc ? 1 : -1) * String(a[col]).localeCompare(String(b[col])))
        return q
      },
      limit: (n: number) => {
        limitN = n
        return q
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: (limitN === null ? result : result.slice(0, limitN)).map(project),
          error: null,
        }).then(resolve, reject),
    }
    return q
  }
  return { from } as never
}

function snap(user_id: string, snapshot_date: string, net_worth: number, extra: Partial<Row> = {}): Row {
  return {
    user_id,
    snapshot_date,
    net_worth,
    fire_age: null,
    savings_rate: null,
    resilience_score: null,
    score_version: 2,
    engine_bron: null,
    ...extra,
  }
}

describe('getNetWorthSnapshots12m — venster, scoping en één stand per maand', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0)) // 26 sep 2026, lokale tijd
    mockCachedUser.current = { id: 'ik' }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Given meer dan 12 rijen in het venster met dubbele maanden, When de reeks geladen wordt, Then zit de recentste maand erin en valt de rij van een ander user_id weg', async () => {
    const rows: Row[] = [
      // Buiten het venster (vóór okt 2025): valt weg.
      snap('ik', '2025-09-30', 1),
      // Okt 2025 t/m mrt 2026: drie auto-snapshots per maand (18 rijen).
      ...['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'].flatMap((m, i) => [
        snap('ik', `${m}-03`, 100 + i),
        snap('ik', `${m}-14`, 200 + i),
        snap('ik', `${m}-27`, 300 + i),
      ]),
      // Apr t/m sep 2026: één rij per maand.
      snap('ik', '2026-04-10', 400),
      snap('ik', '2026-05-10', 500),
      snap('ik', '2026-06-10', 600),
      snap('ik', '2026-07-10', 700),
      snap('ik', '2026-08-10', 800),
      snap('ik', '2026-08-29', 850),
      snap('ik', '2026-09-26', 900),
      // Een gedeelde rij van de partner die de huishouden-policy zou doorlaten.
      snap('partner', '2026-09-20', 99_999, { ownership: 'shared' }),
    ]

    const res = await getNetWorthSnapshots12m(makePostgrestSim(rows))
    const data = (res.data ?? []) as unknown as Row[]

    expect(res.error).toBeNull()
    // Recentste maand aanwezig, met de laatste stand van die maand.
    expect(data.at(-1)).toMatchObject({ snapshot_date: '2026-09-26', net_worth: 900 })
    // De vorige maand is de LAATSTE rij van augustus, niet de eerste.
    expect(data.at(-2)).toMatchObject({ snapshot_date: '2026-08-29', net_worth: 850 })
    // Geen rij van een ander user_id (user_id zelf wordt niet geselecteerd).
    expect(data.some((r) => r.net_worth === 99_999)).toBe(false)
    // Eén stand per kalendermaand, oplopend, hooguit 12.
    const months = data.map((r) => r.snapshot_date.slice(0, 7))
    expect(new Set(months).size).toBe(months.length)
    expect(months).toEqual([...months].sort())
    expect(data.length).toBe(12)
    expect(months[0]).toBe('2025-10')
    // Per maand wint de laatste snapshot_date.
    expect(data[0]).toMatchObject({ snapshot_date: '2025-10-27', net_worth: 300 })
  })

  it('Given de verloop-kolommen, When de reeks geladen wordt, Then reizen resilience_score, score_version en engine_bron mee', async () => {
    const rows: Row[] = [
      snap('ik', '2026-08-31', 800, { resilience_score: 61, score_version: 1, engine_bron: 'v2', fire_age: 52.4 }),
      snap('ik', '2026-09-26', 900, { resilience_score: 64, score_version: 2, engine_bron: 'kernel', fire_age: 51.9 }),
    ]
    const data = ((await getNetWorthSnapshots12m(makePostgrestSim(rows))).data ?? []) as unknown as Row[]
    expect(data).toEqual([
      expect.objectContaining({ resilience_score: 61, score_version: 1, engine_bron: 'v2', fire_age: 52.4 }),
      expect.objectContaining({ resilience_score: 64, score_version: 2, engine_bron: 'kernel', fire_age: 51.9 }),
    ])
  })

  it('Given geen ingelogde gebruiker, When de reeks geladen wordt, Then is de reeks leeg zonder fout', async () => {
    mockCachedUser.current = null
    const res = await getNetWorthSnapshots12m(makePostgrestSim([snap('ik', '2026-09-26', 900)]))
    expect(res).toEqual({ data: [], error: null })
  })
})
