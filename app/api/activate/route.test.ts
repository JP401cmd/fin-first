import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/activate — de foutenvelope op het faalpad (bevinding L6, UX-testpanel
 * 24 aug 2026).
 *
 * `deleteAllUserData()` / `seedPersonaData()` (`lib/seed-persona.ts`) gooien op ~25
 * plekken een kale `throw new Error(...)` zodra een insert of delete faalt — dat is
 * dáár correct: die functies verwachten een vangende caller. De route ving ze niet:
 * de throw propageerde ongevangen naar Next.js' eigen foutafhandeling, wat een
 * **500 met een volledig lege body** oplevert. De client had daarmee niets om te
 * tonen, en de conventie uit ADR 0044 (`lib/api/respond.ts`, platte envelope
 * `{ error: string }`) werd op precies deze route omzeild.
 *
 * Wat hier vastligt:
 *
 *  1. **Elke** onverwachte exception uit de POST-body komt terug als de platte
 *     envelope met status 500 — niet als een lege body. Dit geldt voor het
 *     seed-pad én het wipe-pad, want de guard omvat de hele handler en niet één
 *     aanroep (de ADR-0044-refactor `727268073` migreerde destijds alleen de
 *     bestaande returns en liet dit gat open).
 *  2. **Geen rauwe `error.message` naar de client** (AVG / CLAUDE.md): de
 *     responsbody is exact de generieke tekst, de echte fout gaat server-side de
 *     log in onder de grep-bare tag `activate:POST`.
 *  3. Het **succespad blijft ongewijzigd** — de guard mag geen fouten opslokken
 *     die er niet zijn.
 *
 * Zusterroute `app/api/admin/seed/route.ts` roept dezelfde twee functies wél binnen
 * try/catch aan; dit is dus geen nieuw patroon maar het dichten van een gat erin.
 */

const { mockCreateClient, mockDeleteAllUserData, mockSeedPersonaData } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDeleteAllUserData: vi.fn(),
  mockSeedPersonaData: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))
vi.mock('@/lib/seed-persona', () => ({
  deleteAllUserData: mockDeleteAllUserData,
  seedPersonaData: mockSeedPersonaData,
}))

import { POST } from './route'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'

/** Een echte persona-sleutel: de seed-tak vuurt alleen als PERSONAS 'm kent. */
const PERSONA_KEY: PersonaKey = 'daan'

/**
 * Chainbare PostgREST-stub: `select`/`eq`/`gte`/`update` geven zichzelf terug,
 * `single()` en `await` leveren hetzelfde resultaat. Bewust minimaal — de route
 * gebruikt alleen deze vier schakels.
 */
function query(result: unknown) {
  const builder: Record<string, unknown> = {
    single: async () => result,
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  }
  for (const method of ['select', 'eq', 'gte', 'update']) {
    builder[method] = () => builder
  }
  return builder
}

/** Supabase-client waarop de hele happy flow van de route slaagt. */
function clientFor(personaKey: string | undefined) {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-a',
            user_metadata: personaKey ? { test_persona_key: personaKey } : {},
          },
        },
      }),
    },
    from: (table: string) => {
      if (table === 'profiles') return query({ data: { last_known_phase: null }, error: null })
      // assets / debts / transactions: lege datasets zijn genoeg voor computeFeatureAccess.
      return query({ data: [], error: null })
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue(clientFor(PERSONA_KEY))
  mockDeleteAllUserData.mockResolvedValue(undefined)
  mockSeedPersonaData.mockResolvedValue(undefined)
  // Onderdrukt de verwachte serverError-logregel in de testuitvoer; de spy is
  // tegelijk de assertie dat de tag daadwerkelijk gelogd wordt.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/activate — onverwachte fout geeft de envelope, geen lege 500', () => {
  it('vangt een rejectende seedPersonaData en antwoordt met { error, code }', async () => {
    mockSeedPersonaData.mockRejectedValue(new Error('Failed to insert assets: duplicate key'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Er ging iets mis. Probeer het later opnieuw.',
      code: 'server_error',
    })
  })

  it('vangt óók een rejectende deleteAllUserData — de guard omvat de hele handler', async () => {
    mockDeleteAllUserData.mockRejectedValue(new Error('Failed to delete transactions'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Er ging iets mis. Probeer het later opnieuw.',
      code: 'server_error',
    })
    // De seed mag niet meer gedraaid hebben nadat de wipe klapte.
    expect(mockSeedPersonaData).not.toHaveBeenCalled()
  })

  it('lekt de rauwe fouttekst niet, maar logt die server-side onder tag activate:POST', async () => {
    mockSeedPersonaData.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const res = await POST()
    const body = JSON.stringify(await res.json())

    expect(body).not.toContain('duplicate key')
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((args) => String(args[0]))
      .join('\n')
    expect(logged).toContain('activate:POST')
    expect(logged).toContain('duplicate key')
  })
})

describe('POST /api/activate — succespad blijft ongemoeid', () => {
  it('geeft 200 met { success, phase, seeded } wanneer het seeden slaagt', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; seeded: boolean; phase: unknown }
    expect(body.success).toBe(true)
    expect(body.seeded).toBe(true)
    expect(body.phase).toBeDefined()
    expect(mockSeedPersonaData).toHaveBeenCalledWith(
      expect.anything(),
      'user-a',
      PERSONAS[PERSONA_KEY],
      expect.any(Function),
    )
  })

  it('slaat de seed-tak over zonder persona-sleutel en meldt seeded: false', async () => {
    mockCreateClient.mockResolvedValue(clientFor(undefined))

    const res = await POST()

    expect(res.status).toBe(200)
    expect((await res.json()).seeded).toBe(false)
    expect(mockDeleteAllUserData).not.toHaveBeenCalled()
    expect(mockSeedPersonaData).not.toHaveBeenCalled()
  })
})
