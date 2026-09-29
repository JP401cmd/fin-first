import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { maakNepClient, type NepRij } from '@/lib/krant/nep-client.fixture'
import { NEP_JWT, maakNepJwt } from './bearer.fixture'

/**
 * vereisBearer (Krant 3A, ADR 0187): het token wordt een ANON-client met de
 * token als header — nooit service-role, nooit cookies.
 *   - ontbrekend / "Basic …" / geen JWS / alleen een cookie → 401, zonder client;
 *   - onzin-tokens (header of payload geen JSON-object, alg buiten de set)
 *     → 401 vóór auth-js, zonder log (auth-js zou daarop GOOIEN → 500 + error_logs);
 *   - lezen verifieert met getClaims(jwt), muteren met getUser(jwt);
 *   - verlopen/ingetrokken, anon-rol of anonieme login → 401;
 *   - onbereikbare JWKS/auth (AuthRetryableFetchError, geretourneerd) → 503;
 *   - een onverwachte throw ná de voorvalidatie → 500;
 *   - module 'nieuws' ontbreekt, geen profielrij, of geblokkeerd → 403;
 *   - mutatie met Origin → 403 vóór er iets gebeurt.
 */

const mockCreateClient = vi.fn()
vi.mock('@supabase/supabase-js', async (importActual) => ({
  ...(await importActual<typeof import('@supabase/supabase-js')>()),
  createClient: (...a: unknown[]) => mockCreateClient(...a),
}))

import { leesBearerToken, vereisBearer } from './bearer'

const JWT = NEP_JWT
const mockGetClaims = vi.fn()
const mockGetUser = vi.fn()
let profielen: NepRij[]
let nep: ReturnType<typeof maakNepClient>

function req(headers: Record<string, string> = {}, method = 'GET') {
  return new Request('https://x.test/api/v1/krant/config', { method, headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  profielen = [
    { id: 'user-a', active_modules: ['nieuws'], blocked_at: null },
    // Echte module-id's: een onbekende waarde valt in resolveActiveModules terug op álle modules.
    { id: 'user-b', active_modules: ['budgetteren', 'vermogensregistratie'], blocked_at: null },
    { id: 'user-x', active_modules: ['nieuws'], blocked_at: '2026-09-20T10:00:00+00:00' },
  ]
  nep = maakNepClient({ profiles: profielen })
  mockCreateClient.mockImplementation(() => ({ ...nep.client, auth: { getClaims: mockGetClaims, getUser: mockGetUser } }))
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-a', role: 'authenticated' } }, error: null })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a', role: 'authenticated', is_anonymous: false } }, error: null })
})

describe('leesBearerToken', () => {
  it('accepteert een Bearer met een leesbare JWT; scheme hoofdletterongevoelig', () => {
    expect(leesBearerToken(`Bearer ${JWT}`)).toBe(JWT)
    expect(leesBearerToken(`bearer ${JWT}`)).toBe(JWT)
    for (const alg of ['ES256', 'RS256', 'HS256']) expect(leesBearerToken(`Bearer ${maakNepJwt({ alg })}`)).not.toBeNull()
  })

  it('weigert een andere header of vorm', () => {
    expect(leesBearerToken(`Basic ${JWT}`)).toBeNull()
    expect(leesBearerToken('Bearer niet-een-jwt')).toBeNull()
    expect(leesBearerToken(`Bearer ${JWT} extra`)).toBeNull()
    expect(leesBearerToken(null)).toBeNull()
    expect(leesBearerToken(`Bearer ${'a'.repeat(5000)}.b.c`)).toBeNull()
  })

  it('weigert onzin die auth-js zou laten gooien', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
    const payload = b64(JSON.stringify({ sub: 'x' }))
    expect(leesBearerToken('Bearer aaaa.bbbb.cccc')).toBeNull()
    expect(leesBearerToken(`Bearer ${b64('geen json')}.${payload}.c2ln`)).toBeNull()
    expect(leesBearerToken(`Bearer ${maakNepJwt({ alg: 'PS256' })}`)).toBeNull()
    expect(leesBearerToken(`Bearer ${maakNepJwt({ alg: 'none' })}`)).toBeNull()
    expect(leesBearerToken(`Bearer ${maakNepJwt({ typ: 'JWT' })}`)).toBeNull()
    expect(leesBearerToken(`Bearer ${b64('[1,2]')}.${payload}.c2ln`)).toBeNull()
    expect(leesBearerToken(`Bearer ${b64(JSON.stringify({ alg: 'ES256' }))}.${b64('null')}.c2ln`)).toBeNull()
    expect(leesBearerToken(`Bearer ${b64(JSON.stringify({ alg: 'ES256' }))}.${b64('"tekst"')}.c2ln`)).toBeNull()
  })
})

