import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/onboarding/afronding — de stappen budget → bank ná de onboarding-opslag.
 *
 * Vastgelegd:
 *  1. Read-modify-write: andere sleutels in `module_guide_state` blijven staan.
 *  2. Geen heropening: zonder open markering schrijft de route niets, zodat een
 *     voltooide gebruiker niet terug de onboarding in kan worden gestuurd.
 *  3. Dichte validatie: onbekende stap of reden → 400, niets geschreven.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET, POST } from './route'
import { ONBOARDING_AFRONDING_KEY, withAfrondingOpen } from '@/lib/onboarding/afronding'

const USER = 'user-1'
let updatePayloads: Record<string, unknown>[] = []
let eqIds: string[] = []

function buildClient(existingMap: Record<string, unknown> | null, budgetCount = 0) {
  return {
    from(table: string) {
      if (table === 'budgets') {
        return {
          select: () => ({
            eq: async (_col: string, id: string) => {
              eqIds.push(id)
              return { count: budgetCount, error: null }
            },
          }),
        }
      }
      if (table !== 'profiles') throw new Error(`onverwachte tabel: ${table}`)
      return {
        select: () => ({
          eq: (_col: string, id: string) => {
            eqIds.push(id)
            return { maybeSingle: async () => ({ data: { module_guide_state: existingMap }, error: null }) }
          },
        }),
        update: (patch: Record<string, unknown>) => {
          updatePayloads.push(patch)
          return {
            eq: async (_col: string, id: string) => {
              eqIds.push(id)
              return { error: null }
            },
          }
        },
      }
    },
  }
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/afronding', { method: 'POST', body: JSON.stringify(body) })
}

const written = () => updatePayloads.at(-1)?.module_guide_state as Record<string, unknown>

beforeEach(() => {
  updatePayloads = []
  eqIds = []
  mockCreateClient.mockReset()
  mockGetAuthClaims.mockReset()
  mockGetAuthClaims.mockResolvedValue({ sub: USER })
})

describe('POST /api/onboarding/afronding', () => {
  it('401 zonder sessie', async () => {
    mockGetAuthClaims.mockResolvedValue(null)
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await POST(req({ stap: 'bank', budget: 'opgeslagen' }))
    expect(res.status).toBe(401)
    expect(updatePayloads).toHaveLength(0)
  })

  it('schuift een open markering door naar bank en laat andere sleutels staan', async () => {
    const open = withAfrondingOpen({ 'welcome:guide': { x: 1 } })
    mockCreateClient.mockResolvedValue(buildClient(open))
    const res = await POST(req({ stap: 'bank', budget: 'opgeslagen' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, open: true })
    expect(written()['welcome:guide']).toEqual({ x: 1 })
    expect(written()[ONBOARDING_AFRONDING_KEY]).toMatchObject({ stap: 'bank', budget: 'opgeslagen' })
    expect(eqIds.every((id) => id === USER)).toBe(true)
  })

  it('klaar met overgeslagen bank legt de reden vast en sluit', async () => {
    mockCreateClient.mockResolvedValue(buildClient(withAfrondingOpen({})))
    const res = await POST(req({ stap: 'klaar', bank: { overgeslagen: 'liever_niet' } }))
    expect(await res.json()).toEqual({ ok: true, open: false })
    expect(written()[ONBOARDING_AFRONDING_KEY]).toMatchObject({ stap: 'klaar', bank: { overgeslagen: 'liever_niet' } })
  })

  it('schrijft niets zonder open markering (geen heropening)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ 'welcome:guide': {} }))
    const res = await POST(req({ stap: 'bank', budget: 'opgeslagen' }))
    expect(await res.json()).toEqual({ ok: true, open: false })
    expect(updatePayloads).toHaveLength(0)
  })

  it('GET zonder open markering → stap null, niets geschreven', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    expect(await (await GET()).json()).toEqual({ stap: null })
    expect(updatePayloads).toHaveLength(0)
  })

  it('GET op budget zonder bestaand plan → blijft budget', async () => {
    mockCreateClient.mockResolvedValue(buildClient(withAfrondingOpen({}), 0))
    expect(await (await GET()).json()).toEqual({ stap: 'budget' })
    expect(updatePayloads).toHaveLength(0)
  })

  it('GET op budget mét bestaand plan → schuift door naar bank (eigen rijen)', async () => {
    mockCreateClient.mockResolvedValue(buildClient(withAfrondingOpen({ 'welcome:guide': 1 }), 35))
    expect(await (await GET()).json()).toEqual({ stap: 'bank' })
    expect(written()[ONBOARDING_AFRONDING_KEY]).toMatchObject({ stap: 'bank', budget: 'opgeslagen' })
    expect(written()['welcome:guide']).toBe(1)
    expect(eqIds.every((id) => id === USER)).toBe(true)
  })

  it('weigert een onbekende reden of stap met 400', async () => {
    mockCreateClient.mockResolvedValue(buildClient(withAfrondingOpen({})))
    expect((await POST(req({ stap: 'klaar', bank: { overgeslagen: 'iets' } }))).status).toBe(400)
    expect((await POST(req({ stap: 'budget' }))).status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })
})
