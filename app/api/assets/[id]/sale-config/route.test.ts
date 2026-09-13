import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/assets/[id]/sale-config (TPR-15) — de smalle schrijfroute voor de
 * verkoopinstelling.
 *
 * Invarianten: (a) 401 zonder sessie; (b) 404 op een malformed of vreemd id en op 0
 * geraakte rijen (partnerrij, huis, liquide type) — nooit een stille succes; (c) de update
 * schrijft ALLEEN `sale_config`, gefilterd op eigen `user_id` en de typen met een
 * verkoopinstelling; (d) het schema is gesloten (extra sleutels, buiten-bereik-kosten,
 * vast moment zonder moment → 400); (e) aflossen alleen met eigen schulden;
 * (f) DB-fouten lekken geen interne tekst.
 */

const ID = '11111111-1111-4111-8111-111111111111'
const DEBT = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const HOUSEHOLD = '44444444-4444-4444-8444-444444444444'

let user: { id: string } | null
let assetResult: { data: unknown; error: unknown }
let debtResult: { data: unknown; error: unknown }
let memberResult: { data: unknown; error: unknown }
type Calls = Record<string, unknown[][]>
let calls: Record<string, Calls>

function chain(table: string) {
  const tableCalls: Calls = (calls[table] ||= {})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {}
  for (const m of ['select', 'eq', 'in', 'or', 'update']) {
    c[m] = vi.fn((...args: unknown[]) => {
      ;(tableCalls[m] ||= []).push(args)
      return c
    })
  }
  c.maybeSingle = vi.fn(() => Promise.resolve(table === 'household_members' ? memberResult : assetResult))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.then = (onF: any, onR: any) => Promise.resolve(table === 'debts' ? debtResult : assetResult).then(onF, onR)
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => chain(table),
  }),
}))

import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://x/api/assets/id/sale-config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never
}
const params = (id = ID) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  user = { id: USER }
  assetResult = { data: { id: ID }, error: null }
  debtResult = { data: [{ id: DEBT }], error: null }
  memberResult = { data: null, error: null }
  calls = {}
})

describe('PATCH /api/assets/[id]/sale-config', () => {
  it('401 zonder sessie, zonder DB-write', async () => {
    user = null
    const res = await PATCH(req({ sale_config: { stand: 'niet_verkopen' } }), params())
    expect(res.status).toBe(401)
    expect(calls.assets).toBeUndefined()
  })

  it('404 op een malformed id, zonder DB-write', async () => {
    const res = await PATCH(req({ sale_config: { stand: 'niet_verkopen' } }), params('abc'))
    expect(res.status).toBe(404)
    expect(calls.assets).toBeUndefined()
  })

  it('schrijft alleen sale_config, op eigen rij en typen met een verkoopinstelling', async () => {
    const cfg = { stand: 'wanneer_nodig', triggerAge: 75, salesCostsPct: 0.06 }
    const res = await PATCH(req({ sale_config: cfg }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ID, sale_config: cfg })
    expect(calls.assets.update).toEqual([[{ sale_config: cfg }]])
    expect(calls.assets.eq).toEqual([
      ['id', ID],
      ['user_id', USER],
    ])
    const [[kolom, typen]] = calls.assets.in as [[string, string[]]]
    expect(kolom).toBe('asset_type')
    expect([...typen].sort()).toEqual(['deelneming', 'other', 'physical', 'real_estate', 'vehicle'])
    expect(typen).not.toContain('eigen_huis')
    expect(calls.assets.select).toEqual([['id']])
  })

  it('0 geraakte rijen (partnerrij, huis, liquide type) → 404, geen succes', async () => {
    assetResult = { data: null, error: null }
    const res = await PATCH(req({ sale_config: { stand: 'niet_verkopen' } }), params())
    expect(res.status).toBe(404)
  })

  it.each([
    ['extra sleutel in de body', { sale_config: { stand: 'niet_verkopen' }, user_id: 'u2' }],
    ['extra sleutel in de config', { sale_config: { stand: 'niet_verkopen', triggerAge: 70 } }],
    ['onbekende stand', { sale_config: { stand: 'altijd' } }],
    ['kosten boven 20%', { sale_config: { stand: 'wanneer_nodig', salesCostsPct: 0.5 } }],
    ['vast moment zonder leeftijd of datum', { sale_config: { stand: 'vast_moment', triggerAge: null } }],
    ['ongeldige datum', { sale_config: { stand: 'vast_moment', triggerDate: '2040-13-40' } }],
    ['geen config', {}],
  ])('400 bij %s, zonder DB-write', async (_naam, body) => {
    const res = await PATCH(req(body), params())
    expect(res.status).toBe(400)
    expect(calls.assets).toBeUndefined()
  })

  it('aflossen zonder huishouden: alleen eigen schulden, gecontroleerd vóór de write', async () => {
    const cfg = { stand: 'vast_moment', triggerDate: '2040-01-01', payoffDebtIds: [DEBT, DEBT] }
    const res = await PATCH(req({ sale_config: cfg }), params())
    expect(res.status).toBe(200)
    expect(calls.debts.eq).toEqual([['user_id', USER]])
    expect(calls.debts.or).toBeUndefined()
    // Dubbele id's tellen één keer (anders faalt de lengtevergelijking vals).
    expect(calls.debts.in).toEqual([['id', [DEBT]]])
  })

  it('aflossen in een huishouden: eigen OF gedeelde schulden van dat huishouden — gelijk aan het formulier', async () => {
    memberResult = { data: { household_id: HOUSEHOLD }, error: null }
    const res = await PATCH(req({ sale_config: { stand: 'wanneer_nodig', payoffDebtIds: [DEBT] } }), params())
    expect(res.status).toBe(200)
    expect(calls.household_members.eq).toEqual([['user_id', USER]])
    expect(calls.debts.or).toEqual([[`user_id.eq.${USER},and(ownership.eq.shared,household_id.eq.${HOUSEHOLD})`]])
    expect(calls.debts.eq).toBeUndefined()
  })

  it('aflossen met een schuld buiten die scope → 400, geen write', async () => {
    debtResult = { data: [], error: null }
    const res = await PATCH(
      req({ sale_config: { stand: 'wanneer_nodig', payoffDebtIds: [DEBT] } }),
      params(),
    )
    expect(res.status).toBe(400)
    expect(calls.assets).toBeUndefined()
  })

  it('DB-fout: generieke 500 zonder interne tekst', async () => {
    assetResult = { data: null, error: { message: 'pg: permission denied for secret_table' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await PATCH(req({ sale_config: { stand: 'niet_verkopen' } }), params())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    spy.mockRestore()
  })
})
