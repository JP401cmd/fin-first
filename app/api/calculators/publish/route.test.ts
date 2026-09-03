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
const mockAssertAiEnabled = vi.fn()
const mockCheckTierGate = vi.fn()
const mockCheckCreditBudget = vi.fn()
const mockRecordAiUsage = vi.fn()
const mockScreenPublishMetadata = vi.fn()

vi.mock('@/lib/ai/privacy-gate', () => ({
  isCloudAllowed: (...args: unknown[]) => mockIsCloudAllowed(...args),
  assertAiEnabled: (...args: unknown[]) => mockAssertAiEnabled(...args),
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
  // Kill-switch aan — M26 gate't hier vóór de privé-poort.
  mockAssertAiEnabled.mockResolvedValue(null)
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

/**
 * Screening-uitkomst → eerlijke fouttekst (UAT WF-REKEN-04-bug2).
 *
 * De screener geeft bij een AI-uitval fail-closed `ok: false` terug — net als
 * bij een inhoudelijke afkeuring. De route stuurde in beide gevallen de tekst
 * "niet geschikt om publiek te delen", terwijl bij een uitval over de inhoud
 * niets gezegd is. De sheet (components/future/publish-curation-sheet.tsx)
 * toont alleen `data.error`, dus die tekst moet zelf eerlijk zijn.
 */
const DEFINITIE = {
  name: 'Spaarbuffer opbouwen',
  inputs: [{ key: 'bedrag', label: 'Bedrag', kind: 'euro', default: 100 }],
  scenarios: [{ key: 'basis', label: 'Basis' }],
  outputs: [{ key: 'resultaat', label: 'Resultaat', formula: 'bedrag * 12', format: 'euro' }],
}

/** Bron-rij aanwezig; een publieke insert mag op een afgekeurd pad nooit vallen. */
function supabaseMetBron() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'calc-1',
        user_id: 'user-1',
        name: 'Spaarbuffer opbouwen',
        description: 'Hoeveel maanden buffer bouw je op?',
        definition: DEFINITIE,
      },
      error: null,
    }),
    insert: vi.fn(() => {
      throw new Error('insert mag niet geraakt worden bij een afgekeurde screening')
    }),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) },
    from: vi.fn(() => chain),
  }
}

describe('POST /api/calculators/publish — screening-uitkomst → fouttekst (WF-REKEN-04-bug2)', () => {
  beforeEach(() => {
    mockCreateClient.mockResolvedValue(supabaseMetBron())
    mockRecordAiUsage.mockResolvedValue(undefined)
  })

  it('AI-uitval (fail-closed, reason unavailable): de fail-closed-tekst is de error, niet "niet geschikt"', async () => {
    const ISSUE =
      'De publicatie-controle kon niet automatisch worden uitgevoerd. Probeer het later opnieuw.'
    mockScreenPublishMetadata.mockResolvedValue({ ok: false, reason: 'unavailable', issue: ISSUE })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error).toBe(ISSUE)
    expect(body.error).not.toContain('niet geschikt')
    // Fail-closed blijft: het model is wel gekost, maar er komt geen publieke rij.
    expect(mockRecordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'report')
  })

  it('echte content-afkeuring (reason content): "niet geschikt" blijft, issue/suggestion reizen mee', async () => {
    mockScreenPublishMetadata.mockResolvedValue({
      ok: false,
      reason: 'content',
      issue: 'De beschrijving noemt een concrete bank.',
      suggestion: 'Vervang de banknaam door "een online broker".',
    })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('De naam of beschrijving is niet geschikt om publiek te delen.')
    expect(body.issue).toBe('De beschrijving noemt een concrete bank.')
    expect(body.suggestion).toBe('Vervang de banknaam door "een online broker".')
  })

  it('de reden zit op de uitkomst zelf, niet op de issue-tekst: content met de fail-closed-zin blijft "niet geschikt"', async () => {
    // Zou de route de twee takken op de tekst uit elkaar houden, dan zou een
    // LLM-issue die toevallig zo klinkt de framing verliezen. De discriminator
    // maakt dat onmogelijk.
    mockScreenPublishMetadata.mockResolvedValue({
      ok: false,
      reason: 'content',
      issue: 'De publicatie-controle kon niet automatisch worden uitgevoerd. Probeer het later opnieuw.',
    })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toBe('De naam of beschrijving is niet geschikt om publiek te delen.')
  })
})
