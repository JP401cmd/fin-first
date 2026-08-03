import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/local-tips — de schrijfkant van het lokale tips-pad.
 *
 * Twee dingen worden hier vastgepind, en dat zijn precies de twee waar het hele
 * ontwerp op rust:
 *  1. de gate-drieluik (401 / kill-switch-403 / tier-403), spiegel van
 *     /api/local-chat-overview;
 *  2. de VERTROUWENSGRENS: de client stuurt alleen tekst, de server leidt élk
 *     cijfer opnieuw af uit de canonieke kandidatenlijst, en een onbekende
 *     `candidateId` levert fail-closed géén rij op.
 */

const mockCheckTierGate = vi.fn()
const mockBuildLocalTipCandidates = vi.fn()

vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/local/local-tips-context', async () => {
  // De pure helpers blijven echt (type-afleiding, generatie-sleutel); alleen de
  // dure kandidaatbouwer wordt gemockt.
  const actual = await vi.importActual<typeof import('@/lib/ai/local/local-tips-context')>(
    '@/lib/ai/local/local-tips-context',
  )
  return { ...actual, buildLocalTipCandidates: (...a: unknown[]) => mockBuildLocalTipCandidates(...a) }
})

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'
import type { LocalTipCandidate } from '@/lib/ai/local/local-tips-context'

const USER = { id: 'user-1' }

const KANDIDAAT: LocalTipCandidate = {
  id: 'budget:boodschappen',
  bron: 'budget',
  titel: 'Bespaar op Boodschappen',
  toelichting: null,
  besparingPerJaar: 1080,
  euroImpactMonthly: 90,
  vrijheidsdagen: 11,
  vrijheidsdagenToegestaan: true,
  budgetSlug: 'boodschappen',
  type: 'budget_optimization',
  priority: 5,
}

/** De body zoals de client 'm stuurt: alleen tekst, geen enkel bedrag. */
const BODY = {
  tips: [
    {
      candidateId: 'budget:boodschappen',
      title: 'Slimmer boodschappen doen',
      description: 'Je bespaart €90 per maand.',
      actions: ['Vergelijk je supermarkt'],
    },
  ],
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/local-tips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type SupaOpts = {
  user?: { id: string } | null
  profileRow?: { ai_enabled?: boolean | null } | null
  /** Bestaande openstaande aanbeveling voor de idempotentie-tak. */
  existing?: unknown | null
}

/** Vangt de insert-payload zodat de test de afgeleide cijfers kan inspecteren. */
function buildSupabase({ user = USER, profileRow = { ai_enabled: true }, existing = null }: SupaOpts) {
  const inserts: Record<string, unknown>[] = []
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
          }),
        }),
      }
    }
    if (table === 'recommendations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          inserts.push(payload)
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'rec-1', ...payload }, error: null }),
            }),
          }
        }),
      }
    }
    throw new Error(`onverwachte tabel: ${table}`)
  })
  return {
    supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from },
    inserts,
  }
}

beforeEach(() => {
  mockCheckTierGate.mockReset().mockResolvedValue(null)
  mockBuildLocalTipCandidates.mockReset().mockResolvedValue({
    candidates: [KANDIDAAT],
    hasCandidates: true,
  })
  mockCreateClient.mockReset()
})

describe('POST /api/local-tips — gate-drieluik', () => {
  it('401 zonder sessie → geen kandidaatbouw', async () => {
    const { supabase } = buildSupabase({ user: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(req(BODY) as never)

    expect(res.status).toBe(401)
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockBuildLocalTipCandidates).not.toHaveBeenCalled()
  })

  it('ai_enabled=false → 403 (kill-switch), zonder tier-check of kandidaatbouw', async () => {
    const { supabase } = buildSupabase({ profileRow: { ai_enabled: false } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(req(BODY) as never)

    expect(res.status).toBe(403)
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockBuildLocalTipCandidates).not.toHaveBeenCalled()
  })

  it('geen ai-abonnement → 403 (tier-gate), zonder kandidaatbouw', async () => {
    const { supabase } = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)
    mockCheckTierGate.mockResolvedValue({ error: 'Deze functie vereist een AI abonnement' })

    const res = await POST(req(BODY) as never)

    expect(res.status).toBe(403)
    expect(mockBuildLocalTipCandidates).not.toHaveBeenCalled()
  })

  it('400 bij een ongeldige body (zod)', async () => {
    const { supabase } = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(req({ tips: [{ candidateId: '', title: '', description: '' }] }) as never)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/local-tips — vertrouwensgrens', () => {
  it('leidt ELK cijfer af uit de canonieke kandidaat, niet uit de body', async () => {
    const { supabase, inserts } = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(req(BODY) as never)

    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      user_id: USER.id,
      title: 'Slimmer boodschappen doen',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: 90,
      euro_impact_yearly: 1080,
      freedom_days_per_year: 11,
      related_budget_slug: 'boodschappen',
      priority_score: 5,
      ai_generation_id: 'lokaal:budget:boodschappen',
      status: 'pending',
    })
  })

  it('houdt de vrijheidsdagen op 0 zodra de compliance-regel dat zegt', async () => {
    mockBuildLocalTipCandidates.mockResolvedValue({
      candidates: [{ ...KANDIDAAT, vrijheidsdagen: 0, vrijheidsdagenToegestaan: false }],
      hasCandidates: true,
    })
    const { supabase, inserts } = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)

    await POST(req(BODY) as never)

    expect(inserts[0].freedom_days_per_year).toBe(0)
    // De actie erft dezelfde nul — de som mag de kans nooit overtreffen.
    expect(inserts[0].suggested_actions).toEqual([
      { title: 'Vergelijk je supermarkt', freedom_days_impact: 0 },
    ])
  })

  it('FAIL-CLOSED: onbekende candidateId → geen rij, wel een net antwoord', async () => {
    const { supabase, inserts } = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(
      req({ tips: [{ ...BODY.tips[0], candidateId: 'budget:bestaat-niet' }] }) as never,
    )

    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(0)
    expect(await res.json()).toMatchObject({ recommendations: [], overgeslagen: 1 })
  })

  it('is idempotent: een bestaande openstaande aanbeveling wordt hergebruikt', async () => {
    const { supabase, inserts } = buildSupabase({ existing: { id: 'rec-bestaand' } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(req(BODY) as never)

    expect(inserts).toHaveLength(0)
    expect(await res.json()).toMatchObject({ recommendations: [{ id: 'rec-bestaand' }] })
  })
})
