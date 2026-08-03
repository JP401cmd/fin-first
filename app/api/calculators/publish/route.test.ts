import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/calculators/publish — de ontbrekende tier-/credit-poort.
 *
 * De AI zit hier in `screenPublishMetadata` (→ `getModel`), dus ook deze route
 * bereikte het model indirect en glipte langs de statische scan. De screening is
 * bovendien een POORTWACHTER die fail-closed is: hem overslaan betekent
 * publiceren zónder de controle die de Wft-grens bewaakt en persoonlijke
 * bedragen/leveranciersnamen uit een publieke rij houdt.
 *
 * Geborgd:
 *  - geen 'ai'-abonnement → 403, GEEN screening én GEEN publieke insert;
 *  - de 403 draagt de `{ ok: false, error }`-vorm die de curatie-sheet toont, zodat
 *    de reden eerlijk bij de gebruiker landt in plaats van "Publiceren mislukt";
 *  - maandbudget op → 429 met Retry-After, GEEN screening;
 *  - privé-modus wint van allebei.
 */

const mockIsCloudAllowed = vi.fn()
const mockCheckTierGate = vi.fn()
const mockCheckCreditBudget = vi.fn()
const mockRecordAiUsage = vi.fn()
const mockScreenPublishMetadata = vi.fn()

vi.mock('@/lib/ai/privacy-gate', () => ({
  isCloudAllowed: (...args: unknown[]) => mockIsCloudAllowed(...args),
  PRIVACY_GATE_CODE: 'privacy_mode_active',
}))
vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/credit-gate', () => ({
  checkCreditBudget: (...args: unknown[]) => mockCheckCreditBudget(...args),
  creditLimitMessage: () => 'Je hebt je maandelijkse AI-limiet bereikt.',
}))
vi.mock('@/lib/ai-credits', () => ({
  recordAiUsage: (...args: unknown[]) => mockRecordAiUsage(...args),
}))
vi.mock('@/lib/ai/screen-publish-metadata', () => ({
  screenPublishMetadata: (...args: unknown[]) => mockScreenPublishMetadata(...args),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

/** `from` gooit bewust: een geblokkeerd verzoek hoort de DB niet te raken. */
function supabase(user: { id: string } | null = USER) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => {
      throw new Error('DB mag niet geraakt worden op een geblokkeerd pad')
    }),
  }
}

function request() {
  return {
    json: () =>
      Promise.resolve({ calculatorId: 'calc-1', curated_defaults: {}, prefill_overrides: {} }),
  } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue(supabase())
  mockIsCloudAllowed.mockResolvedValue(true)
  mockCheckTierGate.mockResolvedValue(null)
  mockCheckCreditBudget.mockResolvedValue({ allowed: true, retryAfterSeconds: 3600 })
})

describe('POST /api/calculators/publish — poorten vóór de screening', () => {
  it('401 zonder sessie', async () => {
    mockCreateClient.mockResolvedValue(supabase(null))

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(mockScreenPublishMetadata).not.toHaveBeenCalled()
  })

  it('ZONDER AI-ABONNEMENT: 403, geen screening en geen publieke rij', async () => {
    mockCheckTierGate.mockResolvedValue({
      subscriptions: [],
      error: 'Deze functie vereist een AI abonnement',
    })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(403)
    // De sheet leest `data.ok === false ? data.error : fallback` — zonder deze
    // vorm zou de gebruiker een generieke "Publiceren mislukt" zien in plaats van
    // de echte reden, en dan is de keuze niet eerlijk gecommuniceerd.
    expect(body.ok).toBe(false)
    expect(body.error).toContain('AI-abonnement')
    expect(mockScreenPublishMetadata).not.toHaveBeenCalled()
    expect(mockRecordAiUsage).not.toHaveBeenCalled()
  })

  it('maandbudget op: 429 met Retry-After, geen screening', async () => {
    mockCheckCreditBudget.mockResolvedValue({ allowed: false, retryAfterSeconds: 9876 })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('9876')
    expect(body.ok).toBe(false)
    expect(mockScreenPublishMetadata).not.toHaveBeenCalled()
  })

  it('privé-modus wint: 403 vóórdat tier- of credit-gate gelezen worden', async () => {
    mockIsCloudAllowed.mockResolvedValue(false)

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('privacy_mode_active')
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockCheckCreditBudget).not.toHaveBeenCalled()
    expect(mockScreenPublishMetadata).not.toHaveBeenCalled()
  })

  it('de credit-gate gebruikt de sleutel waarmee ook geregistreerd wordt', async () => {
    mockCheckTierGate.mockResolvedValue({ subscriptions: [], error: 'nee' })
    await POST(request())
    // Tier blokkeert, dus de credit-gate mag niet eens gelezen zijn.
    expect(mockCheckCreditBudget).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue(supabase())
    mockIsCloudAllowed.mockResolvedValue(true)
    mockCheckTierGate.mockResolvedValue(null)
    mockCheckCreditBudget.mockResolvedValue({ allowed: false, retryAfterSeconds: 1 })

    await POST(request())
    expect(mockCheckCreditBudget).toHaveBeenCalledWith(expect.anything(), 'user-1', 'report')
  })
})
