import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/toekomst-doel — de promotie-route ("verkennen wordt richten").
 * Borgt het contract waar de lab-UX (stap 5/6) op leunt:
 *   - 401 zonder sessie (geen DB-aanraking);
 *   - 400 malformed / onbekende actie / geen parameters / geen doelwaarden;
 *   - 400 bij een ongeldige doelstand — en dán GEEN goals (geen wees-rijen);
 *   - 413 bij een te grote body;
 *   - vastleggen: insert-pad én idempotent (bestaande rij → update, geen 2e insert);
 *   - unique-violation-race → her-select + update;
 *   - pref-write bevat het doel-blok mét goalIds + gesaneerde stand;
 *   - loslaten: goals-delete + `doel` weg uit de pref, overige pref-velden behouden.
 *
 * De Supabase-mock is een chainbare query-builder: `.select/.insert/.update/.delete`
 * zetten de operatie; terminals (`maybeSingle/single`/await) resolven per `(table:op)`.
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

// Per-(table:op) terminal-resultaten (vi.fn → call-counts asserten mogelijk).
const results = {
  goalsSelect: vi.fn(),
  goalsInsert: vi.fn(),
  goalsUpdate: vi.fn(),
  goalsDelete: vi.fn(),
  profilesSelect: vi.fn(),
  profilesUpdate: vi.fn(),
}

// Gevangen mutatie-payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let inserted: Array<{ table: string; row: any }> = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let updated: Array<{ table: string; payload: any }> = []
let insertSeq = 0

function resolveFor(table: string, op: string | undefined): Promise<unknown> {
  const key = `${table}:${op}`
  switch (key) {
    case 'goals:select':
      return Promise.resolve(results.goalsSelect())
    case 'goals:insert':
      return Promise.resolve(results.goalsInsert())
    case 'goals:update':
      return Promise.resolve(results.goalsUpdate())
    case 'goals:delete':
      return Promise.resolve(results.goalsDelete())
    case 'profiles:select':
      return Promise.resolve(results.profilesSelect())
    case 'profiles:update':
      return Promise.resolve(results.profilesUpdate())
    default:
      return Promise.resolve({ data: null, error: null })
  }
}

function builder(table: string) {
  let op: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => {
      if (op === undefined) op = 'select'
      return b
    },
    insert: (row: unknown) => {
      op = 'insert'
      inserted.push({ table, row })
      return b
    },
    update: (payload: unknown) => {
      op = 'update'
      updated.push({ table, payload })
      return b
    },
    delete: () => {
      op = 'delete'
      return b
    },
    eq: () => b,
    in: () => b,
    filter: () => b,
    order: () => b,
    maybeSingle: () => resolveFor(table, op),
    single: () => resolveFor(table, op),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (onF: any, onR: any) => resolveFor(table, op).then(onF, onR),
  }
  return b
}

/** Minimal NextRequest-dubbel: alleen text() + headers.get() worden gebruikt. */
function putRequest(rawBody: string, contentLength?: string) {
  return {
    headers: {
      get: (k: string) => (k === 'content-length' ? (contentLength ?? String(rawBody.length)) : null),
    },
    text: () => Promise.resolve(rawBody),
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
  mockFrom.mockImplementation((table: string) => builder(table))
  inserted = []
  updated = []
  insertSeq = 0
  results.goalsSelect.mockReset().mockReturnValue({ data: null, error: null })
  results.goalsInsert
    .mockReset()
    .mockImplementation(() => ({ data: { id: `g-${++insertSeq}` }, error: null }))
  results.goalsUpdate.mockReset().mockReturnValue({ error: null })
  results.goalsDelete.mockReset().mockReturnValue({ error: null })
  results.profilesSelect.mockReset().mockReturnValue({ data: { toekomst_scenario_prefs: null }, error: null })
  results.profilesUpdate.mockReset().mockReturnValue({ error: null })
  mockGetUser.mockResolvedValue({ data: { user: USER } })
})

