import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/wealth-selection — de datalaag van de vermogens-widget (ADR 0120).
 *
 * De nep-supabase hieronder is bewust GEEN passieve stub: hij PAST de
 * `.eq()`/`.in()`-filters die de route zet daadwerkelijk toe op een fixture die
 * óók een rij van een ándere gebruiker bevat. Vergeet de route zijn
 * `user_id`-filter, dan komt die vreemde rij door en valt de test om — precies
 * de scoping die ADR 0120 besluit 4 eist, omdat de SELECT-policy op `assets`
 * huishoud-gedeeld is en RLS hier dus níét de scoping doet.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET, PUT } from './route'

const USER = 'user-1'
const OTHER = 'user-2'

const A_MINE = '00000000-0000-4000-8000-000000000001'
const A_MINE_2 = '00000000-0000-4000-8000-000000000002'
const A_THEIRS = '00000000-0000-4000-8000-0000000000ff'
const D_MINE = '00000000-0000-4000-8000-000000000011'

type Row = Record<string, unknown>

const ASSETS: Row[] = [
  { id: A_MINE, user_id: USER, name: 'Beleggingen', asset_type: 'investment', current_value: 10000, net_worth_inclusion_pct: 100, is_active: true },
  { id: A_MINE_2, user_id: USER, name: 'Huis', asset_type: 'eigen_huis', current_value: 400000, net_worth_inclusion_pct: 50, is_active: true },
  { id: A_THEIRS, user_id: OTHER, name: 'Partner-depot', asset_type: 'investment', current_value: 99999, net_worth_inclusion_pct: 100, is_active: true },
]

const DEBTS: Row[] = [
  { id: D_MINE, user_id: USER, name: 'Hypotheek', debt_type: 'mortgage', current_balance: 100000, net_worth_inclusion_pct: 50, is_active: true },
]

/** Alle `.update(...)`-payloads die de route naar `profiles` stuurde. */
let updatePayloads: Record<string, unknown>[] = []
/** Alle kolomlijsten die de route opvroeg, per tabel. */
let selectedColumns: Record<string, string[]> = {}

interface Query {
  select(cols: string): Query
  eq(col: string, val: unknown): Query
  in(col: string, vals: unknown[]): Query
  order(): Query
  single(): Promise<{ data: Row | null; error: null }>
  then<R>(onFulfilled: (v: { data: Row[]; error: null }) => R): Promise<R>
}

/** Thenable query-builder die de gezette filters écht toepast. */
function makeQuery(table: string, rows: Row[]): Query {
  const filters: ((r: Row) => boolean)[] = []
  const apply = () => rows.filter(r => filters.every(f => f(r)))
  const q: Query = {
    select(cols: string) {
      ;(selectedColumns[table] ??= []).push(cols)
      return q
    },
    eq(col, val) {
      filters.push(r => r[col] === val)
      return q
    },
    in(col, vals) {
      filters.push(r => vals.includes(r[col]))
      return q
    },
    order() {
      return q
    },
    async single() {
      return { data: apply()[0] ?? null, error: null }
    },
    then(onFulfilled) {
      return Promise.resolve({ data: apply(), error: null }).then(onFulfilled)
    },
  }
  return q
}

function buildClient(opts: { featurePreferences?: Record<string, unknown> | null } = {}) {
  const profiles: Row[] = [
    { id: USER, feature_preferences: opts.featurePreferences ?? null },
    { id: OTHER, feature_preferences: { wealth_widget_selection: { assetIds: [A_THEIRS], debtIds: [] } } },
  ]
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: USER } } }),
    },
    from(table: string) {
      if (table === 'assets') return makeQuery(table, ASSETS)
      if (table === 'debts') return makeQuery(table, DEBTS)
      if (table === 'profiles') {
        const q = makeQuery(table, profiles) as Query & {
          update(patch: Record<string, unknown>): { eq(): Promise<{ error: null }> }
        }
        q.update = (patch: Record<string, unknown>) => {
          updatePayloads.push(patch)
          return { eq: async () => ({ error: null }) }
        }
        return q
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }
}

function putReq(body: unknown): Request {
  return new Request('http://localhost/api/wealth-selection', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  updatePayloads = []
  selectedColumns = {}
  mockCreateClient.mockReset()
  mockGetAuthClaims.mockReset()
  mockGetAuthClaims.mockResolvedValue({ sub: USER })
})

