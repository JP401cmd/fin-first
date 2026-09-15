import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/activity/module — gebruik per app-deel (ADR 0147, fase 2).
 *
 * Vastgelegd:
 *   - 401 zonder sessie, en dan geen schrijfactie;
 *   - 400 op een onbekende module of een extra veld (strict) — geen route-log
 *     via een vrij veld;
 *   - de upsert schrijft uitsluitend user_id + module (de dag is een
 *     kolom-default) met ON CONFLICT DO NOTHING;
 *   - meten breekt nooit: een DB-fout of een throw geeft toch 200.
 */

const mockClaims = vi.fn()
const mockUpsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: (...a: unknown[]) => mockFrom(...a) })),
  getAuthClaims: (...args: unknown[]) => mockClaims(...args),
}))

import { POST } from './route'

const USER = 'user-1'

function req(body: unknown) {
  return new Request('http://localhost/api/activity/module', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockClaims.mockReset().mockResolvedValue({ sub: USER })
  mockUpsert.mockReset().mockResolvedValue({ data: null, error: null })
  mockFrom.mockReset().mockImplementation(() => ({ upsert: mockUpsert }))
})

describe('POST /api/activity/module', () => {
  it('401 zonder sessie, zonder schrijfactie', async () => {
    mockClaims.mockResolvedValue(null)
    const res = await POST(req({ module: 'toekomst' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 op een onbekende module', async () => {
    const res = await POST(req({ module: '/toekomst/lab' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 op een extra veld (strict): geen route of tijd mee te sturen', async () => {
    const res = await POST(req({ module: 'toekomst', pad: '/toekomst/lab' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('upsert alleen user_id + module, met ON CONFLICT DO NOTHING', async () => {
    const res = await POST(req({ module: 'fin' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockFrom).toHaveBeenCalledWith('user_activity_modules')
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: USER, module: 'fin' },
      { onConflict: 'user_id,day,module', ignoreDuplicates: true },
    )
  })

  it('een DB-fout (tabel ontbreekt) geeft toch 200', async () => {
    mockUpsert.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    const res = await POST(req({ module: 'budget' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('een throw in de client geeft toch 200', async () => {
    mockUpsert.mockRejectedValue(new Error('netwerk'))
    const res = await POST(req({ module: 'budget' }))
    expect(res.status).toBe(200)
  })
})