describe('401 zonder bruikbare token — geen client, geen log', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
  it.each([
    ['ontbrekend', {}],
    ['verkeerd schema (Basic)', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['geen JWS', { authorization: 'Bearer abc' }],
    ['cookie aanwezig maar geen Bearer', { cookie: 'sb-xyz-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJhLmIuYyJ9' }],
    ['onzin aaaa.bbbb.cccc', { authorization: 'Bearer aaaa.bbbb.cccc' }],
    ['header geen JSON', { authorization: `Bearer ${b64('<script>')}.${b64('{}')}.c2ln` }],
    ['alg PS256', { authorization: `Bearer ${maakNepJwt({ alg: 'PS256' })}` }],
  ])('%s', async (_naam, headers) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await vereisBearer(req(headers), { muteren: false })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.response.status).toBe(401)
    expect(await r.response.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('de client', () => {
  it('is een anon-client met de token als header, zonder sessie-opslag of refresh', async () => {
    await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    const [url, key, opts] = mockCreateClient.mock.calls[0]
    expect(url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
    expect(key).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    expect(opts).toEqual({
      global: { headers: { Authorization: `Bearer ${JWT}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  })
})

describe('verificatie per modus', () => {
  it('lezen: getClaims(jwt), géén getUser', async () => {
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(r.ok && r.userId).toBe('user-a')
    expect(mockGetClaims).toHaveBeenCalledWith(JWT)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('muteren: getUser(jwt), géén getClaims', async () => {
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }, 'PUT'), { muteren: true })
    expect(r.ok && r.userId).toBe('user-a')
    expect(mockGetUser).toHaveBeenCalledWith(JWT)
    expect(mockGetClaims).not.toHaveBeenCalled()
  })

  it('verlopen token (getClaims geeft een AuthError) → 401', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: { name: 'AuthApiError', message: 'JWT expired', __isAuthError: true } })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(401)
  })

  it('ingetrokken sessie (getUser faalt) → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', message: 'session not found', __isAuthError: true } })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }, 'POST'), { muteren: true })
    expect(!r.ok && r.response.status).toBe(401)
  })

  it('de anon-key als token (rol anon, geen sub) → 401', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { role: 'anon' } }, error: null })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(401)
  })

  it('een anonieme login → 401 (lezen én muteren)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-a', role: 'authenticated', is_anonymous: true } }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a', role: 'authenticated', is_anonymous: true } }, error: null })
    const lezen = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    const muteren = await vereisBearer(req({ authorization: `Bearer ${JWT}` }, 'PUT'), { muteren: true })
    expect(!lezen.ok && lezen.response.status).toBe(401)
    expect(!muteren.ok && muteren.response.status).toBe(401)
  })

  it.each([
    ['lezen (getClaims)', false],
    ['muteren (getUser)', true],
  ])('onbereikbare JWKS/auth bij %s (geretourneerde AuthRetryableFetchError) → 503, geen details', async (_naam, muteren) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fout = new AuthRetryableFetchError('fetch failed', 0)
    mockGetClaims.mockResolvedValue({ data: null, error: fout })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: fout })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }, muteren ? 'PUT' : 'GET'), { muteren })
    expect(!r.ok && r.response.status).toBe(503)
    if (!r.ok) {
      const body = await r.response.json()
      expect(body.code).toBe('server_error')
      expect(JSON.stringify(body)).not.toContain('fetch failed')
    }
    spy.mockRestore()
  })

  it('een onverwachte throw ná de voorvalidatie → generieke 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetClaims.mockRejectedValue(new Error('onverwacht intern'))
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(500)
    if (!r.ok) expect(JSON.stringify(await r.response.json())).not.toContain('intern')
    spy.mockRestore()
  })
})

describe('modulepoort', () => {
  it('leest de EIGEN profielrij (eq id) met modules en blokkade, en laat een lezer met nieuws door', async () => {
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(r.ok).toBe(true)
    const q = nep.queriesOp('profiles')[0]
    expect(q.stappen).toContainEqual({ m: 'select', args: ['active_modules, blocked_at'] })
    expect(q.stappen).toContainEqual({ m: 'eq', args: ['id', 'user-a'] })
  })

  it('module nieuws ontbreekt → 403', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-b', role: 'authenticated' } }, error: null })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(403)
    if (!r.ok) expect(await r.response.json()).toEqual({ error: 'Geen toegang', code: 'forbidden' })
  })

  it('geblokkeerd account (blocked_at gevuld) → 403, ook met module nieuws', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-x', role: 'authenticated' } }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-x', role: 'authenticated', is_anonymous: false } }, error: null })
    const lezen = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    const muteren = await vereisBearer(req({ authorization: `Bearer ${JWT}` }, 'PUT'), { muteren: true })
    expect(!lezen.ok && lezen.response.status).toBe(403)
    expect(!muteren.ok && muteren.response.status).toBe(403)
  })

  it('geen profielrij → 403 (fail-closed, anders dan de shell)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-zonder-profiel', role: 'authenticated' } }, error: null })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(403)
  })

  it('active_modules null = alle modules (resolveActiveModules) → door', async () => {
    profielen[0].active_modules = null
    nep = maakNepClient({ profiles: profielen })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(r.ok).toBe(true)
  })

  it('een DB-fout op profiles → generieke 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    nep = maakNepClient({ profiles: profielen }, { fouten: { 'profiles:select': 'relation kapot' } })
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}` }), { muteren: false })
    expect(!r.ok && r.response.status).toBe(500)
    if (!r.ok) expect(JSON.stringify(await r.response.json())).not.toContain('kapot')
    spy.mockRestore()
  })
})

describe('Origin op een mutatie', () => {
  it('→ 403 vóór verificatie of client', async () => {
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}`, origin: 'https://evil.test' }, 'POST'), { muteren: true })
    expect(!r.ok && r.response.status).toBe(403)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('bij lezen is Origin geen reden om te weigeren', async () => {
    const r = await vereisBearer(req({ authorization: `Bearer ${JWT}`, origin: 'https://x.test' }), { muteren: false })
    expect(r.ok).toBe(true)
  })
})