describe('GET /api/wealth-selection', () => {
  it('geeft 401 zonder sessie', async () => {
    mockCreateClient.mockResolvedValue(buildClient())
    mockGetAuthClaims.mockResolvedValue(null)

    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
  })

  it('levert alleen EIGEN rijen in de keuzelijst — de rij van een andere gebruiker komt er niet in', async () => {
    mockCreateClient.mockResolvedValue(buildClient())

    const res = await GET()
    const body = (await res.json()) as {
      available: { assets: { id: string }[]; debts: { id: string }[] }
    }

    expect(res.status).toBe(200)
    expect(body.available.assets.map(a => a.id)).toEqual([A_MINE, A_MINE_2])
    expect(body.available.assets.map(a => a.id)).not.toContain(A_THEIRS)
    expect(body.available.debts.map(d => d.id)).toEqual([D_MINE])
  })

  it('geeft per regel de GEWOGEN waarde (current_value × pct/100)', async () => {
    mockCreateClient.mockResolvedValue(buildClient())

    const res = await GET()
    const body = (await res.json()) as {
      available: { assets: { id: string; value: number; type: string }[]; debts: { value: number }[] }
    }

    expect(body.available.assets.find(a => a.id === A_MINE_2)?.value).toBe(200000)
    expect(body.available.assets.find(a => a.id === A_MINE_2)?.type).toBe('eigen_huis')
    expect(body.available.debts[0].value).toBe(50000)
  })

  it('vraagt expliciete kolomlijsten op — nooit select(*) op assets/debts', async () => {
    mockCreateClient.mockResolvedValue(buildClient())
    await GET()

    for (const cols of [...(selectedColumns.assets ?? []), ...(selectedColumns.debts ?? [])]) {
      expect(cols).not.toBe('*')
      expect(cols).not.toContain('encrypted')
      expect(cols).not.toContain('hash')
    }
  })

  it('geeft de opgeslagen selectie terug, met stale id\'s stil weggefilterd', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        featurePreferences: {
          wealth_widget_selection: {
            assetIds: [A_MINE, '00000000-0000-4000-8000-00000000dead'],
            debtIds: [D_MINE],
          },
        },
      }),
    )

    const res = await GET()
    const body = (await res.json()) as { selection: { assetIds: string[]; debtIds: string[] } | null }
    expect(body.selection).toEqual({ assetIds: [A_MINE], debtIds: [D_MINE] })
  })

  it('geeft selection: null wanneer er niets is opgeslagen', async () => {
    mockCreateClient.mockResolvedValue(buildClient())
    const body = (await (await GET()).json()) as { selection: unknown }
    expect(body.selection).toBeNull()
  })
})

describe('PUT /api/wealth-selection', () => {
  it('geeft 401 zonder sessie', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from: () => { throw new Error('mag niet worden aangeroepen zonder sessie') },
    })

    const res = await PUT(putReq({ assetIds: [], debtIds: [] }))
    expect(res.status).toBe(401)
  })

  it('geeft 400 op een body die het zod-schema niet haalt', async () => {
    mockCreateClient.mockResolvedValue(buildClient())

    const res = await PUT(putReq({ assetIds: ['geen-uuid'], debtIds: [] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code?: string }
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('validation_error')
    expect(updatePayloads).toHaveLength(0)
  })

  it('geeft 400 wanneer een verplicht veld ontbreekt', async () => {
    mockCreateClient.mockResolvedValue(buildClient())
    const res = await PUT(putReq({ assetIds: [A_MINE] }))
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })

  it('slaat alleen EIGEN, bestaande id\'s op — een id van een andere gebruiker valt stil af', async () => {
    mockCreateClient.mockResolvedValue(buildClient())

    const res = await PUT(putReq({ assetIds: [A_MINE, A_THEIRS], debtIds: [D_MINE] }))
    expect(res.status).toBe(200)

    const stored = updatePayloads[0].feature_preferences as Record<string, unknown>
    expect(stored.wealth_widget_selection).toEqual({ assetIds: [A_MINE], debtIds: [D_MINE] })
    const body = (await res.json()) as { selection: { assetIds: string[] } }
    expect(body.selection.assetIds).toEqual([A_MINE])
  })

  it('schrijft kolom-gescoopt en laat andere feature_preferences-sleutels ongemoeid', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({ featurePreferences: { fire_strategy_override: 'pensioen', deferred_onboarding_fields: ['x'] } }),
    )

    const res = await PUT(putReq({ assetIds: [A_MINE], debtIds: [] }))
    expect(res.status).toBe(200)
    expect(updatePayloads).toHaveLength(1)
    // Kolom-gescoopt: uitsluitend feature_preferences in de UPDATE-payload.
    expect(Object.keys(updatePayloads[0])).toEqual(['feature_preferences'])

    const stored = updatePayloads[0].feature_preferences as Record<string, unknown>
    expect(stored.fire_strategy_override).toBe('pensioen')
    expect(stored.deferred_onboarding_fields).toEqual(['x'])
    expect(stored.wealth_widget_selection).toEqual({ assetIds: [A_MINE], debtIds: [] })
  })

  it('wist alleen de eigen sleutel bij een lege selectie', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        featurePreferences: {
          fire_strategy_override: 'pensioen',
          wealth_widget_selection: { assetIds: [A_MINE], debtIds: [] },
        },
      }),
    )

    const res = await PUT(putReq({ assetIds: [], debtIds: [] }))
    expect(res.status).toBe(200)

    const stored = updatePayloads[0].feature_preferences as Record<string, unknown>
    expect(stored).not.toHaveProperty('wealth_widget_selection')
    expect(stored.fire_strategy_override).toBe('pensioen')
    expect((await res.json() as { selection: unknown }).selection).toBeNull()
  })

  it('wist de sleutel ook wanneer élk ingezonden id vreemd of dood is', async () => {
    mockCreateClient.mockResolvedValue(buildClient())

    const res = await PUT(putReq({ assetIds: [A_THEIRS], debtIds: [] }))
    expect(res.status).toBe(200)
    const stored = updatePayloads[0].feature_preferences as Record<string, unknown>
    expect(stored).not.toHaveProperty('wealth_widget_selection')
  })
})
