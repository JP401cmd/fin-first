import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/krant/testeditie — wie mag hem zien, en dat hij nooit een ander
 * account kan opleveren (keuze 12, kaart 1B).
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockLaadTesteditie = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))
vi.mock('@/lib/krant/testeditie', () => ({
  laadTesteditie: (...args: unknown[]) => mockLaadTesteditie(...args),
}))

import { GET } from './route'

let profiel: { is_demo_user?: boolean; role?: string } | null = null
let profielFout: { message: string } | null = null
const profielSelects: string[] = []

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockLaadTesteditie.mockReset().mockResolvedValue({ id: 'ed-1', weekKey: '2026-W39', items: [] })
  // 22 sep: default fixture is superadmin — is_demo_user is geen toegangssignaal
  // meer (Y1/H1: zelf te zetten via onboarding/seed + onboarding/reset).
  profiel = { role: 'superadmin' }
  profielFout = null
  profielSelects.length = 0
  mockFrom.mockReset().mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = (k: string) => {
      profielSelects.push(k)
      return b
    }
    b.eq = () => b
    b.maybeSingle = () => Promise.resolve({ data: profiel, error: profielFout })
    return b
  })
})

describe('GET /api/krant/testeditie', () => {
  it('401 zonder sessie, vóór enige lezing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect(mockLaadTesteditie).not.toHaveBeenCalled()
  })

  it('403 voor een gewone gebruiker: de schaduweditie blijft tot 1C onzichtbaar', async () => {
    profiel = { role: 'user' }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mockLaadTesteditie).not.toHaveBeenCalled()
  })

  it('403 voor een testaccount die geen superadmin is: is_demo_user is geen toegangssignaal meer', async () => {
    // Y1/H1: elke ingelogde gebruiker kan is_demo_user op zichzelf zetten via
    // onboarding/seed + onboarding/reset — dus telt niet mee als bewijs.
    profiel = { is_demo_user: true, role: 'user' }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mockLaadTesteditie).not.toHaveBeenCalled()
  })

  it('een superadmin krijgt zijn eigen editie', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ editie: { id: 'ed-1', weekKey: '2026-W39', items: [] } })
    expect(mockLaadTesteditie).toHaveBeenCalledTimes(1)
    // Tweede argument is het id uit de sessie — er is geen andere bron.
    expect(mockLaadTesteditie.mock.calls[0][1]).toBe('user-a')
  })

  it('fail-closed: een onleesbaar of ontbrekend profiel geeft 403', async () => {
    profiel = null
    profielFout = { message: 'kapot' }
    expect((await GET()).status).toBe(403)
    profielFout = null
    expect((await GET()).status).toBe(403)
    expect(mockLaadTesteditie).not.toHaveBeenCalled()
  })

  it('geen editie → 200 met null (geen 404-ruis op een pagina die gewoon laadt)', async () => {
    mockLaadTesteditie.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ editie: null })
  })

  it('een leesfout wordt een generieke 500-envelope, geen rauwe message', async () => {
    mockLaadTesteditie.mockRejectedValue(new Error('relation "krant_edities" does not exist'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })

  it('de toegangscheck kost één profiel-lezing, met alleen de rol', async () => {
    await GET()
    expect(profielSelects).toEqual(['role'])
  })
})
