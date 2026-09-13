import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/plan-review/editor-context (TPR-15) — de snapshot voor de inline editors.
 *
 * Invarianten: (a) 401 zonder gebruiker, zonder een kernel-run te starten; (b) de
 * snapshot is client-veilig: geen partnerblok, geen `*_encrypted`/`*_hash`; (c) zonder
 * run geen fout maar `snapshot: null`; (d) een run-fout geeft de generieke envelope.
 */

let user: { id: string } | null
let shared: unknown
let runFout: Error | null
const runAanroepen = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve({}) }))
vi.mock('@/lib/supabase/cached-user', () => ({ getCachedUser: () => Promise.resolve(user) }))
vi.mock('@/lib/fire-target-shared', () => ({
  computeHorizonFireSim: () => {
    runAanroepen()
    return runFout ? Promise.reject(runFout) : Promise.resolve(shared)
  },
}))

vi.mock('@/lib/horizon/raw-data-loader', () => ({
  loadHorizonRaw: () =>
    Promise.resolve({
      rawProfile: { pot_rules: { surplus_group: 'beleggingen' }, full_name: 'Voor Naam' },
      assets: [{ asset_type: 'savings', current_value: 1000, is_active: true }],
      unlinkedCash: 250,
    }),
}))

import { GET } from './route'

const FIRE_PLAN = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

beforeEach(() => {
  user = { id: 'u1' }
  runFout = null
  runAanroepen.mockClear()
  shared = {
    rawContext: {
      profile: { id: 'u1' },
      assets: [{ id: 'a1', current_value: 10, account_number_encrypted: 'CIPHER', account_number_hash: 'IDX' }],
      debts: [],
      lifeEvents: [],
      yearlyExpenses: 1,
      partner: { netMonthlyIncome: 3000 },
    },
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: { strategy: 'fixed' },
    firePlan: FIRE_PLAN,
    aowAgeInt: 68,
    aowAgeFractional: 67.5,
  }
})

describe('GET /api/plan-review/editor-context', () => {
  it('401 zonder gebruiker, en draait dan geen kernel-run', async () => {
    user = null
    const res = await GET()
    expect(res.status).toBe(401)
    expect(runAanroepen).not.toHaveBeenCalled()
  })

  it('levert een client-veilige snapshot plus het plan', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.firePlan).toEqual(FIRE_PLAN)
    expect(body.snapshot.aowFractional).toBe(67.5)
    expect(body.snapshot.rawContext.partner).toBeUndefined()
    const tekst = JSON.stringify(body)
    expect(tekst).not.toMatch(/CIPHER|IDX|_encrypted|_hash|netMonthlyIncome|Voor Naam/)
    // Stap 5: dezelfde lezingen als /toekomst/voorkeuren.
    expect(body.potRules.surplusGroup).toBe('beleggingen')
    expect(body.potBalances.spaargeld).toBe(1250)
  })

  it('zonder run: snapshot null, geen fout', async () => {
    shared = null
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.snapshot).toBeNull()
    expect(body.firePlan).toBeNull()
    // De pot-regels en saldi hangen niet aan de kernel-run.
    expect(body.potRules.surplusGroup).toBe('beleggingen')
  })

  it('run-fout: generieke 500 zonder interne tekst', async () => {
    runFout = new Error('pg: relation secret_table does not exist')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    spy.mockRestore()
  })
})
