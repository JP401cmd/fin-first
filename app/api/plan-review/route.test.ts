import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PUT /api/plan-review — de bevestigd-markering per review-stap (TPR-01, ADR 0142).
 *
 * Invarianten: (a) alleen de eigen rij (`.eq('id', <auth user>)`), (b) read-modify-
 * write houdt de andere stappen intact, (c) zod weigert onbekende stappen,
 * (d) een mislukte lezing schrijft NIETS (anders raakt een transiënte fout de hele
 * map kwijt), (e) 401 zonder gebruiker via de gedeelde envelope.
 */

type Row = Record<string, unknown>

interface FakeDb {
  row: Row
  updates: Array<{ payload: Row; eqId: string | null }>
  readError: { message: string } | null
  user: { id: string } | null
}

let db: FakeDb

function makeSupabase() {
  function builder() {
    let pendingUpdate: Row | null = null
    let eqId: string | null = null
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.update = (payload: Row) => {
      pendingUpdate = payload
      return q
    }
    q.eq = (_col: string, value: string) => {
      eqId = value
      if (pendingUpdate) {
        db.updates.push({ payload: pendingUpdate, eqId })
        Object.assign(db.row, pendingUpdate)
        pendingUpdate = null
        return Promise.resolve({ error: null })
      }
      return q
    }
    q.single = () =>
      Promise.resolve(
        db.readError
          ? { data: null, error: db.readError }
          : { data: { plan_review_state: db.row.plan_review_state }, error: null },
      )
    return q
  }
  return { from: () => builder() }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(makeSupabase()),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: () => Promise.resolve(db.user),
}))

// GET — de canonieke run ontbreekt hier bewust (geen geboortedatum-scenario): de stap
// moet dan nog steeds bouwen, zonder vergelijking. De rauwe laag levert een eigen én
// een partner-woning (huishoud-gedeelde assets-policy).
let rawAssets: Array<Record<string, unknown>> = []
vi.mock('@/lib/fire-target-shared', () => ({
  computeHorizonFireSim: () => Promise.resolve(null),
}))
vi.mock('@/lib/horizon/raw-data-loader', () => ({
  loadHorizonRaw: () =>
    Promise.resolve({
      assets: rawAssets,
      events: [{ event_type: 'aow', is_active: true, metadata: {} }],
      rawProfile: { housing_strategy_config: null, withdrawal_profile_config: null, pot_rules: null },
      firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
    }),
}))

// TPR-15 — de eigen AOW/werk/pensioen-rijen (expliciete user_id-lezing). De rauwe laag
// hierboven levert een AOW-event dat van de partner kan zijn; dat telt niet.
let eigenEvents: Array<Record<string, unknown>> = []
const eigenLezingen: string[] = []
vi.mock('@/lib/plan-review/eigen-strategie-events', () => ({
  loadEigenStrategieEvents: (_s: unknown, userId: string) => {
    eigenLezingen.push(userId)
    return Promise.resolve(eigenEvents)
  },
}))

import { GET, PUT } from './route'

const get = (stap: string) => GET(new NextRequest(`http://localhost/api/plan-review?stap=${stap}`))

const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/plan-review', { method: 'PUT', body: JSON.stringify(body) }))

const M = { bevestigd_op: '2026-09-01T00:00:00.000Z', bron: 'review' }

beforeEach(() => {
  db = {
    row: { plan_review_state: { plan: M } },
    updates: [],
    readError: null,
    user: { id: 'u1' },
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PUT /api/plan-review', () => {
  it('zet een markering op de eigen rij en laat de andere stappen staan', async () => {
    const res = await put({ stap: 'uitgaven', bevestigd: true })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; plan_review_state: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.plan_review_state.plan).toEqual(M)
    expect(body.plan_review_state.uitgaven).toMatchObject({ bron: 'review' })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].eqId).toBe('u1')
  })

  it('wist een markering met bevestigd: false', async () => {
    const res = await put({ stap: 'plan', bevestigd: false })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plan_review_state: Record<string, unknown> }
    expect(body.plan_review_state).toEqual({})
  })

  it('weigert een onbekende stap met een client-veilige 400 (zod)', async () => {
    const res = await put({ stap: 'inflatie', bevestigd: true })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code?: string }
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('validation_error')
    expect(db.updates).toHaveLength(0)
  })

  it('schrijft NIETS wanneer de lezing van de eigen rij faalt', async () => {
    db.readError = { message: 'boom' }
    const res = await put({ stap: 'potten', bevestigd: true })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).not.toContain('boom')
    expect(db.updates).toHaveLength(0)
  })

  it('401 zonder gebruiker, via de gedeelde envelope', async () => {
    db.user = null
    const res = await put({ stap: 'plan', bevestigd: true })
    expect(res.status).toBe(401)
    expect(db.updates).toHaveLength(0)
  })
})

