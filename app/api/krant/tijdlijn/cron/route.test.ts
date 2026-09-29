import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/krant/tijdlijn/cron (Krant 1C):
 *   - auth-matrix (fail-closed), zonder job_runs-write vóór de auth;
 *   - alleen lezers met krant_variant 'tijdlijn', de module nieuws en afgeronde onboarding;
 *   - bèta-slot: zolang TIJDLIJN_BETA_OPEN false is, alleen superadmins;
 *   - summary = tellingen; een falende lezer stopt de run niet.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))
vi.mock('@/lib/krant/editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [{ id: 'a1' }], ongeldig: 0 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))
const mockVervers = vi.fn()
const mockRuim = vi.fn()
vi.mock('@/lib/krant/tijdlijn-run', () => ({
  ververs: (...a: unknown[]) => mockVervers(...a),
  ruimTijdlijnOp: (...a: unknown[]) => mockRuim(...a),
}))
const beta = { open: false }
vi.mock('@/lib/krant/tijdlijn-beta', () => ({
  inTijdlijnBeta: (rol: string | null) => beta.open || rol === 'superadmin',
}))

let varianten: Array<{ user_id: string }>
let profielen: Array<Record<string, unknown>>

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => (table === 'nieuwsprofiel' ? { data: varianten, error: null } : { data: [], error: null }),
        in: async () => (table === 'profiles' ? { data: profielen, error: null } : { data: [], error: null }),
      }),
    }),
  }),
}))

import { GET } from './route'

const req = (secret?: string) => new Request(secret ? `https://x.test/api/krant/tijdlijn/cron?secret=${secret}` : 'https://x.test/api/krant/tijdlijn/cron')
const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  beta.open = false
  varianten = [{ user_id: 'u-admin' }, { user_id: 'u-lezer' }, { user_id: 'u-zonder-nieuws' }, { user_id: 'u-onboarding' }]
  profielen = [
    { id: 'u-admin', role: 'superadmin', active_modules: null, onboarding_completed: true },
    { id: 'u-lezer', role: 'user', active_modules: ['nieuws'], onboarding_completed: true },
    { id: 'u-zonder-nieuws', role: 'superadmin', active_modules: ['budgetteren'], onboarding_completed: true },
    { id: 'u-onboarding', role: 'superadmin', active_modules: null, onboarding_completed: false },
  ]
  mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => ({ editieId: `e-${i.userId}`, profielType: 'x', leeg: false, items: 2 }))
  mockRuim.mockResolvedValue(1)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  process.env = { ...ORIG }
})

const gedraaid = () => mockVervers.mock.calls.map((c) => (c[1] as { userId: string }).userId)

describe('auth (fail-closed)', () => {
  it('productie zonder CRON_SECRET → 500, fout secret → 401; nooit een job_runs-write vóór de auth', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(500)
    process.env.CRON_SECRET = 'cron-secret'
    expect((await GET(req('verkeerd'))).status).toBe(401)
    expect(mockVervers).not.toHaveBeenCalled()
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })
})

describe('wie er ververst wordt', () => {
  it('bèta dicht: alleen de superadmin met module nieuws en afgeronde onboarding', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(gedraaid()).toEqual(['u-admin'])
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ lezers: 1, buitenBeta: 3, verversingen: 1, berichten: 2, opgeruimd: 1, fouten: 0 })
  })

  it('bèta open: ook de gewone lezer — maar nooit zonder module nieuws of onboarding', async () => {
    beta.open = true
    await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-lezer'])
  })

  it('niemand met de variant: geen kandidaten geladen, wel een success-run', async () => {
    varianten = []
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(mockVervers).not.toHaveBeenCalled()
    expect(mockRecordJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ job: 'krant-tijdlijn', status: 'success' }))
  })

  it('een 23505 (race met de knop op de unieke index) telt als overgeslagen, niet als fout', async () => {
    beta.open = true
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => {
      if (i.userId === 'u-lezer') throw new Error('[krant/editie-schrijver] items schrijven mislukt: duplicate key value violates unique constraint "krant_editie_items_tijdlijn_lezer_artikel_key"')
      return { editieId: 'e', profielType: 'x', leeg: false, items: 1 }
    })
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ overgeslagen: 1, fouten: 0, verversingen: 1 })
  })

  it('een falende lezer telt als fout en stopt de run niet; summary bevat geen inhoud', async () => {
    beta.open = true
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => {
      if (i.userId === 'u-lezer') throw new Error('kapot')
      return { editieId: 'e', profielType: 'x', leeg: true, items: 0 }
    })
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ fouten: 1, verversingen: 1, leeg: 1 })
    expect(JSON.stringify(summary)).not.toMatch(/u-admin|u-lezer|user_id/)
  })
})
