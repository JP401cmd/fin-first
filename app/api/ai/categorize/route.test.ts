import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/ai/categorize — de server-side privé-modus-gate (FR-1.2).
 *
 * Borgt:
 *  - privacy_mode=true → 403 + code 'privacy_mode_active', ZONDER dat de tier-/
 *    credit-gate, getModel, generateObject of de credit-afboeking geraakt worden
 *    (bewijst de volgorde: privé-modus vóór tier/credit/model).
 *  - privacy_mode=false → gate passeert, bestaand cloud-gedrag ongewijzigd (200).
 *  - kolom ontbreekt (pre-migratie: select geeft geen rij) → fail-open naar
 *    bestaand gedrag, route breekt niet.
 *  - 401 zonder sessie → geen enkele profielquery (geen `from`-aanroep).
 */

// ── Mocks van de omliggende plumbing (blijft buiten scope van deze gate-test) ──
const mockCheckTierGate = vi.fn()
const mockCheckCreditBudget = vi.fn()
const mockCreditLimitMessage = vi.fn((..._args: unknown[]) => 'limiet')
const mockGetModel = vi.fn()
const mockGenerateObject = vi.fn()
const mockRecordAiUsage = vi.fn()

vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/credit-gate', () => ({
  checkCreditBudget: (...args: unknown[]) => mockCheckCreditBudget(...args),
  creditLimitMessage: (...args: unknown[]) => mockCreditLimitMessage(...args),
}))
vi.mock('@/lib/ai/config', () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
  AIConfigError: class AIConfigError extends Error {},
}))
vi.mock('@/lib/ai-credits', () => ({
  recordAiUsage: (...args: unknown[]) => mockRecordAiUsage(...args),
}))
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

// Eén leaf-budget zodat de happy-path een aanbiedbare optie heeft.
const BUDGET_ROWS = [
  {
    id: 'b1',
    parent_id: null,
    name: 'Boodschappen',
    slug: 'boodschappen',
    budget_type: 'expense',
    description: null,
    ownership: 'personal',
  },
]

type SupaOpts = {
  user?: { id: string } | null
  privacyRow?: { privacy_mode?: boolean | null } | null
  budgetRows?: unknown[]
  budgetError?: unknown
}

function buildSupabase({ user = USER, privacyRow = null, budgetRows = BUDGET_ROWS, budgetError = null }: SupaOpts) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: privacyRow, error: null }),
          }),
        }),
      }
    }
    if (table === 'budgets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: budgetRows, error: budgetError }),
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

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

const TX = [{ import_hash: 'h1', description: 'Albert Heijn', amount: -42.5 }]

beforeEach(() => {
  mockCheckTierGate.mockReset().mockResolvedValue(null)
  mockCheckCreditBudget.mockReset().mockResolvedValue({ allowed: true })
  mockCreditLimitMessage.mockReset().mockReturnValue('limiet')
  mockGetModel.mockReset().mockResolvedValue({ id: 'fake-model' })
  mockGenerateObject.mockReset().mockResolvedValue({
    object: { categorizations: [{ budget_slug: 'boodschappen', confidence: 0.9, reasoning: 'AH' }] },
  })
  mockRecordAiUsage.mockReset().mockResolvedValue(undefined)
  mockCreateClient.mockReset()
})

describe('POST /api/ai/categorize — privé-modus-gate', () => {
  it('privacy_mode=true → 403 + code, zonder tier/credit/model/afboeking', async () => {
    const supabase = buildSupabase({ privacyRow: { privacy_mode: true } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(403)
    // De melding komt sinds ADR 0078 uit de gedeelde helper en noemt de GROEP,
    // niet de losse functie — dat is ook wat de gebruiker op /mijn/privacy ziet
    // staan en dus moet aanpassen. De foutcode blijft ongewijzigd, want daar
    // herkent de client de privé-blokkade aan.
    const body = (await res.json()) as { error: string; code?: string }
    expect(body.code).toBe('privacy_mode_active')
    expect(body.error).toContain('Privé-modus actief')
    expect(body.error.toLowerCase()).toContain('transacties')
    // Volgorde-bewijs: privé-modus blokkeert vóór tier/credit/model.
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockCheckCreditBudget).not.toHaveBeenCalled()
    expect(mockGetModel).not.toHaveBeenCalled()
    expect(mockGenerateObject).not.toHaveBeenCalled()
    expect(mockRecordAiUsage).not.toHaveBeenCalled()
  })

  it('privacy_mode=false → gate passeert, 200 + resultaten (bestaand gedrag)', async () => {
    const supabase = buildSupabase({ privacyRow: { privacy_mode: false } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results[0]).toMatchObject({ import_hash: 'h1', budget_slug: 'boodschappen', budget_id: 'b1' })
    expect(mockCheckTierGate).toHaveBeenCalled()
    expect(mockGetModel).toHaveBeenCalledWith(supabase, 'categorisatie')
    expect(mockRecordAiUsage).toHaveBeenCalled()
  })

  it('kolom ontbreekt (pre-migratie, geen rij) → fail-open naar bestaand gedrag', async () => {
    // maybeSingle geeft data:null (kolom bestaat nog niet / geen rij) → privacyMode=false.
    const supabase = buildSupabase({ privacyRow: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(200)
    expect(mockGetModel).toHaveBeenCalled()
  })

  it('401 zonder sessie → geen profielquery', async () => {
    const supabase = buildSupabase({ user: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(401)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })
})

// V-002: de client herkent elke niet-beschikbare AI-functie aan een stabiele code.
describe('POST /api/ai/categorize — weigeringscontract (V-002)', () => {
  it('geen AI-abonnement → 403 ai_subscription, zonder model', async () => {
    mockCreateClient.mockResolvedValue(buildSupabase({}))
    mockCheckTierGate.mockResolvedValue({ subscriptions: [], error: 'Deze functie vereist een AI abonnement' })

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Dit kan in de app met een AI-abonnement.', code: 'ai_subscription' })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('creditlimiet → 429 ai_credit_limit met de servertekst en Retry-After', async () => {
    mockCreateClient.mockResolvedValue(buildSupabase({}))
    mockCheckCreditBudget.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })

    const res = await POST(postRequest({ transactions: TX }))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(await res.json()).toEqual({ error: 'limiet', code: 'ai_credit_limit' })
  })

  it('AIConfigError → 422 ai_unavailable, zonder beheerderstaal in de body', async () => {
    mockCreateClient.mockResolvedValue(buildSupabase({}))
    const err = new Error('Anthropic API key is niet geconfigureerd. Stel een API key in via Beheer.')
    err.name = 'AIConfigError'
    mockGetModel.mockRejectedValue(err)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(postRequest({ transactions: TX }))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.code).toBe('ai_unavailable')
    expect(JSON.stringify(body)).not.toMatch(/API key|Beheer/)
    log.mockRestore()
  })
})
