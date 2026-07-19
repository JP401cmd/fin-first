import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthClaims } from './server'

/**
 * Vorm-test voor de `getAuthClaims()`-helper (RF-008/C2). Borgt ALLEEN de
 * null-/happy-vorm van de wrapper — de échte RLS/PostgREST-verificatie gebeurt
 * met een ingelogde e2e-call (mocks bewijzen niets over PostgREST/RLS).
 *
 * `getClaims()` heeft drie retour-vormen (auth-js): {data:{claims},…},
 * {data:null,error} en {data:null,error:null}. De helper mapt de laatste twee
 * op `null` en de eerste op de claims-payload.
 */
function clientWithGetClaims(result: unknown): SupabaseClient {
  return {
    auth: {
      getClaims: async () => result,
    },
  } as unknown as SupabaseClient
}

describe('getAuthClaims', () => {
  it('geeft de claims-payload terug bij een geldige sessie (happy)', async () => {
    const claims = { sub: 'user-123', email: 'test@example.com', role: 'authenticated' }
    const supabase = clientWithGetClaims({ data: { claims }, error: null })

    const result = await getAuthClaims(supabase)

    expect(result).toEqual(claims)
    expect(result?.sub).toBe('user-123')
    expect(result?.email).toBe('test@example.com')
  })

  it('geeft null terug wanneer er geen geldige token is (data:null + error)', async () => {
    const supabase = clientWithGetClaims({ data: null, error: { message: 'invalid JWT' } })

    expect(await getAuthClaims(supabase)).toBeNull()
  })

  it('geeft null terug bij de lege-vorm (data:null, error:null)', async () => {
    const supabase = clientWithGetClaims({ data: null, error: null })

    expect(await getAuthClaims(supabase)).toBeNull()
  })
})
