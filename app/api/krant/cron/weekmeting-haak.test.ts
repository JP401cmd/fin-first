import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * B41: de weekcron legt na de editierun de weekmeting vast. Apart van
 * route.test.ts gehouden: dit bewaakt alleen de haak (wel aangeroepen, met
 * dezelfde service en hetzelfde moment, ná de editie-job_run; niet bij een
 * geweigerde aanroep).
 */

const volgorde: string[] = []
const mockLeg = vi.fn(async () => {
  volgorde.push('weekmeting')
  return null
})
const mockRecordJobRun = vi.fn(async (_s: unknown, p: { job: string }) => {
  volgorde.push(`job:${p.job}`)
})

vi.mock('@/lib/krant/weekmeting-run', () => ({ legWeekmetingVast: (...a: unknown[]) => mockLeg(...(a as [])) }))
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...(a as [unknown, { job: string }])) }))
vi.mock('@/lib/krant/editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [], ongeldig: 0 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))
vi.mock('@/lib/krant/editie-run', () => ({ runEditieVoor: vi.fn() }))
vi.mock('@/lib/krant/editie-schrijver', () => ({ geldendeEditieId: vi.fn(async () => null), ruimSchaduwOp: vi.fn(async () => 0) }))

const service = {
  from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
}
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => service }))

import { GET } from './route'

beforeEach(() => {
  volgorde.length = 0
  mockLeg.mockClear()
  process.env.CRON_SECRET = 'geheim'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
})

describe('weekcron → weekmeting', () => {
  it('meet ná de editie-job_run, met de service-client en het moment van de run', async () => {
    const res = await GET(new Request('http://localhost/api/krant/cron', { headers: { authorization: 'Bearer geheim' } }))
    expect(res.status).toBe(200)
    expect(volgorde).toEqual(['job:krant-editie', 'weekmeting'])
    const [client, moment] = mockLeg.mock.calls[0] as unknown as [unknown, Date]
    expect(client).toBe(service)
    expect(moment).toBeInstanceOf(Date)
  })

  it('geen meting bij een fout secret', async () => {
    const res = await GET(new Request('http://localhost/api/krant/cron', { headers: { authorization: 'Bearer fout' } }))
    expect(res.status).toBe(401)
    expect(mockLeg).not.toHaveBeenCalled()
  })
})
