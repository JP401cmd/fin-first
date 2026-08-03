import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/onboarding/save-own-data — de poort om de AI-TAK, niet om
 * de route.
 *
 * Deze route deed nul gates terwijl hij via `extractFinancialData` → `getModel`
 * een externe LLM bereikt. De verleiding is dan om bovenaan `POST` een tier-gate
 * te zetten — maar dit is een OPSLAGroute: dat zou de complete onboarding
 * blokkeren voor iedereen zonder AI-abonnement. Daarom zit de poort om de
 * extractie-tak heen, net als de privé-gate die daar al zat.
 *
 * Deze suite bewijst precies dat onderscheid:
 *  - zonder 'ai'-abonnement wordt het model NIET aangeroepen,
 *  - maar de onboarding wordt WEL gewoon opgeslagen en afgerond (200 +
 *    `onboarding_completed: true`),
 *  - met abonnement + budget draait de extractie en wordt ze geregistreerd,
 *  - privé-modus blijft winnen (en kost geen tier-/credit-lezing).
 */

const mockIsCloudAllowed = vi.fn()
const mockCheckTierGate = vi.fn()
const mockCheckCreditBudget = vi.fn()
const mockRecordAiUsage = vi.fn()
const mockExtractFinancialData = vi.fn()

vi.mock('@/lib/ai/privacy-gate', () => ({
  isCloudAllowed: (...args: unknown[]) => mockIsCloudAllowed(...args),
}))
vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/credit-gate', () => ({
  checkCreditBudget: (...args: unknown[]) => mockCheckCreditBudget(...args),
}))
vi.mock('@/lib/ai-credits', () => ({
  recordAiUsage: (...args: unknown[]) => mockRecordAiUsage(...args),
}))
vi.mock('@/lib/ai/extract-financial-data', () => ({
  extractFinancialData: (...args: unknown[]) => mockExtractFinancialData(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/onboarding-bank-cleanup', () => ({
  deleteEmptyOnboardingBankAccounts: vi.fn(async () => undefined),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

interface Call {
  table: string
  op: string
  payload: unknown
}

/**
 * Chainable Supabase-dubbel: elke query-methode geeft zichzelf terug en het
 * geheel is awaitable naar `{ data: null, error: null }`. Genoeg voor deze route
 * (die overal defensief op ontbrekende rijen is) en het laat ons vastleggen
 * WELKE schrijfacties zijn gedaan — dat is wat we hier willen bewijzen.
 */
function buildSupabase(calls: Call[]) {
  const CHAIN = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not',
    'order', 'limit', 'maybeSingle', 'single',
  ] as const
  const WRITE = ['insert', 'update', 'upsert', 'delete'] as const

  const from = vi.fn((table: string) => {
    const node: Record<string, unknown> = {
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        resolve({ data: null, error: null }),
    }
    for (const m of CHAIN) node[m] = () => node
    for (const m of WRITE) {
      node[m] = (payload: unknown) => {
        calls.push({ table, op: m, payload })
        return node
      }
    }
    return node
  })

  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) }, from }
}

const NEWS_DESCRIPTION =
  'Ik heb ongeveer 20.000 euro spaargeld en een hypotheek van 250.000 euro.'

function request() {
  return {
    json: () =>
      Promise.resolve({
        identity: {
          full_name: 'Test Gebruiker',
          date_of_birth: '1985-04-01',
          household_type: 'solo',
          number_of_children: 0,
          net_monthly_income: 3500,
        },
        activeModules: ['nieuws'],
        newsDescription: NEWS_DESCRIPTION,
      }),
  } as unknown as Request
}

const EXTRACTION = {
  assets: [],
  debts: [],
  life_events: [],
  monthly_income_estimate: null,
  monthly_expenses_estimate: null,
  financial_context_remainder: '',
}

let calls: Call[]

/** Is de onboarding daadwerkelijk afgerond weggeschreven? */
function completedOnboarding(): boolean {
  return calls.some(
    (c) =>
      c.table === 'profiles' &&
      c.op === 'update' &&
      (c.payload as Record<string, unknown> | null)?.onboarding_completed === true,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  mockCreateClient.mockResolvedValue(buildSupabase(calls))
  mockIsCloudAllowed.mockResolvedValue(true)
  mockCheckTierGate.mockResolvedValue(null)
  mockCheckCreditBudget.mockResolvedValue({ allowed: true })
  mockExtractFinancialData.mockResolvedValue(EXTRACTION)
})

describe('POST /api/onboarding/save-own-data — AI-tak gegated, opslag niet', () => {
  it('ZONDER AI-ABONNEMENT: geen modelaanroep, maar de onboarding slaat wél op', async () => {
    mockCheckTierGate.mockResolvedValue({
      subscriptions: [],
      error: 'Deze functie vereist een AI abonnement',
    })

    const res = await POST(request())
    const body = await res.json()

    // 1. Het gat is dicht: geen extractie, dus geen externe LLM-call.
    expect(mockExtractFinancialData).not.toHaveBeenCalled()
    expect(mockRecordAiUsage).not.toHaveBeenCalled()

    // 2. En — net zo belangrijk — de rest van de onboarding is niet gesneuveld.
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(calls.some((c) => c.table === 'profiles' && c.op === 'upsert')).toBe(true)
    expect(completedOnboarding()).toBe(true)
  })

  it('MAANDBUDGET OP: geen modelaanroep, onboarding slaat wél op', async () => {
    mockCheckCreditBudget.mockResolvedValue({ allowed: false })

    const res = await POST(request())

    expect(mockExtractFinancialData).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(completedOnboarding()).toBe(true)
  })

  it('PRIVÉ-MODUS: geen modelaanroep en geen tier-/credit-lezing, opslag gaat door', async () => {
    mockIsCloudAllowed.mockResolvedValue(false)

    const res = await POST(request())

    expect(mockExtractFinancialData).not.toHaveBeenCalled()
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(mockCheckCreditBudget).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(completedOnboarding()).toBe(true)
  })

  it('MET abonnement en budget: extractie draait en wordt geregistreerd', async () => {
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockExtractFinancialData).toHaveBeenCalledTimes(1)
    expect(mockCheckCreditBudget).toHaveBeenCalledWith(expect.anything(), 'user-1', 'extraction')
    expect(mockRecordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'extraction')
  })
})