describe('PUT /api/toekomst-doel — guards', () => {
  it('401 zonder sessie (geen DB)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(putRequest(JSON.stringify({ action: 'loslaten' })))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    const res = await PUT(putRequest('{ kapot'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('413 bij een body groter dan de limiet', async () => {
    const big = JSON.stringify({ action: 'loslaten', pad: 'x'.repeat(9000) })
    const res = await PUT(putRequest(big))
    expect(res.status).toBe(413)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een onbekende actie', async () => {
    const res = await PUT(putRequest(JSON.stringify({ action: 'iets-anders' })))
    expect(res.status).toBe(400)
  })

  it('400 als geen enkele parameter is aangevinkt', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: {},
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it('400 als alle aangevinkte parameters geen doelwaarde hebben', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { fire: true },
          doelwaarden: {},
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it('400 bij een ongeldige doelstand — en dán GEEN goals (geen wees-rijen)', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: {}, // lege stand → doel-blok valt weg → 400
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
    expect(updated.filter((u) => u.table === 'profiles')).toEqual([])
  })
})

describe('PUT /api/toekomst-doel — vastleggen', () => {
  it('insert-pad: schrijft goals + doel-blok met goalIds en gesaneerde stand', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true, fire: true },
          doelwaarden: { spaarquotePct: 45, fireLeeftijd: 58, margeJaren: 3 },
          stand: { sliders: { savings: 45 }, stopAge: 58 },
        }),
      ),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.goalIds).toEqual({ spaarquote: 'g-1', fire: 'g-2' })

    // Twee inserts (savings_rate, fire_age), geen goals-updates.
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate', 'fire_age'])
    for (const i of inserted) {
      expect(i.table).toBe('goals')
      expect(i.row.user_id).toBe('user-1')
      expect(i.row.current_value).toBe(0)
      expect(i.row.color).toBe('purple')
      expect(i.row.metadata.bron).toBe('parameter')
      expect(i.row.metadata.oorsprong).toBe('lab')
    }
    expect(updated.filter((u) => u.table === 'goals')).toEqual([])

    // Pref-write bevat het doel-blok mét goalIds + gesaneerde stand.
    const prefWrite = updated.find((u) => u.table === 'profiles')
    expect(prefWrite).toBeTruthy()
    const doel = prefWrite!.payload.toekomst_scenario_prefs.doel
    expect(doel.parameters).toEqual({ spaarquote: true, fire: true })
    expect(doel.goalIds).toEqual({ spaarquote: 'g-1', fire: 'g-2' })
    expect(doel.stand.sliders.savings).toBe(45)
    expect(doel.stand.stopAge).toBe(58)
    expect(typeof doel.gezetOp).toBe('string')
  })

  it('idempotent: bestaande parameter-rij → update, geen tweede insert', async () => {
    results.goalsSelect.mockReturnValue({ data: { id: 'bestaand-1' }, error: null })
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true },
          doelwaarden: { spaarquotePct: 50 },
          stand: { sliders: { savings: 50 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.goalIds).toEqual({ spaarquote: 'bestaand-1' })
    expect(inserted).toEqual([])
    const goalUpdate = updated.find((u) => u.table === 'goals')
    expect(goalUpdate).toBeTruthy()
    expect(goalUpdate!.payload.name).toBe('Spaarquote naar 50%')
    expect(goalUpdate!.payload.is_completed).toBe(false)
  })

  it('unique-violation bij insert → her-select + update (geen fout)', async () => {
    results.goalsSelect
      .mockReturnValueOnce({ data: null, error: null }) // 1e select: nog niets
      .mockReturnValue({ data: { id: 'raced-1' }, error: null }) // her-select na race
    results.goalsInsert.mockReturnValue({ data: null, error: { code: '23505' } })

    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.goalIds).toEqual({ spaarquote: 'raced-1' })
    expect(inserted).toHaveLength(1)
    expect(updated.find((u) => u.table === 'goals')).toBeTruthy()
  })

  it('500 bij een DB-fout op de goal-insert', async () => {
    results.goalsInsert.mockReturnValue({ data: null, error: { code: 'XX000' } })
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(500)
    // Pref niet geschreven als de goals faalden.
    expect(updated.filter((u) => u.table === 'profiles')).toEqual([])
  })
})

describe('PUT /api/toekomst-doel — loslaten', () => {
  it('verwijdert de parameter-goals en haalt `doel` uit de pref (overige velden behouden)', async () => {
    results.profilesSelect.mockReturnValue({
      data: {
        toekomst_scenario_prefs: {
          v: 2,
          sliders: { savings: 40 },
          doel: {
            gezetOp: new Date().toISOString(),
            parameters: { spaarquote: true },
            stand: { sliders: { savings: 40 } },
          },
        },
      },
      error: null,
    })

    const res = await PUT(putRequest(JSON.stringify({ action: 'loslaten' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(results.goalsDelete).toHaveBeenCalled()

    const prefWrite = updated.find((u) => u.table === 'profiles')
    expect(prefWrite).toBeTruthy()
    const written = prefWrite!.payload.toekomst_scenario_prefs
    expect(written.doel).toBeUndefined()
    expect(written.sliders.savings).toBe(40)
  })

  it('500 als de goals-delete faalt (pref blijft ongemoeid)', async () => {
    results.goalsDelete.mockReturnValue({ error: { code: 'XX000' } })
    const res = await PUT(putRequest(JSON.stringify({ action: 'loslaten' })))
    expect(res.status).toBe(500)
    expect(updated.filter((u) => u.table === 'profiles')).toEqual([])
  })
})
