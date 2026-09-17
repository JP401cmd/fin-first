import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_CONSENT_VERSION } from '@/lib/ai/privacy-facts'

/**
 * POST /api/consent/ai — de ene schrijfroute voor de AI-keuze (ADR 0155).
 *
 * Vastgelegd:
 *   - 401 zonder sessie, en dan geen schrijfactie;
 *   - 400 op een onbekende keuze, een server-only bron (`pension-upload`) of
 *     een extra veld (strict) — de client kan geen kind/versie/tijd meesturen;
 *   - volgorde: éérst het bewijs in consent_events, dán de profielrij;
 *   - `granted` zet ai_enabled aan, `withdrawn` zet 'm uit; beide stempelen
 *     ai_consent_at + ai_consent_version en bevestigen de stand in het antwoord;
 *   - een DB-fout wordt een 500 met de generieke envelope (geen rauwe fout naar
 *     de client) en een gefaald event schrijft de profielrij NIET.
 */

const mockClaims = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: (...a: unknown[]) => mockFrom(...a) })),
  getAuthClaims: (...args: unknown[]) => mockClaims(...args),
}))

import { POST } from './route'

const USER = 'user-1'

function req(body: unknown) {
  return new Request('http://localhost/api/consent/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockClaims.mockReset().mockResolvedValue({ sub: USER })
  mockInsert.mockReset().mockResolvedValue({ data: null, error: null })
  mockEq.mockReset().mockResolvedValue({ data: null, error: null })
  mockUpdate.mockReset().mockImplementation(() => ({ eq: mockEq }))
  mockFrom.mockReset().mockImplementation((table: string) => {
    if (table === 'consent_events') return { insert: mockInsert }
    if (table === 'profiles') return { update: mockUpdate }
    throw new Error(`onverwachte tabel ${table}`)
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/consent/ai', () => {
  it('401 zonder sessie, zonder schrijfactie', async () => {
    mockClaims.mockResolvedValue(null)
    const res = await POST(req({ decision: 'granted', source: 'onboarding' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 op een onbekende keuze', async () => {
    const res = await POST(req({ decision: 'misschien', source: 'onboarding' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 op de server-only bron pension-upload', async () => {
    const res = await POST(req({ decision: 'granted', source: 'pension-upload' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 op een extra veld (strict): geen kind, versie of tijd mee te sturen', async () => {
    const res = await POST(req({ decision: 'granted', source: 'onboarding', version: 'x' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('granted: eerst het bewijs, dan de profielrij met ai_enabled=true', async () => {
    const res = await POST(req({ decision: 'granted', source: 'onboarding' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, aiEnabled: true, version: AI_CONSENT_VERSION })
    expect(typeof body.consentAt).toBe('string')

    expect(mockFrom.mock.calls.map((c) => c[0])).toEqual(['consent_events', 'profiles'])
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: USER,
      kind: 'ai_cloud',
      decision: 'granted',
      version: AI_CONSENT_VERSION,
      source: 'onboarding',
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      ai_enabled: true,
      ai_consent_at: body.consentAt,
      ai_consent_version: AI_CONSENT_VERSION,
      updated_at: body.consentAt,
    })
    expect(mockEq).toHaveBeenCalledWith('id', USER)
  })

  it('withdrawn vanaf /mijn/privacy: ai_enabled=false, wél een event', async () => {
    const res = await POST(req({ decision: 'withdrawn', source: 'mijn-privacy' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, aiEnabled: false })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'withdrawn', source: 'mijn-privacy' }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ai_enabled: false }))
  })

  it('een gefaald event geeft 500 met generieke envelope en raakt de profielrij niet', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation missing' } })
    const res = await POST(req({ decision: 'granted', source: 'interstitial' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('relation missing')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('een gefaalde profiel-update geeft 500 met generieke envelope', async () => {
    mockEq.mockResolvedValue({ data: null, error: { code: '42703', message: 'column missing' } })
    const res = await POST(req({ decision: 'granted', source: 'interstitial' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('column missing')
  })
})
