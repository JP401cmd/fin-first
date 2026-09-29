import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NEP_JWT } from '@/lib/supabase/bearer.fixture'
import { maakNepClient } from '@/lib/krant/nep-client.fixture'
import { KRANT_V1_CONTRACT_VERSIE, KRANT_V1_MIN_APP_VERSIE, configResponseSchema } from '@/lib/krant/contract'

/**
 * GET /api/v1/krant/config (Krant 3A, ADR 0187): ook config vraagt Bearer +
 * module nieuws (geen publiek pad onder /api/v1/); de respons volgt het contract.
 */

const mockCreateClient = vi.fn()
vi.mock('@supabase/supabase-js', async (importActual) => ({
  ...(await importActual<typeof import('@supabase/supabase-js')>()),
  createClient: (...a: unknown[]) => mockCreateClient(...a),
}))

import { GET } from './route'

const mockGetClaims = vi.fn()
const bearer = { authorization: `Bearer ${NEP_JWT}` }
const req = (headers: Record<string, string> = bearer) => new Request('https://x.test/api/v1/krant/config', { headers })

beforeEach(() => {
  vi.clearAllMocks()
  const nep = maakNepClient({
    profiles: [
      { id: 'user-a', active_modules: ['nieuws'] },
      { id: 'user-c', active_modules: ['budgetteren'] },
    ],
  })
  mockCreateClient.mockImplementation(() => ({ ...nep.client, auth: { getClaims: mockGetClaims, getUser: vi.fn() } }))
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-a', role: 'authenticated' } }, error: null })
})

describe('GET config', () => {
  it('401 zonder Bearer', async () => {
    expect((await GET(req({}))).status).toBe(401)
  })

  it('403 zonder module nieuws', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-c', role: 'authenticated' } }, error: null })
    expect((await GET(req())).status).toBe(403)
  })

  it('200 met contractversie en minimum-appversie volgens het contract', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(configResponseSchema.parse(await res.json())).toEqual({
      contractVersie: KRANT_V1_CONTRACT_VERSIE,
      minAppVersie: KRANT_V1_MIN_APP_VERSIE,
    })
  })
})
