import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/onboarding/extract — de ONTBREKENDE POORTEN.
 *
 * Waarom deze suite bestaat: deze route bereikt het model INDIREKT, via
 * `extractFinancialData` → `getModel`. Daardoor viel hij buiten elke scan die op
 * `getModel` in de route zelf zoekt, en stond er jarenlang niets tussen "ingelogd"
 * en een externe LLM-aanroep op onze rekening. Het comment bovenaan de route
 * beloofde de tier- en credit-gate letterlijk; ze bestonden alleen niet.
 *
 * Geborgd:
 *  - geen 'ai'-abonnement → 403 en GEEN modelaanroep (het bewijs van het gat);
 *  - maandbudget op → 429 met Retry-After en GEEN modelaanroep;
 *  - privé-modus wint van allebei (403 vóórdat tier/credit gelezen worden);
 *  - happy path → extractie draait én wordt als verbruik geregistreerd.
 */

const mockAssertCloudAllowed = vi.fn()
const mockCheckTierGate = vi.fn()
const mockCheckCreditBudget = vi.fn()
const mockRecordAiUsage = vi.fn()
const mockExtractFinancialData = vi.fn()

vi.mock('@/lib/ai/privacy-gate', () => ({
  assertCloudAllowed: (...args: unknown[]) => mockAssertCloudAllowed(...args),
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
vi.mock('@/lib/ai/extract-financial-data', () => ({
  extractFinancialData: (...args: unknown[]) => mockExtractFinancialData(...args),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

function supabase(user: { id: string } | null = USER) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } }
}

function request(body: unknown = { text: 'Ik heb 20.000 spaargeld en een hypotheek.' }) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

const EXTRACTION = {
  assets: [],
  debts: [],
  life_events: [],
  monthly_income_estimate: null,
  monthly_expenses_estimate: null,
  financial_context_remainder: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue(supabase())
  mockAssertCloudAllowed.mockResolvedValue(null)
  mockCheckTierGate.mockResolvedValue(null)
  mockCheckCreditBudget.mockResolvedValue({ allowed: true, retryAfterSeconds: 3600 })
  mockExtractFinancialData.mockResolvedValue(EXTRACTION)
})

describe('POST /api/onboarding/extract — poorten vóór het model', () => {
  it('401 zonder sessie, zonder enige gate-lezing', async () => {
    mockCreateClient.mockResolvedValue(supabase(null))

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(mockAssertCloudAllowed).not.toHaveBeenCalled()
    expect(mockExtractFinancialData).not.toHaveBeenCalled()
  })

  it('ZONDER AI-ABONNEMENT: 403 en het model wordt niet aangeroepen', async () => {
    mockCheckTierGate.mockResolvedValue({
      subscriptions: [],
      error: 'Deze functie vereist een AI abonnement',
    })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe('Deze functie vereist een AI abonnement')
    // Dít is het dichtgezette gat: geen extractie, dus geen externe LLM-call.
    expect(mockExtractFinancialData).not.toHaveBeenCalled()
    // En geen verbruiksregistratie voor een call die nooit plaatsvond.
    expect(mockRecordAiUsage).not.toHaveBeenCalled()
  })

  it('maandbudget op: 429 met Retry-After, geen modelaanroep', async () => {
    mockCheckCreditBudget.mockResolvedValue({ allowed: false, retryAfterSeconds: 12345 })

    const res = await POST(request())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('12345')
    expect(mockExtractFinancialData).not.toHaveBeenCalled()
  })

  it('privé-modus wint: 403 vóórdat tier- of credit-gate gelezen worden', async () => {
    mockAssertCloudAllowed.mockResolvedValue(
      Response.json({ error: 'Privé-modus actief', code: 'privacy_mode_active' }, { status: 403 }),
    )

    const res = await POST(request())

    expect(res.status).toBe(403)
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockCheckCreditBudget).not.toHaveBeenCalled()
    expect(mockExtractFinancialData).not.toHaveBeenCalled()
  })

  it('met abonnement en budget: extractie draait en wordt geregistreerd', async () => {
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockExtractFinancialData).toHaveBeenCalledTimes(1)
    expect(mockRecordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'extraction')
  })

  it('de credit-gate leest dezelfde feature-sleutel als de registratie', async () => {
    await POST(request())

    expect(mockCheckCreditBudget).toHaveBeenCalledWith(expect.anything(), 'user-1', 'extraction')
  })
})
