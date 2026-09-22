import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/krant/cron (ADR 0173):
 *   - auth-matrix (fail-closed): prod zonder secret → 500; fout secret → 401;
 *     dev zonder secret → ok; correct secret → ok — zonder job_runs-write vóór de auth;
 *   - moduleselectie: alleen profielen met de module nieuws (null = alle modules);
 *   - idempotentie per week: een geldende schaduweditie → overgeslagen;
 *   - summary: tellingen per profieltype en de overlap van testaccounts, geen inhoud;
 *   - een falende gebruiker telt als fout en stopt de run niet.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))
vi.mock('@/lib/krant/editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [{ id: 'a1' }, { id: 'a2' }], ongeldig: 1 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))
const mockRun = vi.fn()
vi.mock('@/lib/krant/editie-run', () => ({ runEditieVoor: (...a: unknown[]) => mockRun(...a) }))
const mockGeldende = vi.fn()
const mockOpruimen = vi.fn()
vi.mock('@/lib/krant/editie-schrijver', () => ({
  geldendeEditieId: (...a: unknown[]) => mockGeldende(...a),
  ruimSchaduwOp: (...a: unknown[]) => mockOpruimen(...a),
}))

let profielen: Array<Record<string, unknown>>
let profielenFout: { message: string } | null

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => (table === 'profiles' ? { data: profielen, error: profielenFout } : { data: [], error: null }),
      }),
    }),
  }),
}))

import { GET } from './route'

function req(secret?: string): Request {
  return new Request(secret ? `https://x.test/api/krant/cron?secret=${secret}` : 'https://x.test/api/krant/cron')
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  profielenFout = null
  profielen = [
    { id: 'u-alle', is_demo_user: false, active_modules: null },
    { id: 'u-nieuws', is_demo_user: false, active_modules: ['nieuws', 'budgetteren'] },
    { id: 'u-zonder', is_demo_user: false, active_modules: ['budgetteren'] },
    { id: 'u-demo', is_demo_user: true, active_modules: null },
  ]
  mockGeldende.mockResolvedValue(null)
  mockOpruimen.mockResolvedValue(0)
  mockRun.mockImplementation(async (_s: unknown, invoer: { userId: string; meetOverlap?: boolean }) => ({
    editieId: `e-${invoer.userId}`,
    profielType: invoer.userId === 'u-demo' ? '35-49·koop·partner' : 'onder-35·wonen-onbekend·alleen',
    leeg: invoer.userId === 'u-alle',
    items: invoer.userId === 'u-alle' ? 0 : 3,
    overlap: invoer.meetOverlap ? { beide: 2, alleenMatcher: 1, alleenModel: 4 } : null,
  }))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('cron auth-matrix (fail-closed, geen job_runs vóór de auth)', () => {
  it('productie zonder CRON_SECRET → 500', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(500)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })

  it('fout secret → 401 (envelope, geen "Niet ingelogd")', async () => {
    const res = await GET(req('verkeerd'))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('Ongeldig cron-secret')
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })

  it('dev zonder secret → 200', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(200)
  })

  it('Bearer-header → 200', async () => {
    const res = await GET(new Request('https://x.test/api/krant/cron', { headers: { authorization: 'Bearer cron-secret' } }))
    expect(res.status).toBe(200)
  })

  it('zonder service-role-key → 500, geen run', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect((await GET(req('cron-secret'))).status).toBe(500)
    expect(mockRun).not.toHaveBeenCalled()
  })
})

describe('de run', () => {
  it('bouwt voor elke lezer met de module nieuws (null = alle modules), niet voor wie de module uit heeft', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const ids = mockRun.mock.calls.map((c) => (c[1] as { userId: string }).userId).sort()
    expect(ids).toEqual(['u-alle', 'u-demo', 'u-nieuws'])
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ gebruikers: 3, edities: 3, leeg: 1, overgeslagen: 0, fouten: 0, kandidaten: 2, kandidatenOngeldig: 1, tijdBudgetOp: false })
    expect(mockRecordJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ job: 'krant-editie', status: 'success', summary }))
  })

  it('meet alleen op testaccounts; echte gebruikers per profieltype k=5-onderdrukt, testaccounts ongedrukt — geen inhoud, geen id', async () => {
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: { perProfieltype: Record<string, unknown>; testaccounts: Record<string, unknown> } }
    expect(mockRun.mock.calls.map((c) => [(c[1] as { userId: string }).userId, (c[1] as { meetOverlap?: boolean }).meetOverlap]).sort()).toEqual([
      ['u-alle', false],
      ['u-demo', true],
      ['u-nieuws', false],
    ])
    // Twee echte gebruikers van één type: totaal onder k → 'klein', nooit het getal.
    expect(summary.perProfieltype).toEqual({ 'onder-35·wonen-onbekend·alleen': { edities: 'klein', leeg: 'klein' } })
    // De persona is fictief: ongedrukt, dat is de K1-meting per profieltype.
    expect(summary.testaccounts).toEqual({
      gemeten: 1,
      overlapBeide: 2,
      alleenMatcher: 1,
      alleenModel: 4,
      perProfieltype: { '35-49·koop·partner': { edities: 1, leeg: 0 } },
    })
    const tekst = JSON.stringify(summary)
    expect(tekst).not.toMatch(/u-alle|u-demo|u-nieuws|tekst|titel/)
  })

  it('vanaf k echte gebruikers in een profieltype wordt het aantal zichtbaar; een klein aantal lege edities blijft dicht', async () => {
    profielen = Array.from({ length: 6 }, (_, i) => ({ id: `u-${i}`, is_demo_user: false, active_modules: null }))
    mockRun.mockImplementation(async (_s: unknown, invoer: { userId: string }) => ({
      editieId: `e-${invoer.userId}`,
      profielType: '35-49·koop·partner',
      leeg: invoer.userId === 'u-0',
      items: invoer.userId === 'u-0' ? 0 : 2,
      overlap: null,
    }))
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ edities: 6, leeg: 1, perProfieltype: { '35-49·koop·partner': { edities: 6, leeg: 'klein' } } })
  })

  it('idempotent per week: een geldende schaduweditie wordt overgeslagen, de rest gebouwd', async () => {
    mockGeldende.mockImplementation(async (_s: unknown, userId: string) => (userId === 'u-nieuws' ? 'bestaat' : null))
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ gebruikers: 3, edities: 2, overgeslagen: 1 })
    expect(mockRun.mock.calls.map((c) => (c[1] as { userId: string }).userId)).not.toContain('u-nieuws')
  })

  it('een falende gebruiker telt als fout en stopt de run niet; de job blijft success met een fouttekst', async () => {
    mockRun.mockImplementationOnce(async () => {
      throw new Error('kapot')
    })
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ fouten: 1, edities: 2 })
    expect(mockRecordJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'success', error: '1 gebruiker(s) faalden' }))
  })

  it('falen de profielen te lezen, dan een error-run en 500 zonder rauwe foutmelding', async () => {
    profielenFout = { message: 'db kapot' }
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db kapot')
    expect(mockRecordJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ job: 'krant-editie', status: 'error' }))
    expect(mockRun).not.toHaveBeenCalled()
  })
})
