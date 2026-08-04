import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/local-chat-overview — de hydratieroute die de client-
 * `LocalChatPanel` (on-device Fin-chat) voedt met het financiële overzicht.
 *
 * Borgt de gate-drieluik (spiegel van /mijn/lokale-chat/page.tsx):
 *  - 401 zonder sessie (geen profielquery, geen overview-build).
 *  - 403 met `ai_enabled=false` (kill-switch) — geen tier-check, geen build.
 *  - 403 zonder 'ai'-abonnement (tier-gate) — geen build.
 *  - 200 met geldige sessie + tier → de LocalChatOverview-vorm.
 *
 * De guardrails sanitize/PII-mask/token-logging zijn hier N.V.T. (geen model-
 * call, geen egress) — daarom niets om te mocken op dat vlak.
 */

const mockCheckTierGate = vi.fn()
const mockBuildLocalChatOverview = vi.fn()

vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/local/local-chat-context', () => ({
  buildLocalChatOverview: (...args: unknown[]) => mockBuildLocalChatOverview(...args),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { GET } from './route'

const USER = { id: 'user-1' }

const OVERVIEW = {
  hasData: true,
  nettoVermogen: 125000,
  vrijheidstijd: '2 jaar en 9 maanden',
  fireDoel: 600000,
  vrijheidsPct: 20.8,
  maandinkomen: 3500,
  maanduitgaven: 2400,
  spaarquotePct: 31,
  dagtarief: 80,
  swrPct: 3.5,
  noodbuffer: { bedrag: 14400, maanden: 6 },
}

type SupaOpts = {
  user?: { id: string } | null
  profileRow?: { ai_enabled?: boolean | null } | null
}

function buildSupabase({ user = USER, profileRow = { ai_enabled: true } }: SupaOpts) {
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
    throw new Error(`onverwachte tabel: ${table}`)
  })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  }
}

beforeEach(() => {
  mockCheckTierGate.mockReset().mockResolvedValue(null)
  mockBuildLocalChatOverview.mockReset().mockResolvedValue(OVERVIEW)
  mockCreateClient.mockReset()
})

describe('GET /api/local-chat-overview — gate-drieluik', () => {
  it('401 zonder sessie → geen profielquery, geen overview-build', async () => {
    const supabase = buildSupabase({ user: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockBuildLocalChatOverview).not.toHaveBeenCalled()
  })

  it('ai_enabled=false → 403 (kill-switch), zonder tier-check of build', async () => {
    const supabase = buildSupabase({ profileRow: { ai_enabled: false } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()

    expect(res.status).toBe(403)
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockBuildLocalChatOverview).not.toHaveBeenCalled()
  })

  it('geen ai-abonnement → 403 (tier-gate), zonder build', async () => {
    const supabase = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)
    mockCheckTierGate.mockResolvedValue({ subscriptions: [], error: 'Deze functie vereist een AI abonnement' })

    const res = await GET()

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Deze functie vereist een AI abonnement' })
    expect(mockBuildLocalChatOverview).not.toHaveBeenCalled()
  })

  it('geldige sessie + ai-tier → 200 + de LocalChatOverview-vorm', async () => {
    const supabase = buildSupabase({})
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()

    expect(res.status).toBe(200)
    // GEEN CACHE (eigenaarsbesluit 4 aug 2026). Dit overzicht zit na het openen
    // ingebakken in de systeem-preface van de LiteRT-conversatie, die na de
    // eerste beurt vastligt: het openen is het ENIGE verversmoment. Een cache
    // van vijf minuten daarbovenop liet je een gesprek beginnen met cijfers die
    // al vijf minuten oud waren — en daar vervolgens een half uur mee doorpraten.
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const json = await res.json()
    expect(json).toEqual(OVERVIEW)
    expect(mockCheckTierGate).toHaveBeenCalledWith(supabase, USER.id, 'ai')
    expect(mockBuildLocalChatOverview).toHaveBeenCalledWith(supabase)
  })

  it('ontbrekend profiel (fail-open) → kill-switch blokkeert niet, 200', async () => {
    const supabase = buildSupabase({ profileRow: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(mockBuildLocalChatOverview).toHaveBeenCalled()
  })
})
