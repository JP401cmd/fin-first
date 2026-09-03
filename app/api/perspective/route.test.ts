import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressie voor WF-NAV-19 (UAT-bug 2026-09-02-WF-NAV-19-bug1).
 *
 * Repro: een solo-account (GEEN rij in `household_members`) dat in zijn profiel
 * het zelf-gerapporteerde NIBUD-veld `household_type` op 'samen'/'gezin' had
 * staan, kreeg van GET /api/perspective toch `isHousehold: true` plus alle drie
 * de perspectieven — waardoor de perspectief-badge (sidebar, ⌘K) zichtbaar werd
 * terwijl er geen gekoppeld tweede account is.
 *
 * Vastgelegd contract: Huishouden/Partner worden UITSLUITEND op `hasHousehold`
 * gegate; `householdType` blijft ongewijzigd in de response (NIBUD-budgetcheck).
 */

const mockGetAuthClaims = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
  getAuthClaims: (...args: unknown[]) => mockGetAuthClaims(...args),
}))

import { GET } from './route'

const CLAIMS = { sub: 'user-1' }

beforeEach(() => {
  mockGetAuthClaims.mockReset()
  mockFrom.mockReset()
})

/**
 * Bouwt de twee query-vormen die de route gebruikt:
 *  - profiles: .select().eq().single()
 *  - household_members: .select() (thenable, RLS filtert)
 */
function mockSupabase(opts: {
  householdType: string | null
  members?: Array<{ user_id: string; role: string }>
  partnerName?: string | null
}) {
  const members = opts.members ?? []
  mockFrom.mockImplementation((table: string) => {
    if (table === 'household_members') {
      return { select: vi.fn().mockResolvedValue({ data: members, error: null }) }
    }
    // profiles — twee call-sites: het eigen profiel en (optioneel) het partnerprofiel
    return {
      select: vi.fn((cols: string) => ({
        eq: vi.fn((_col: string, id: string) => ({
          single: vi.fn().mockResolvedValue(
            id === CLAIMS.sub
              ? {
                  data: { household_type: opts.householdType, selected_perspective: null },
                  error: null,
                }
              : { data: { full_name: opts.partnerName ?? null }, error: null }
          ),
        })),
        _cols: cols,
      })),
    }
  })
}

describe('GET /api/perspective — perspectief-gating (WF-NAV-19)', () => {
  it('401 zonder sessie', async () => {
    mockGetAuthClaims.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each(['samen', 'gezin'] as const)(
    'solo-account met household_type=%s zonder huishoudlid → alleen Persoonlijk, isHousehold=false',
    async (householdType) => {
      mockGetAuthClaims.mockResolvedValue(CLAIMS)
      mockSupabase({ householdType })

      const body = await (await GET()).json()

      expect(body.hasHousehold).toBe(false)
      expect(body.isHousehold).toBe(false)
      expect(body.availablePerspectives.map((p: { id: string }) => p.id)).toEqual(['personal'])
      expect(body.selectedPerspective).toBe('personal')
      // Het NIBUD-veld blijft beschikbaar voor de budgetcheck elders.
      expect(body.householdType).toBe(householdType)
    }
  )

  it('household_type=solo MET geaccepteerd huishoudlid → alle drie de perspectieven (happy path blijft)', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockSupabase({
      householdType: 'solo',
      members: [
        { user_id: CLAIMS.sub, role: 'owner' },
        { user_id: 'user-2', role: 'member' },
      ],
      partnerName: 'Tessa',
    })

    const body = await (await GET()).json()

    expect(body.hasHousehold).toBe(true)
    expect(body.isHousehold).toBe(true)
    expect(body.availablePerspectives.map((p: { id: string }) => p.id)).toEqual([
      'personal',
      'household',
      'partner',
    ])
    expect(body.partnerName).toBe('Tessa')
  })
})
