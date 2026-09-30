import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { forbidden, unauthorized } from '@/lib/api/respond'

/**
 * De v1-tak in de proxy (Krant 3A, ADR 0187):
 *   - `/api/v1/*` zonder Bearer → 401 met dezelfde envelope als `unauthorized()`;
 *   - met Bearer → door naar de handler (die verifieert echt);
 *   - mutatie met Origin → 403 (envelope van `forbidden()`); lezen met Origin mag;
 *   - géén cookie-client, dus geen cookie-refresh, onder `/api/v1/`;
 *   - andere paden ongewijzigd: nog steeds de cookie-client, en een Bearer-header
 *     opent daar niets.
 */

const mockCreateServerClient = vi.fn()
vi.mock('@supabase/ssr', () => ({ createServerClient: (...a: unknown[]) => mockCreateServerClient(...a) }))

import { isV1Path, updateSession, v1Poort } from './proxy'

const BEARER = { authorization: 'Bearer aaa.bbb.ccc' }

function req(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(`https://x.test${path}`, { method, headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateServerClient.mockReturnValue({ auth: { getClaims: vi.fn(async () => ({ data: null })) } })
})

describe('isV1Path', () => {
  it('matcht /api/v1 en alles eronder, niets anders', () => {
    expect(isV1Path('/api/v1')).toBe(true)
    expect(isV1Path('/api/v1/krant/config')).toBe(true)
    expect(isV1Path('/api/v10/x')).toBe(false)
    expect(isV1Path('/api/news')).toBe(false)
    expect(isV1Path('/api/krant/tijdlijn')).toBe(false)
  })
})

describe('v1Poort', () => {
  it('zonder Authorization → 401, envelope gelijk aan unauthorized()', async () => {
    const res = v1Poort(req('/api/v1/krant/config'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(await unauthorized().json())
  })

  it('met een ander schema (Basic) of alleen een cookie → 401', () => {
    expect(v1Poort(req('/api/v1/krant/config', { authorization: 'Basic dXNlcjpwYXNz' })).status).toBe(401)
    expect(v1Poort(req('/api/v1/krant/config', { cookie: 'sb-x-auth-token=abc' })).status).toBe(401)
  })

  it('met Bearer → door (NextResponse.next), zonder CORS-headers', () => {
    const res = v1Poort(req('/api/v1/krant/config', BEARER))
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s met Origin → 403, envelope gelijk aan forbidden()', async (method) => {
    const res = v1Poort(req('/api/v1/krant/feedback', { ...BEARER, origin: 'https://evil.test' }, method))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(await forbidden().json())
  })

  it('een mutatie zonder Origin gaat door', () => {
    const res = v1Poort(req('/api/v1/krant/feedback', BEARER, 'POST'))
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('GET met Origin gaat door (lezen is geen CSRF-vector zonder cookies)', () => {
    const res = v1Poort(req('/api/v1/krant/config', { ...BEARER, origin: 'https://x.test' }))
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('een preflight (OPTIONS) zonder token krijgt 401 en geen Allow-headers', () => {
    const res = v1Poort(req('/api/v1/krant/profiel', { origin: 'https://evil.test', 'access-control-request-method': 'PUT' }, 'OPTIONS'))
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('updateSession', () => {
  it('onder /api/v1/ wordt de cookie-client nooit gemaakt (geen cookie-refresh)', async () => {
    const zonder = await updateSession(req('/api/v1/krant/config', { cookie: 'sb-x-auth-token=abc' }))
    const met = await updateSession(req('/api/v1/krant/config', BEARER))
    expect(zonder.status).toBe(401)
    expect(met.headers.get('x-middleware-next')).toBe('1')
    expect(mockCreateServerClient).not.toHaveBeenCalled()
  })

  it('andere API-paden: ongewijzigd de cookie-client, en een Bearer opent daar niets', async () => {
    const res = await updateSession(req('/api/news', BEARER))
    expect(mockCreateServerClient).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', sessionExpired: false })
  })
})
