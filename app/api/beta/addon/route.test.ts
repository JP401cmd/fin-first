import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/beta/addon — de beta-keuze voor een add-on (ADR 0157).
 *
 * Vastgelegd:
 *   - 401 zonder sessie; 400 op een onbekende add-on, een onbekende bron of een
 *     extra veld (strict: geen user_id of subscriptions mee te sturen);
 *   - alleen de EIGEN rij wordt geschreven (claims.sub gaat als p_user_id naar de RPC);
 *   - AI aan: éérst de toestemming (consent_events granted), dán de add-on — een
 *     gefaalde toestemming roept de RPC NIET aan;
 *   - AI uit: add-on eraf én withdrawn vastgelegd;
 *   - Connected raakt de toestemming niet;
 *   - DB-fouten worden een generieke 500.
 *
 * De wijziging + logregel zijn atomair in de RPC `beta_set_addon`
 * (supabase/migrations/20260917160000_beta_set_addon_rpc.sql); daar staan de
 * array- en labellogica. De mock hieronder spiegelt alleen het contract
 * (jsonb { subscriptions, changed }).
 */

const { mockClaims, userCalls, serviceState, mockBetaFlag } = vi.hoisted(() => ({
  mockClaims: vi.fn(),
  userCalls: [] as { table: string; op: string; payload?: unknown }[],
  serviceState: {
    subs: [] as string[],
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    rpcError: null as unknown,
    rpcData: undefined as unknown,
    consentError: null as unknown,
    closed: false,
    recentCount: 0 as number | null,
    countError: null as unknown,
    countFilter: null as { col: string; val: unknown } | null,
  },
  mockBetaFlag: { value: true },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        userCalls.push({ table, op: 'insert', payload })
        return { error: table === 'consent_events' ? serviceState.consentError : null }
      },
      update: (payload: unknown) => ({
        eq: async () => {
          userCalls.push({ table, op: 'update', payload })
          return { error: null }
        },
      }),
    }),
  })),
  getAuthClaims: (...args: unknown[]) => mockClaims(...args),
}))

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    // Alleen lezen: de noodstop (app_settings) en de rate-limit-telling (logboek).
    // Schrijven hoort uitsluitend via de RPC te lopen.
    from: (table: string) => {
      if (table === 'app_settings') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: serviceState.closed ? { value: 'true' } : null, error: null }) }
        return q
      }
      if (table === 'tier_assignments_log') {
        const q = {
          select: () => q,
          eq: (col: string, val: unknown) => {
            serviceState.countFilter = { col, val }
            return q
          },
          like: () => q,
          gte: async () => ({ count: serviceState.recentCount, error: serviceState.countError }),
        }
        return q
      }
      throw new Error('de route hoort niet meer direct op tabellen te schrijven')
    },
    rpc: async (fn: string, args: { p_user_id: string; p_tier: string; p_active: boolean }) => {
      serviceState.rpcCalls.push({ fn, args })
      if (serviceState.rpcError) return { data: null, error: serviceState.rpcError }
      if (serviceState.rpcData !== undefined) return { data: serviceState.rpcData, error: null }
      const zonder = serviceState.subs.filter((s) => s !== args.p_tier)
      const next = args.p_active ? [...zonder, args.p_tier] : zonder
      const changed = serviceState.subs.includes(args.p_tier) !== args.p_active
      return { data: { subscriptions: next, changed }, error: null }
    },
  }),
}))

vi.mock('@/lib/beta-addons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/beta-addons')>()
  return {
    ...actual,
    get BETA_SELF_SERVE_ADDONS() {
      return mockBetaFlag.value
    },
  }
})

import { POST } from './route'

const USER = 'user-1'

function req(body: unknown) {
  return new Request('http://localhost/api/beta/addon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockClaims.mockReset().mockResolvedValue({ sub: USER })
  userCalls.length = 0
  serviceState.subs = ['kern']
  serviceState.rpcCalls = []
  serviceState.rpcError = null
  serviceState.rpcData = undefined
  serviceState.consentError = null
  serviceState.closed = false
  serviceState.recentCount = 0
  serviceState.countError = null
  serviceState.countFilter = null
  mockBetaFlag.value = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/beta/addon — noodstop en rate-limit', () => {
  it('app_settings.beta_addons_closed = true sluit de route zonder deploy (403 beta_closed, geen RPC)', async () => {
    serviceState.closed = true
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('beta_closed')
    expect(serviceState.rpcCalls).toHaveLength(0)
  })

  it('429 na 20 beta-wijzigingen in het afgelopen uur, geteld op de eigen rij, zonder toestemming of RPC', async () => {
    serviceState.recentCount = 20
    const res = await POST(req({ tier: 'ai', active: true, source: 'interstitial' }))
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('rate_limited')
    expect(serviceState.countFilter).toEqual({ col: 'target_user', val: USER })
    expect(serviceState.rpcCalls).toHaveLength(0)
    expect(userCalls).toHaveLength(0)
  })

  it('een mislukte telling weigert (fail-closed, generieke 500)', async () => {
    serviceState.countError = { message: 'db down' }
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(500)
    expect(serviceState.rpcCalls).toHaveLength(0)
  })
})

