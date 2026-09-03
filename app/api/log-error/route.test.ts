import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/log-error — de dev/prod-guard op het CLIENT-schrijfpad.
 *
 * Aanleiding: een lokale `next dev` praat vaak tegen de productie-Supabase.
 * Browserfouten uit die sessie (localhost-chunks, Turbopack/HMR-artefacten)
 * landden ongefilterd in `error_logs` en ondermijnden /beheer/errors als
 * productiesignaal — bron van twee valse P2-bugkaarten (2 sep 2026).
 *
 * De guard staat hier SERVER-side omdat de browser zijn eigen omgeving niet
 * geloofwaardig kan melden. Wat hier vastligt:
 *
 *  1. productie én preview persisteren — de foutinbox mag nooit blind worden;
 *  2. een aantoonbaar lokale omgeving persisteert niet, maar antwoordt wél
 *     netjes 200 (de reporter is best-effort en mag nooit gaan retryen);
 *  3. de bestaande 401/400-voorwaarden blijven ongewijzigd en gaan vóór de guard.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { POST } from './route'

function makeSupabase(user: { id: string } | null) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert })
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user } }) },
      from,
    },
    from,
    insert,
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID = { message: 'boom', context: 'window.onerror', url: '/overzicht' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  mockCreateClient.mockReset()
})

describe('POST /api/log-error', () => {
  it('persisteert in productie', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { supabase, from, insert } = makeSupabase({ id: 'u1' })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(request(VALID))

    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledWith('error_logs')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', message: 'boom' })
  })

  it('persisteert ook op een preview-deploy', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { supabase, insert } = makeSupabase({ id: 'u1' })
    mockCreateClient.mockResolvedValue(supabase)

    await POST(request(VALID))

    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('persisteert NIET vanuit een lokale ontwikkelomgeving, maar antwoordt wel 200', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { supabase, from, insert } = makeSupabase({ id: 'u1' })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(request(VALID))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, persisted: false })
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('blijft 401 voor een uitgelogde melder', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { supabase, insert } = makeSupabase(null)
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(request(VALID))

    expect(res.status).toBe(401)
    expect(insert).not.toHaveBeenCalled()
  })

  it('blijft 400 zonder message', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { supabase, insert } = makeSupabase({ id: 'u1' })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(request({ context: 'window.onerror' }))

    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })
})
