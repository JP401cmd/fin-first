import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { maakNepClient } from '@/lib/krant/nep-client.fixture'

/**
 * POST /api/krant/onboarding/klaar (Krant 2C, ADR 0192).
 *   - 401 zonder sessie;
 *   - 404 voor wie geen Krant-onboarding heeft (achter de gesloten vlag), en
 *     dan is er niets geschreven;
 *   - zet onboarding_completed = true en voegt 'krant' toe — NOOIT 'identity';
 *   - start de eerste verversing met de id uit de sessie; faalt die, dan is de
 *     onboarding tóch af.
 */

const mockGetVerifiedUser = vi.fn()
let nep: ReturnType<typeof maakNepClient>
const SERVICE = { naam: 'service' }

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => nep.client) }))
vi.mock('@/lib/supabase/cached-user', () => ({
  getVerifiedUser: (...a: unknown[]) => mockGetVerifiedUser(...a),
  getCachedUser: (...a: unknown[]) => mockGetVerifiedUser(...a),
}))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => SERVICE }))
const mockVervers = vi.fn()
vi.mock('@/lib/krant/tijdlijn-vernieuwen', () => ({ verversEigenTijdlijn: (...a: unknown[]) => mockVervers(...a) }))
const mockToegang = vi.fn()
vi.mock('@/lib/krant/aanmelden', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/krant/aanmelden')>()),
  krantOnboardingToegang: (...a: unknown[]) => mockToegang(...a),
}))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  nep = maakNepClient({
    profiles: [
      { id: 'user-a', onboarding_completed: false, completed_onboarding_steps: ['welkom'], active_modules: ['nieuws'] },
      { id: 'user-b', onboarding_completed: false, completed_onboarding_steps: null, active_modules: ['nieuws'] },
    ],
  })
  mockGetVerifiedUser.mockResolvedValue({ id: 'user-a' })
  mockToegang.mockResolvedValue('open')
  mockVervers.mockResolvedValue({ status: 'ververst', items: 3, leeg: false })
})

describe('POST /api/krant/onboarding/klaar', () => {
  it('401 zonder sessie', async () => {
    mockGetVerifiedUser.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(nep.queries).toHaveLength(0)
    expect(mockVervers).not.toHaveBeenCalled()
  })

  it('404 zonder Krant-onboarding (vlag dicht / geen Krant-account) — niets geschreven, niets ververst', async () => {
    mockToegang.mockResolvedValue('geen')
    const res = await POST()
    expect(res.status).toBe(404)
    expect(nep.rijen('profiles')[0]).toMatchObject({ onboarding_completed: false, completed_onboarding_steps: ['welkom'] })
    expect(mockVervers).not.toHaveBeenCalled()
  })

  it("zet de onboarding af, voegt 'krant' toe (nooit 'identity') en ververst met de eigen id", async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, eersteVerversing: 'ververst' })
    const a = nep.rijen('profiles')[0]!
    expect(a.onboarding_completed).toBe(true)
    expect(a.completed_onboarding_steps).toEqual(['welkom', 'krant'])
    expect(a.completed_onboarding_steps).not.toContain('identity')
    expect(nep.rijen('profiles')[1]).toMatchObject({ onboarding_completed: false, completed_onboarding_steps: null })
    expect(mockVervers).toHaveBeenCalledWith(SERVICE, 'user-a')
    const update = nep.queriesOp('profiles').find((q) => q.stappen.some((s) => s.m === 'update'))!
    expect(update.stappen).toContainEqual({ m: 'eq', args: ['id', 'user-a'] })
    const patch = update.stappen.find((s) => s.m === 'update')!.args[0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['completed_onboarding_steps', 'onboarding_completed'])
  })

  it('opnieuw aanroepen (al afgerond) blijft idempotent', async () => {
    mockToegang.mockResolvedValue('afgerond')
    await POST()
    await POST()
    expect(nep.rijen('profiles')[0]!.completed_onboarding_steps).toEqual(['welkom', 'krant'])
  })

  it('een mislukte eerste verversing maakt de onboarding niet ongedaan', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVervers.mockRejectedValue(new Error('matcher kapot'))
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, eersteVerversing: 'mislukt' })
    expect(nep.rijen('profiles')[0]!.onboarding_completed).toBe(true)
    spy.mockRestore()
  })

  it('een DB-fout → generieke 500, en dan geen verversing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    nep = maakNepClient({ profiles: [{ id: 'user-a' }] }, { fouten: { 'profiles:update': 'permission denied for table profiles' } })
    const res = await POST()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission')
    expect(mockVervers).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('bron-scan', () => {
  const src = readFileSync(join(__dirname, 'route.ts'), 'utf8')
  it("noemt 'identity' nergens in code, en de AI-laag draait niet mee (geen aiStap)", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/identity/)
    expect(code).not.toMatch(/aiStap|maakAiStap|isCloudAllowed/)
  })
})
