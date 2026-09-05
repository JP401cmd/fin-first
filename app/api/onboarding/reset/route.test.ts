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
import { FIRE_RESET_FIELDS, FIRE_RESET_NOT_NULL_COLUMNS } from './reset-profile-fields'

const USER_ID = 'user-jochen'

let currentUser: { id: string } | null
let profileUpdateEqs: string[]
let profileUpdatePayloads: Record<string, unknown>[]
/**
 * Fouten die de gemockte `.update().eq()` achtereenvolgens teruggeeft; een
 * ontbrekende/`null`-entry betekent "geslaagd". Nodig om de FIRE-reset onder een
 * echte DB-fout te kunnen bewijzen — de suite mockte tot 5 sep 2026 uitsluitend
 * succes, waardoor de not-null-fout van deze route per ontwerp onzichtbaar was.
 */
let profileUpdateErrors: ({ code?: string; message: string } | null)[]

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
              return { error: profileUpdateErrors[profileUpdateEqs.length - 1] ?? null }
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
    profileUpdateErrors = []
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

  /**
   * De FIRE-reset liep tot 5 sep 2026 op élke aanroep stil stuk: negen kolommen
   * in één atomaire update op `null`, waarvan er vier NOT NULL zijn (gemeten
   * tegen `information_schema.columns`, 05-09-2026). Postgres 23502 → 400,
   * onopgevangen, terwijl de UI een geslaagde reset toonde.
   */
  describe('FIRE-veldenreset', () => {
    it('zet geen enkele NOT NULL-kolom op null maar op de kolom-default', () => {
      for (const col of FIRE_RESET_NOT_NULL_COLUMNS) {
        expect(FIRE_RESET_FIELDS).toHaveProperty(col)
        expect(FIRE_RESET_FIELDS[col]).not.toBeNull()
      }
      expect(FIRE_RESET_FIELDS.fire_end_strategy).toBe('deplete')
      expect(FIRE_RESET_FIELDS.fire_end_age).toBe(90)
      expect(FIRE_RESET_FIELDS.retirement_expense_method).toBe('essential_budgets')
      expect(FIRE_RESET_FIELDS.fire_stop_anchor).toBe('solved')
    })

    it("houdt anker en stopleeftijd consistent ('solved' ⇒ fire_stop_age null)", () => {
      // CHECK profiles_fire_stop_anchor_age_consistent:
      // (fire_stop_anchor = 'age') = (fire_stop_age IS NOT NULL).
      expect(FIRE_RESET_FIELDS.fire_stop_anchor).not.toBe('age')
      expect(FIRE_RESET_FIELDS.fire_stop_age).toBeNull()
    })

    it('stuurt de FIRE-defaults daadwerkelijk mee in de reset-update', async () => {
      await POST(resetRequest({ confirm: true }))
      const firePayload = profileUpdatePayloads.find((p) => 'fire_end_strategy' in p)
      expect(firePayload).toBeDefined()
      expect(firePayload).toMatchObject(FIRE_RESET_FIELDS)
    })

    it('slikt een echte DB-fout op de FIRE-update niet meer in', async () => {
      // Update #1 = core (ok), #2 = FIRE (not-null-schending zoals live optrad).
      profileUpdateErrors = [
        null,
        {
          code: '23502',
          message:
            'null value in column "fire_end_strategy" of relation "profiles" violates not-null constraint',
        },
      ]
      const res = await POST(resetRequest({ confirm: true }))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      // Error-envelope: plat en client-veilig — geen rauwe DB-melding.
      expect(typeof json.error).toBe('string')
      expect(json.error).not.toContain('not-null')
    })

    it('strippt alleen bij een echte schema-cache-miss en gaat dan door', async () => {
      profileUpdateErrors = [
        null,
        {
          code: 'PGRST204',
          message: "Could not find the 'fire_stop_anchor' column of 'profiles' in the schema cache",
        },
      ]
      const res = await POST(resetRequest({ confirm: true }))
      expect(res.status).toBe(200)
      const retry = profileUpdatePayloads[2]
      expect(retry).toBeDefined()
      expect(retry).not.toHaveProperty('fire_stop_anchor')
      expect(retry).toHaveProperty('fire_end_strategy')
    })
  })
})