describe('GET /api/plan-review', () => {
  beforeEach(() => {
    rawAssets = [
      { user_id: 'partner', asset_type: 'eigen_huis', is_active: true, sale_config: null, value_encrypted: 'x' },
      { user_id: 'u1', asset_type: 'savings', is_active: true, sale_config: null },
    ]
  })

  it('401 zonder gebruiker', async () => {
    db.user = null
    const res = await get('plan')
    expect(res.status).toBe(401)
  })

  it('400 op een onbekende stap', async () => {
    const res = await get('inflatie')
    expect(res.status).toBe(400)
  })

  it('het huis van de partner opent de woningstap van deze gebruiker niet (eigen bezittingen)', async () => {
    const res = await get('woning')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      facts: { hasEigenHuis: boolean; hasNietLiquideBezit: boolean }
      progress: { stappen: Array<{ stap: string; status: string }> }
      overzicht: { keuzes: unknown[] }
    }
    expect(body.facts.hasEigenHuis).toBe(false)
    expect(body.facts.hasNietLiquideBezit).toBe(false)
    expect(body.progress.stappen.find((s) => s.stap === 'woning')?.status).toBe('nvt')
    expect(body.overzicht.keuzes).toEqual([])
  })

  it('een AOW-event dat niet van de gebruiker is, zet de AOW-stap niet dicht (eigen gebeurtenissen)', async () => {
    eigenEvents = []
    const res = await get('inkomsten')
    const body = (await res.json()) as {
      facts: { hasAowEvent: boolean }
      overzicht: { blokkade: string | null }
    }
    expect(eigenLezingen.at(-1)).toBe('u1')
    expect(body.facts.hasAowEvent).toBe(false)
    expect(body.overzicht.blokkade).not.toBeNull()

    eigenEvents = [
      { id: 'geheim-event-id', user_id: 'u1', event_type: 'aow', is_active: true, metadata: { bron: 'geheim-meta' } },
    ]
    const res2 = await get('inkomsten')
    const tekst = await res2.text()
    expect((JSON.parse(tekst) as { facts: { hasAowEvent: boolean } }).facts.hasAowEvent).toBe(true)
    // Alleen afgeleide weergave: geen rij-id, user_id of metadata van gebeurtenissen.
    expect(tekst).not.toContain('geheim-event-id')
    expect(tekst).not.toContain('geheim-meta')
    expect(tekst).not.toContain('user_id')
  })

  it('levert alleen afgeleide weergave — geen rauwe rijen of versleutelde kolommen', async () => {
    rawAssets = [{ user_id: 'u1', asset_type: 'eigen_huis', is_active: true, sale_config: null, value_encrypted: 'geheim' }]
    const res = await get('woning')
    const tekst = await res.text()
    expect(tekst).not.toContain('geheim')
    expect(tekst).not.toContain('_encrypted')
    expect(tekst).not.toContain('user_id')
  })

  it('zonder kernel-run bouwt de stap toch, met "nog niet te bepalen" en zonder vergelijking', async () => {
    const res = await get('plan')
    const body = (await res.json()) as { overzicht: { effect: string[]; vergelijking: unknown[] } }
    expect(body.overzicht.effect[0]).toContain('nog niet te bepalen')
    expect(body.overzicht.vergelijking).toEqual([])
  })

  it('500 zonder details wanneer de markering niet te lezen is', async () => {
    db.readError = { message: 'boom' }
    const res = await get('plan')
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('boom')
  })
})
