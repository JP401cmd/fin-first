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
// Delete-filters (kolom → waarde) per delete-keten, zodat de anker-reconciliatie
// (welk goal_type verdwijnt) en `loslaten` (`.in` op de typen) te asserten zijn.
let deleted: Array<{ table: string; filters: Record<string, unknown> }> = []
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
  let deleteFilters: Record<string, unknown> | null = null
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
      deleteFilters = {}
      deleted.push({ table, filters: deleteFilters })
      return b
    },
    eq: (col: string, val: unknown) => {
      if (deleteFilters) deleteFilters[col] = val
      return b
    },
    in: (col: string, val: unknown) => {
      if (deleteFilters) deleteFilters[col] = val
      return b
    },
    filter: () => b,
    order: () => b,
    maybeSingle: () => resolveFor(table, op),
    single: () => resolveFor(table, op),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (onF: any, onR: any) => resolveFor(table, op).then(onF, onR),
  }
  return b
}

/** Minimal NextRequest-dubbel: alleen url + text() + headers.get() worden gebruikt. */
function putRequest(rawBody: string, contentLength?: string) {
  return {
    url: 'http://localhost/api/toekomst-doel',
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
  deleted = []
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
    // parseBody zet het veldpad ervoor ("action: …"); de tekst zelf blijft de oude.
    expect((await res.json()).error).toContain('Ongeldige actie')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een body die geen object is (zod-poort vóór elke DB-aanraking)', async () => {
    const res = await PUT(putRequest(JSON.stringify(['vastleggen'])))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een parameter die niet `true` is of een doelwaarde die geen getal is — geen DB', async () => {
    for (const body of [
      { action: 'vastleggen', parameters: { spaarquote: 'ja' }, doelwaarden: { spaarquotePct: 45 }, stand: { sliders: { savings: 45 } } },
      { action: 'vastleggen', parameters: { spaarquote: true }, doelwaarden: { spaarquotePct: 'veel' }, stand: { sliders: { savings: 45 } } },
      { action: 'vastleggen', parameters: { spaarquote: true }, doelwaarden: { spaarquotePct: 45 }, stand: 'kapot' },
    ]) {
      const res = await PUT(putRequest(JSON.stringify(body)))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('validation_error')
    }
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('onbekende parameter-sleutels worden gestript, zoals de oude whitelist deed', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true, onbekend: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate'])
  })

  it('vastleggen met parameters.salaris wordt genegeerd (geen 400, geen salary-rij)', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true, salaris: true },
          doelwaarden: { spaarquotePct: 30, salarisMnd: 5000 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate'])
    expect(inserted.some((i) => i.row.goal_type === 'salary')).toBe(false)
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

  it('verwijdert óók het dekkingsdoel (plan_coverage zit in PARAMETER_GOAL_TYPES) — onder elk anker, ook `now`', async () => {
    const res = await PUT(putRequest(JSON.stringify({ action: 'loslaten' })))
    expect(res.status).toBe(200)
    const del = deleted.find((d) => d.table === 'goals')
    expect(del).toBeTruthy()
    // ADR 0145 D12 — het lab-eindvermogen (end_balance) hoort er óók bij.
    expect(del!.filters.goal_type).toEqual(['savings_rate', 'expected_return', 'fire_age', 'plan_coverage', 'end_balance', 'salary'])
    expect(del!.filters.user_id).toBe('user-1')
  })

  it('loslaten verwijdert óók legacy salary-rijen (bron parameter), hoewel het lab die niet meer aanmaakt', async () => {
    const res = await PUT(putRequest(JSON.stringify({ action: 'loslaten' })))
    expect(res.status).toBe(200)
    const del = deleted.find((d) => d.table === 'goals')
    expect(del).toBeTruthy()
    expect(del!.filters.goal_type).toContain('salary')
    expect(del!.filters.goal_type).toContain('plan_coverage')
  })
})