describe('POST /api/beta/addon', () => {
  it('401 zonder sessie, zonder schrijfactie', async () => {
    mockClaims.mockResolvedValue(null)
    const res = await POST(req({ tier: 'ai', active: true, source: 'interstitial' }))
    expect(res.status).toBe(401)
    expect(serviceState.rpcCalls).toHaveLength(0)
  })

  it('403 beta_closed zodra de zelfbediening uit staat', async () => {
    mockBetaFlag.value = false
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('beta_closed')
    expect(serviceState.rpcCalls).toHaveLength(0)
  })

  it.each([
    [{ tier: 'pro', active: true, source: 'interstitial' }],
    [{ tier: 'ai', active: true, source: 'seed' }],
    [{ tier: 'ai', active: true, source: 'interstitial', user_id: 'user-2' }],
    [{ tier: 'ai', active: 'ja', source: 'interstitial' }],
  ])('400 op een ongeldige body %j, zonder schrijfactie', async (body) => {
    const res = await POST(req(body))
    expect(res.status).toBe(400)
    expect(serviceState.rpcCalls).toHaveLength(0)
    expect(userCalls).toHaveLength(0)
  })

  it('AI aan: eerst de toestemming, dan de add-on via de RPC op de eigen rij', async () => {
    const res = await POST(req({ tier: 'ai', active: true, source: 'interstitial' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, tier: 'ai', active: true, subscriptions: ['kern', 'ai'] })

    expect(userCalls[0]).toMatchObject({
      table: 'consent_events',
      op: 'insert',
      payload: expect.objectContaining({ user_id: USER, decision: 'granted', source: 'interstitial' }),
    })
    expect(userCalls[1]).toMatchObject({ table: 'profiles', op: 'update', payload: expect.objectContaining({ ai_enabled: true }) })
    expect(serviceState.rpcCalls).toEqual([
      { fn: 'beta_set_addon', args: { p_user_id: USER, p_tier: 'ai', p_active: true } },
    ])
  })

  it('een gefaalde toestemming zet de add-on NIET aan (500, generiek)', async () => {
    serviceState.consentError = { code: '42501', message: 'rls says no' }
    const res = await POST(req({ tier: 'ai', active: true, source: 'onboarding' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toContain('rls')
    expect(serviceState.rpcCalls).toHaveLength(0)
  })

  it('een gefaalde profielstap van de toestemming zet de add-on ook NIET aan', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValueOnce({
      from: (table: string) => ({
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: table === 'profiles' ? { message: 'kolom weg' } : null }) }),
      }),
    } as never)
    const res = await POST(req({ tier: 'ai', active: true, source: 'interstitial' }))
    expect(res.status).toBe(500)
    expect(serviceState.rpcCalls).toHaveLength(0)
  })

  it('AI uit: add-on eraf (na de RPC) en withdrawn vastgelegd', async () => {
    serviceState.subs = ['ai', 'connected']
    const res = await POST(req({ tier: 'ai', active: false, source: 'mijn-privacy' }))
    expect(res.status).toBe(200)
    expect((await res.json()).subscriptions).toEqual(['connected'])
    expect(serviceState.rpcCalls[0].args).toEqual({ p_user_id: USER, p_tier: 'ai', p_active: false })
    expect(userCalls).toContainEqual(
      expect.objectContaining({ table: 'consent_events', payload: expect.objectContaining({ decision: 'withdrawn' }) }),
    )
  })

  it('Connected aan raakt de AI-toestemming niet', async () => {
    const res = await POST(req({ tier: 'connected', active: true, source: 'onboarding' }))
    expect(res.status).toBe(200)
    expect(userCalls).toHaveLength(0)
    expect((await res.json()).subscriptions).toEqual(['kern', 'connected'])
    expect(serviceState.rpcCalls[0].args).toEqual({ p_user_id: USER, p_tier: 'connected', p_active: true })
  })

  it('al in de gevraagde stand: RPC meldt changed=false, route geeft gewoon ok', async () => {
    serviceState.subs = ['connected']
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, tier: 'connected', active: true, subscriptions: ['connected'] })
    expect(serviceState.rpcCalls).toHaveLength(1)
  })

  it('een RPC-fout (bv. profiel ontbreekt) wordt een generieke 500', async () => {
    serviceState.rpcError = { code: 'P0002', message: 'beta_set_addon: profiel ontbreekt' }
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toContain('profiel')
  })

  it('een onverwacht RPC-antwoord wordt ook een generieke 500', async () => {
    serviceState.rpcData = null
    const res = await POST(req({ tier: 'connected', active: true, source: 'interstitial' }))
    expect(res.status).toBe(500)
  })

  it('AI uit met een RPC-fout legt GEEN withdrawn vast', async () => {
    serviceState.subs = ['ai']
    serviceState.rpcError = { message: 'db down' }
    const res = await POST(req({ tier: 'ai', active: false, source: 'mijn-privacy' }))
    expect(res.status).toBe(500)
    expect(userCalls).toHaveLength(0)
  })
})
