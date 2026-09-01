import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

/**
 * Route-niveau tests voor PATCH /api/goals — het contract dat `schema.test.ts`
 * al op zod-niveau bewaakt ("deze velden komen het geparste object niet in"),
 * hier bevestigd op het niveau dat er echt toe doet: wat de route daadwerkelijk
 * naar `.update(...)` op de tabel `goals` stuurt, en of het weglaten van `links`
 * de bestaande koppelingen ongemoeid laat (i.p.v. ze stil te wissen).
 *
 * De Supabase-mock is een chainbare query-builder per tabel, in de stijl van
 * `app/api/toekomst-doel/route.test.ts`: `.update/.insert/.delete` zetten de
 * operatie vast; terminals (`.maybeSingle()`/await) resolven per `(table:op)`.
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
  getAuthClaims: vi.fn(),
}))

import { PATCH } from './route'

const USER = { id: 'user-1' }
const GOAL_ID = randomUUID()

const results = {
  goalsSelect: vi.fn(), // resolveGoalAccess
  goalsUpdate: vi.fn(), // de eigenlijke PATCH
  goalLinksSelect: vi.fn(), // fetchLinksByGoal (withLinks) + applyLinkDiff's bestaande-koppelingen-lezing
}

// Gevangen mutaties, met genoeg detail om "geen koppel-mutatie" hard te bewijzen.
let updateCalls: Array<{ table: string; payload: unknown }> = []
let deleteCalls: Array<{ table: string; inIds?: unknown }> = []
let insertCalls: Array<{ table: string; rows: unknown }> = []

function resolveFor(table: string, op: string | undefined): Promise<unknown> {
  const key = `${table}:${op}`
  switch (key) {
    case 'goals:select':
      return Promise.resolve(results.goalsSelect())
    case 'goals:update':
      return Promise.resolve(results.goalsUpdate())
    case 'goal_links:select':
      return Promise.resolve(results.goalLinksSelect())
    default:
      return Promise.resolve({ data: null, error: null })
  }
}

function builder(table: string) {
  let op: string | undefined
  let lastInIds: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => {
      if (op === undefined) op = 'select'
      return b
    },
    update: (payload: unknown) => {
      op = 'update'
      updateCalls.push({ table, payload })
      return b
    },
    insert: (rows: unknown) => {
      op = 'insert'
      insertCalls.push({ table, rows })
      return b
    },
    delete: () => {
      op = 'delete'
      deleteCalls.push({ table, get inIds() { return lastInIds } })
      return b
    },
    eq: () => b,
    in: (_col: string, vals: unknown) => {
      lastInIds = vals
      return b
    },
    maybeSingle: () => resolveFor(table, op),
    single: () => resolveFor(table, op),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (onF: any, onR: any) => resolveFor(table, op).then(onF, onR),
  }
  return b
}

/** Minimale Request-dubbel: alleen headers.get() + text() worden gebruikt (readCappedRequest). */
function patchRequest(body: unknown) {
  const raw = JSON.stringify(body)
  return {
    url: 'http://localhost/api/goals',
    headers: { get: (k: string) => (k === 'content-length' ? String(raw.length) : null) },
    text: () => Promise.resolve(raw),
  } as unknown as Request
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockFrom.mockReset().mockImplementation((table: string) => builder(table))
  updateCalls = []
  deleteCalls = []
  insertCalls = []

  // Eigen doel, scope 'own' — de standaardsituatie voor deze suite.
  results.goalsSelect
    .mockReset()
    .mockReturnValue({ data: { id: GOAL_ID, user_id: USER.id, ownership: 'personal', household_id: null }, error: null })
  results.goalsUpdate
    .mockReset()
    .mockReturnValue({ data: { id: GOAL_ID, name: 'Doel', goal_type: 'savings' }, error: null })
  // Vorm die BEIDE lezers voedt die hetzelfde `goal_links:select` resolven:
  // `fetchLinksByGoal`/`withLinks` leest `goal_id`/`asset_id`/`debt_id`,
  // `applyLinkDiff`'s bestaande-koppelingen-lezing leest `id`/`user_id`/
  // `asset_id`/`debt_id`. Eén rij met alle velden bedient beide zonder dat de
  // stub hoeft te weten welke query 'm aanroept.
  results.goalLinksSelect.mockReset().mockReturnValue({
    data: [{ id: 'link-1', goal_id: GOAL_ID, user_id: USER.id, asset_id: 'asset-1', debt_id: null }],
    error: null,
  })
})

describe('PATCH /api/goals — whitelist: verboden velden bereiken de update-payload nooit', () => {
  it('metadata/user_id/household_id/ownership/linked_asset_id/linked_debt_id staan niet in de update-call', async () => {
    const res = await PATCH(
      patchRequest({
        id: GOAL_ID,
        current_value: 42,
        metadata: { sync: 'auto' },
        user_id: 'iemand-anders',
        household_id: 'ander-huishouden',
        ownership: 'shared',
        linked_asset_id: randomUUID(),
        linked_debt_id: randomUUID(),
      }),
    )
    expect(res.status).toBe(200)

    const patch = updateCalls.find((u) => u.table === 'goals')
    expect(patch).toBeTruthy()
    const payload = patch!.payload as Record<string, unknown>
    for (const verboden of ['metadata', 'user_id', 'household_id', 'ownership', 'linked_asset_id', 'linked_debt_id']) {
      expect(payload).not.toHaveProperty(verboden)
    }
    // De legitieme velden komen wél door.
    expect(payload.current_value).toBe(42)
    expect(typeof payload.updated_at).toBe('string')
  })

  it('een PATCH met UITSLUITEND verboden velden (en geen enkel toegestaan veld) schrijft alleen updated_at', async () => {
    const res = await PATCH(
      patchRequest({
        id: GOAL_ID,
        user_id: 'iemand-anders',
        ownership: 'shared',
      }),
    )
    expect(res.status).toBe(200)
    const payload = updateCalls.find((u) => u.table === 'goals')!.payload as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['updated_at'])
  })
})

describe('PATCH /api/goals — links weglaten wist geen koppelingen', () => {
  it('body zonder `links`-sleutel: geen enkele mutatie op goal_links', async () => {
    const res = await PATCH(patchRequest({ id: GOAL_ID, current_value: 10 }))
    expect(res.status).toBe(200)

    expect(deleteCalls.filter((d) => d.table === 'goal_links')).toEqual([])
    expect(insertCalls.filter((i) => i.table === 'goal_links')).toEqual([])

    // De bestaande koppeling komt ongewijzigd terug in de response (alleen
    // gelezen via withLinks, nooit aangeraakt).
    const json = await res.json()
    expect(json.links).toEqual([{ asset_id: 'asset-1', debt_id: null }])
  })

  it('contrast: een EXPLICIET lege `links`-payload verwijdert de bestaande koppeling wél', async () => {
    const res = await PATCH(
      patchRequest({ id: GOAL_ID, links: { assetIds: [], debtIds: [] } }),
    )
    expect(res.status).toBe(200)

    const goalLinksDelete = deleteCalls.find((d) => d.table === 'goal_links')
    expect(goalLinksDelete, 'expliciet leeg meesturen hoort de bestaande koppeling te verwijderen').toBeTruthy()
    expect(goalLinksDelete!.inIds).toEqual(['link-1'])
    expect(insertCalls.filter((i) => i.table === 'goal_links')).toEqual([])
  })
})
