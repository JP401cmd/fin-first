import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/onboarding/reset — de onomkeerbare "alles wissen"-route.
 *
 * Wat hier bewaakt wordt (F1 uit de forensiek jochen-account 31 aug 2026):
 *  1. zonder sessie: 401 en er wordt NIETS gewist;
 *  2. met sessie maar zonder `{ confirm: true }` in de body (geen body, lege
 *     body, `confirm: false`, `confirm: 'true'`): 400 en er wordt NIETS gewist —
 *     een kale/accidentele POST onder een levende sessie is onschadelijk;
 *  3. met `{ confirm: true }`: deleteAllUserData draait voor uitsluitend de
 *     eigen user-id en elke profiel-update is `.eq('id', user.id)`-gescoopt.
 */

const { mockCreateClient, mockGetServiceClient, mockDeleteAllUserData } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetServiceClient: vi.fn(),
  mockDeleteAllUserData: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mockGetServiceClient }))
vi.mock('@/lib/seed-persona', () => ({ deleteAllUserData: mockDeleteAllUserData }))

import { POST } from './route'

const USER_ID = 'user-jochen'

let currentUser: { id: string } | null
let profileUpdateEqs: string[]
let profileUpdatePayloads: Record<string, unknown>[]

function makeSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from: (table: string) => {
      expect(table).toBe('profiles')
      return {
        update: (payload: Record<string, unknown>) => {
          profileUpdatePayloads.push(payload)
          return {
            eq: async (_col: string, value: string) => {
              profileUpdateEqs.push(value)
              return { error: null }
            },
          }
        },
      }
    },
  }
}

function resetRequest(body?: unknown): Request {
  return new Request('http://localhost/api/onboarding/reset', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
  })
}

describe('/api/onboarding/reset', () => {
  beforeEach(() => {
    currentUser = { id: USER_ID }
    profileUpdateEqs = []
    profileUpdatePayloads = []
    mockCreateClient.mockResolvedValue(makeSupabase())
    mockDeleteAllUserData.mockReset()
    mockDeleteAllUserData.mockResolvedValue({})
  })

  it('zonder sessie geeft 401 en wist niets', async () => {
    currentUser = null
    const res = await POST(resetRequest({ confirm: true }))
    expect(res.status).toBe(401)
    expect(mockDeleteAllUserData).not.toHaveBeenCalled()
    expect(profileUpdatePayloads).toHaveLength(0)
  })

  it('een kale POST zonder body geeft 400 en wist niets', async () => {
    const res = await POST(resetRequest())
    expect(res.status).toBe(400)
    expect(mockDeleteAllUserData).not.toHaveBeenCalled()
    expect(profileUpdatePayloads).toHaveLength(0)
  })

  it.each([
    ['lege body', {}],
    ['confirm: false', { confirm: false }],
    ['confirm als string', { confirm: 'true' }],
    ['ongeldige JSON', '{not json'],
  ])('zonder expliciete bevestiging (%s) geeft 400 en wist niets', async (_label, body) => {
    const res = await POST(resetRequest(body))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(typeof json.error).toBe('string')
    expect(mockDeleteAllUserData).not.toHaveBeenCalled()
    expect(profileUpdatePayloads).toHaveLength(0)
  })

  it('met { confirm: true } wist uitsluitend de eigen data en reset het eigen profiel', async () => {
    const res = await POST(resetRequest({ confirm: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(mockDeleteAllUserData).toHaveBeenCalledTimes(1)
    expect(mockDeleteAllUserData.mock.calls[0][1]).toBe(USER_ID)

    // Core-reset + FIRE-reset + stappenplan-reset: elk gescoopt op de eigen rij.
    expect(profileUpdatePayloads.length).toBeGreaterThanOrEqual(3)
    expect(profileUpdateEqs.every((id) => id === USER_ID)).toBe(true)
    expect(profileUpdatePayloads[0]).toMatchObject({
      onboarding_completed: false,
      is_demo_user: false,
      full_name: null,
      household_type: 'solo',
    })
  })
})