// ── ADR 0145 D3: het anker is server-bepaald ────────────────────────────────

/** Een profielrij zoals de plan-select 'm teruggeeft (FIRE_PLAN_COLUMNS + feature_preferences). */
function planRow(over: Record<string, unknown> = {}) {
  return {
    data: {
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      fire_stop_anchor: 'solved',
      fire_stop_age: null,
      feature_preferences: null,
      ...over,
    },
    error: null,
  }
}

describe('PUT /api/toekomst-doel — vastleggen volgt het anker (ADR 0145)', () => {
  it('aow + {fire, spaarquote}: fire wordt gestript → alleen savings_rate; de stopkeuze verdwijnt uit doel.stand', async () => {
    // Twee profiel-selects: eerst het plan, dan de pref (default-mock).
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { fire: true, spaarquote: true },
          doelwaarden: { spaarquotePct: 45, fireLeeftijd: 58, margeJaren: 3 },
          stand: { sliders: { savings: 45 }, stopAge: 58, stopKoppel: true, stopMarge: 2 },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, goalIds: { spaarquote: 'g-1' } })
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate'])

    const doel = updated.find((u) => u.table === 'profiles')!.payload.toekomst_scenario_prefs.doel
    expect(doel.parameters).toEqual({ spaarquote: true })
    expect(doel.stand).toEqual({ sliders: { savings: 45 } })
    expect(doel.stand.stopAge).toBeUndefined()
    expect(doel.stand.stopKoppel).toBeUndefined()
  })

  it('aow + dekking: plan_coverage met de SERVER-eindleeftijd; plan-velden uit de body worden genegeerd', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow', fire_end_age: 92 }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true, spaarquote: true },
          // Een client die zelf plan-velden meestuurt: die tellen niet.
          doelwaarden: { spaarquotePct: 45, planEindleeftijd: 55, planStopAnker: 'age', planStopLeeftijd: 40 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, goalIds: { spaarquote: 'g-1', dekking: 'g-2' } })
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate', 'plan_coverage'])
    const dekking = inserted.find((i) => i.row.goal_type === 'plan_coverage')!.row
    expect(dekking.name).toBe('Plan gedekt tot 92 jaar')
    expect(dekking.target_value).toBe(100)
    expect(dekking.current_value).toBe(0)
    expect(dekking.metadata).toEqual({ bron: 'parameter', oorsprong: 'lab', eindleeftijd: 92, stopAnker: 'aow', stopLeeftijd: null })

    const doel = updated.find((u) => u.table === 'profiles')!.payload.toekomst_scenario_prefs.doel
    expect(doel.parameters).toEqual({ spaarquote: true, dekking: true })
  })

  it('age 58,5 + dekking: de stopleeftijd van het plan landt in de metadata', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'age', fire_stop_age: 58.5 }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true },
          doelwaarden: {},
          stand: { sliders: { extraInleg: 300 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(inserted[0].row.metadata).toMatchObject({ stopAnker: 'age', stopLeeftijd: 58.5, eindleeftijd: 90 })
  })

  it('age × perpetual: de eindleeftijd volgt de kernel (100), niet het opgeslagen veld', async () => {
    results.profilesSelect.mockReturnValueOnce(
      planRow({ fire_stop_anchor: 'age', fire_stop_age: 58, fire_end_strategy: 'perpetual', fire_end_age: 90 }),
    )
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true },
          doelwaarden: {},
          stand: { sliders: { extraInleg: 300 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(inserted[0].row.name).toBe('Plan gedekt tot 100 jaar')
    expect(inserted[0].row.metadata).toMatchObject({ eindleeftijd: 100 })
  })

  it('legacy-label `pensioen` in fire_end_strategy telt als aow-anker (D2-lezing van de loaders)', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_end_strategy: 'pensioen', fire_end_age: 100 }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true },
          doelwaarden: {},
          stand: { sliders: { savings: 50 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(inserted[0].row.goal_type).toBe('plan_coverage')
    expect(inserted[0].row.metadata).toMatchObject({ stopAnker: 'aow', eindleeftijd: 100 })
  })

  it('solved + dekking → 400 (dekking_vereist_vast_anker), geen goals, geen pref-write', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow())
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true, spaarquote: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Een dekkingsdoel hoort bij een vast stopmoment', code: 'dekking_vereist_vast_anker' })
    expect(inserted).toEqual([])
    expect(updated).toEqual([])
  })

  it('age + gedekt + eindvermogen (D12): end_balance-rij met het NOMINALE bedrag uit de body en de plan-velden van de server', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'age', fire_stop_age: 60, fire_end_age: 90 }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { eindvermogen: true },
          // Plan-velden uit de body tellen niet; het bedrag wél (alleen de live-sim kent 'm).
          doelwaarden: { eindvermogen: 412_345.67, planEindleeftijd: 55, planStopAnker: 'aow' },
          stand: { sliders: { extraInleg: 300 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, goalIds: { eindvermogen: 'g-1' } })
    expect(inserted).toHaveLength(1)
    const row = inserted[0].row
    expect(row.goal_type).toBe('end_balance')
    expect(row.name).toBe('Eindvermogen op je 90e')
    expect(row.target_value).toBe(412_345.67)
    expect(row.icon).toBe('Vault')
    expect(row.metadata).toEqual({ bron: 'parameter', oorsprong: 'lab', eindleeftijd: 90, stopAnker: 'age', stopLeeftijd: 60 })
    const doel = updated.find((u) => u.table === 'profiles')!.payload.toekomst_scenario_prefs.doel
    expect(doel.parameters).toEqual({ eindvermogen: true })
  })

  it('M8 · eindvermogen vastleggen onder een vast anker ruimt fire_age én de lab-plan_coverage-rij op (één uitkomstdoel)', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { eindvermogen: true },
          doelwaarden: { eindvermogen: 100_000 },
          stand: { sliders: { savings: 40 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    const goalDeletes = deleted.filter((d) => d.table === 'goals')
    expect(goalDeletes).toHaveLength(1)
    expect(goalDeletes[0].filters).toEqual({ user_id: 'user-1', goal_type: ['fire_age', 'plan_coverage'] })
  })

  it('M8 · dekking vastleggen onder een vast anker ruimt de lab-end_balance-rij op', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'age', fire_stop_age: 60 }))
    const res = await PUT(
      putRequest(JSON.stringify({ action: 'vastleggen', parameters: { dekking: true }, doelwaarden: {}, stand: { sliders: { savings: 50 } } })),
    )
    expect(res.status).toBe(200)
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['plan_coverage'])
    const goalDeletes = deleted.filter((d) => d.table === 'goals')
    expect(goalDeletes.map((d) => d.filters.goal_type)).toEqual([['fire_age', 'end_balance']])
  })

  it('M8 · worden dekking én eindvermogen in één keer geschreven, dan ruimt de route geen van beide op', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true, eindvermogen: true },
          doelwaarden: { eindvermogen: 100_000 },
          stand: { sliders: { savings: 40 } },
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(deleted.filter((d) => d.table === 'goals').map((d) => d.filters.goal_type)).toEqual([['fire_age']])
  })

  it('M9 · een eindvermogen-doelwaarde boven € 10 mld → 400 (zod), geen DB', async () => {
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { eindvermogen: true },
          doelwaarden: { eindvermogen: 1e11 },
          stand: { sliders: { savings: 40 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation_error')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('eindvermogen zonder (of met een negatief) bedrag → overgeslagen → 400 "Geen geldige doelwaarden", geen goals', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { eindvermogen: true },
          doelwaarden: { eindvermogen: -5 },
          stand: { sliders: { savings: 40 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it('solved + eindvermogen → 400 (eindvermogen_vereist_vast_anker), geen goals, geen pref-write', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow())
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { eindvermogen: true, spaarquote: true },
          doelwaarden: { spaarquotePct: 45, eindvermogen: 100_000 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Een eindvermogen-doel hoort bij een vast stopmoment',
      code: 'eindvermogen_vereist_vast_anker',
    })
    expect(inserted).toEqual([])
    expect(updated).toEqual([])
  })

  it('now → 400 (anchor_now): verkennen mag, geen doel uit het lab', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'now' }))
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
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Onder dit stopmoment legt het lab geen doel vast', code: 'anchor_now' })
    expect(inserted).toEqual([])
    expect(deleted).toEqual([])
  })

  it('aow + alleen {fire} → na strippen niets over → 400 "Geen doelparameters" mét code geen_parameters_na_plan', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { fire: true },
          doelwaarden: { fireLeeftijd: 58 },
          stand: { stopAge: 58 },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Geen doelparameters', code: 'geen_parameters_na_plan' })
    expect(inserted).toEqual([])
  })

  it('een lege keuze (niets aangevinkt) houdt "Geen doelparameters" zónder code — de generieke client-melding', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(JSON.stringify({ action: 'vastleggen', parameters: {}, doelwaarden: {}, stand: { sliders: { savings: 45 } } })),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Geen doelparameters' })
  })

  it('aow + dekking met alléén een stopkeuze als stand → na strippen leeg → 400 "Ongeldige doelstand", geen wees-goals', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'aow' }))
    const res = await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true },
          doelwaarden: {},
          stand: { stopAge: 62, stopKoppel: false },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Ongeldige doelstand')
    expect(inserted).toEqual([])
  })

  it('reconciliatie: onder een vast anker verdwijnt de fire_age-parameterrij; onder solved de plan_coverage-rij', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow({ fire_stop_anchor: 'age', fire_stop_age: 60 }))
    await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { dekking: true },
          doelwaarden: {},
          stand: { sliders: { savings: 50 } },
        }),
      ),
    )
    const vast = deleted.filter((d) => d.table === 'goals')
    expect(vast).toHaveLength(1)
    // M8: met `dekking` gaat óók de lab-end_balance-rij weg.
    expect(vast[0].filters).toEqual({ user_id: 'user-1', goal_type: ['fire_age', 'end_balance'] })

    deleted = []
    inserted = []
    updated = []
    results.profilesSelect.mockReturnValueOnce(planRow())
    await PUT(
      putRequest(
        JSON.stringify({
          action: 'vastleggen',
          parameters: { spaarquote: true },
          doelwaarden: { spaarquotePct: 45 },
          stand: { sliders: { savings: 45 } },
        }),
      ),
    )
    const solved = deleted.filter((d) => d.table === 'goals')
    expect(solved).toHaveLength(1)
    expect(solved[0].filters).toEqual({ user_id: 'user-1', goal_type: ['plan_coverage'] })
    // De reconciliatie komt ná de upserts en vóór de pref-write.
    expect(inserted.map((i) => i.row.goal_type)).toEqual(['savings_rate'])
    expect(updated.find((u) => u.table === 'profiles')).toBeTruthy()
  })

  it('500 als de plan-read faalt — geen goals, geen pref-write, geen rauwe DB-tekst', async () => {
    results.profilesSelect.mockReturnValueOnce({ data: null, error: { code: 'XX000', message: 'geheim detail' } })
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
    const json = await res.json()
    expect(json.error).not.toContain('geheim detail')
    expect(inserted).toEqual([])
    expect(updated).toEqual([])
  })

  it('500 als de reconciliatie-delete faalt (pref blijft ongemoeid)', async () => {
    results.profilesSelect.mockReturnValueOnce(planRow())
    results.goalsDelete.mockReturnValue({ error: { code: 'XX000' } })
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
    expect(updated.filter((u) => u.table === 'profiles')).toEqual([])
  })
})
