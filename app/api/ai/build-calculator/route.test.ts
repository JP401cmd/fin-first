import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/ai/build-calculator — de weeklimiet velt de route niet zelf, en
 * een mislukte generatie kost geen slot.
 *
 * De rem (10 generaties + 5 verfijningen per ISO-week) stond tot 3 augustus
 * 2026 als lezen → vergelijken → schrijven in `lib/calculator/rate-limit.ts`.
 * Tussen lezen en schrijven paste een tweede verzoek (ADR 0076). Sinds
 * migratie 20260803090000 doet één RPC de controle en de ophoging in hetzelfde
 * statement.
 *
 * Sinds ADR 0181 (R6) reserveert de route dat slot pas NÁ een geslaagde
 * generatie: een mislukte generatie telt niet mee voor de weeklimiet. Vooraf
 * leest de route alleen de stand (`getUsage`, geen tik) zodat wie al aan zijn
 * limiet zit een 429 krijgt zónder dat er een LLM-aanroep vertrekt.
 *
 * Deze tests pinnen de kant die hiér te bewijzen valt: de volgorde
 * lezen → genereren → reserveren, dat de route de uitkomst van de reservering
 * ONVERANDERD overneemt, en dat ze bij twijfel niets doorlaat. De atomariteit
 * zelf zit in de database en wordt door de SQL bewezen, niet door een
 * unit-test.
 */

const {
  mockCreateClient,
  mockCheckTierGate,
  mockBuildCalculator,
  mockCheckAndIncrement,
  mockGetUsage,
  mockCheckCreditBudget,
  mockRecordAiUsage,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCheckTierGate: vi.fn(),
  mockBuildCalculator: vi.fn(),
  mockCheckAndIncrement: vi.fn(),
  mockGetUsage: vi.fn(),
  mockCheckCreditBudget: vi.fn(),
  mockRecordAiUsage: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/require-tier', () => ({ checkTierGate: mockCheckTierGate }))
vi.mock('@/lib/ai/build-calculator', () => ({ buildCalculator: mockBuildCalculator }))
vi.mock('@/lib/calculator/rate-limit', () => ({
  checkAndIncrement: mockCheckAndIncrement,
  getUsage: mockGetUsage,
}))

vi.mock('@/lib/ai/credit-gate', () => ({
  checkCreditBudget: mockCheckCreditBudget,
  creditLimitMessage: () => 'Je hebt je maandelijkse AI-limiet bereikt.',
}))
vi.mock('@/lib/ai-credits', () => ({ recordAiUsage: mockRecordAiUsage }))

import { POST } from './route'

/**
 * De privé-gate (lib/ai/privacy-gate.ts) wordt bewust NIET gemockt: hij is de
 * beslissende laag vóór de modelcall, dus die willen we hier echt uitvoeren.
 * Daarvoor heeft de client-stub een `from`-keten nodig die het profielrijtje
 * teruggeeft — `profiles.select(...).eq(...).maybeSingle()`.
 */
function profileRow(row: { privacy_mode?: boolean; ai_execution_prefs?: Record<string, string> }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      })),
    })),
  }
}

const client = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
  from: vi.fn(() => profileRow({ privacy_mode: false, ai_execution_prefs: {} })),
}

function request(body: Record<string, unknown> = { prompt: 'Wat kost mijn auto per maand?' }) {
  return new Request('https://app.trifinity.nl/api/ai/build-calculator', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const REFINE_FROM = {
  name: 'Autokosten',
  inputs: [{ key: 'km_per_jaar', label: 'Kilometers per jaar', kind: 'number', default: 12000 }],
  scenarios: [{ key: 'basis', label: 'Basis' }],
  outputs: [{ key: 'totaal', label: 'Totaal', formula: 'km_per_jaar * 0.25', format: 'euro' }],
}

const ALLOWED = { allowed: true, remaining: 9, limit: 10, used: 1 }
const ROOM = {
  generations: 1,
  refinements: 0,
  maxGenerations: 10,
  maxRefinements: 5,
  weekStart: '2026-09-21',
}

/** Volgorde van de mock-aanroepen, op naam — bewijst "genereren vóór reserveren". */
function callOrder(): string[] {
  return [
    ...mockBuildCalculator.mock.invocationCallOrder.map((n) => [n, 'build'] as const),
    ...mockCheckAndIncrement.mock.invocationCallOrder.map((n) => [n, 'reserve'] as const),
    ...mockGetUsage.mock.invocationCallOrder.map((n) => [n, 'read'] as const),
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name)
}

beforeEach(() => {
  vi.clearAllMocks()
  client.from.mockImplementation(() => profileRow({ privacy_mode: false, ai_execution_prefs: {} }))
  mockCreateClient.mockResolvedValue(client)
  mockCheckTierGate.mockResolvedValue(null)
  mockGetUsage.mockResolvedValue(ROOM)
  mockCheckAndIncrement.mockResolvedValue(ALLOWED)
  mockBuildCalculator.mockResolvedValue({ ok: true, definition: { titel: 'Autokosten' } })
  mockCheckCreditBudget.mockResolvedValue({ allowed: true, used: 0, budget: 100, remaining: 100, resetDate: '2026-10-01T00:00:00.000Z', retryAfterSeconds: 60 })
  mockRecordAiUsage.mockResolvedValue(undefined)
})

describe('POST /api/ai/build-calculator — weeklimiet', () => {
  it('leest de stand, genereert, en reserveert pas daarna precies één tik met alleen de soort als argument', async () => {
    // Geen limiet en geen gebruiker-id in de aanroep: beide horen in de
    // database, anders kan de aanroeper de rem oprekken of op andermans teller
    // uitkomen.
    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, definition: { titel: 'Autokosten' } })
    expect(callOrder()).toEqual(['read', 'build', 'reserve'])
    expect(mockCheckAndIncrement).toHaveBeenCalledTimes(1)
    expect(mockCheckAndIncrement.mock.calls[0].slice(1)).toEqual(['generation'])
  })

  it('kiest de verfijnings-teller zodra er een geldige refineFrom meekomt', async () => {
    await POST(request({ prompt: 'Maak het simpeler', refineFrom: REFINE_FROM }))

    expect(mockCheckAndIncrement.mock.calls[0].slice(1)).toEqual(['refinement'])
  })

  it('een mislukte generatie kost geen weekslot: 422, geen tik op de teller (ADR 0181)', async () => {
    mockBuildCalculator.mockResolvedValue({ ok: false, error: 'AI-output ongeldig', code: 'ai_unknown' })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(mockCheckAndIncrement, 'een mislukte generatie mag de weeklimiet niet opsouperen').not.toHaveBeenCalled()
    // Platte envelope (ADR 0044): geen `ok`-veld, wel de gebruikerstekst + code.
    expect(body).toEqual({ error: 'AI-output ongeldig', code: 'ai_unknown' })
    // Het 422-pad is server-side zichtbaar met een grep-bare tag.
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(String(consoleWarn.mock.calls[0][0])).toContain('[build-calculator:POST]')
    consoleWarn.mockRestore()
  })

  it('elke LLM-poging telt tegen het creditbudget, ook een mislukte (kostenrem naast ADR 0181)', async () => {
    mockBuildCalculator.mockResolvedValue({ ok: false, error: 'AI-output ongeldig', code: 'ai_unknown' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await POST(request())
    expect(mockRecordAiUsage).toHaveBeenCalledWith(client, 'user-1', 'report')

    mockBuildCalculator.mockResolvedValue({ ok: true, definition: { titel: 'Autokosten' } })
    mockRecordAiUsage.mockClear()
    await POST(request())
    expect(mockRecordAiUsage).toHaveBeenCalledTimes(1)
  })

  it('maand-creditbudget op: 429 vóór de LLM-aanroep, niets geboekt, geen tik', async () => {
    mockCheckCreditBudget.mockResolvedValue({ allowed: false, used: 100, budget: 100, remaining: 0, resetDate: '2026-10-01T00:00:00.000Z', retryAfterSeconds: 60 })
    const res = await POST(request())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(mockBuildCalculator).not.toHaveBeenCalled()
    expect(mockRecordAiUsage).not.toHaveBeenCalled()
    expect(mockCheckAndIncrement).not.toHaveBeenCalled()
  })

  it('wie al aan zijn limiet zit krijgt 429 vóór de LLM-aanroep, met de limiet uit de database', async () => {
    mockGetUsage.mockResolvedValue({ ...ROOM, generations: 10 })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.ok).toBeUndefined()
    expect(body.code).toBe('week_limit')
    // De limiet in de tekst komt uit het antwoord van de database, niet uit een
    // constante in TypeScript.
    expect(body.error).toContain('10 van 10')
    expect(mockBuildCalculator).not.toHaveBeenCalled()
    expect(mockCheckAndIncrement).not.toHaveBeenCalled()
  })

  it('de vooraf-lezing kijkt naar de juiste teller: verfijningen vol, generaties niet', async () => {
    mockGetUsage.mockResolvedValue({ ...ROOM, refinements: 5 })

    expect((await POST(request({ prompt: 'Maak het simpeler', refineFrom: REFINE_FROM }))).status).toBe(429)
    expect(mockBuildCalculator).not.toHaveBeenCalled()

    expect((await POST(request())).status).toBe(200)
    expect(mockBuildCalculator).toHaveBeenCalledTimes(1)
  })

  it('een leesfout op de stand wordt een 500, geen 429 en zeker geen generatie', async () => {
    mockGetUsage.mockResolvedValue({ ...ROOM, error: { message: 'boom' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(mockBuildCalculator).not.toHaveBeenCalled()
    // Geen rauwe DB-fouttekst naar de client (ADR 0044).
    expect(JSON.stringify(body)).not.toContain('boom')
    consoleError.mockRestore()
  })

  it('volgt de reservering en niet een eigen oordeel: geweigerd ná de generatie → 429, definitie niet uitgeleverd', async () => {
    // Het venster tussen lezen en reserveren (twee gelijktijdige verzoeken op
    // 9 van 10): de database houdt de limiet hard, de route levert dan geen
    // definitie uit — de rem is nooit door de route zelf op te rekken.
    mockCheckAndIncrement.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toContain('10 van 10')
    expect(JSON.stringify(body)).not.toContain('Autokosten')
  })

  it('een mislukte reservering ná de generatie wordt een 500, geen 200', async () => {
    // Doorlaten zou de rem gratis omzeilbaar maken voor wie de database weet
    // te laten hikken; "je limiet is bereikt" zou liegen.
    mockCheckAndIncrement.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 0,
      used: 0,
      error: { message: 'boom' },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('boom')
    expect(JSON.stringify(body)).not.toContain('Autokosten')
    consoleError.mockRestore()
  })

  // ── Privé-modus: fail-closed ───────────────────────────────────────────────
  //
  // De belofte is hard: staat de groep 'rapporten' op lokaal, dan mag er niets
  // naar een AI-leverancier. Deze twee tests bewijzen dat op de beslissende
  // laag — de server — en niet alleen in de client die de keuze óók maakt.

  it('privé-modus blokkeert vóór de generatie: 403, geen LLM-aanroep, geen tik op de teller', async () => {
    client.from.mockImplementation(() => profileRow({ privacy_mode: true, ai_execution_prefs: {} }))

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('privacy_mode_active')
    expect(mockBuildCalculator, 'er mag geen enkele modelcall vertrekken').not.toHaveBeenCalled()
    expect(mockGetUsage).not.toHaveBeenCalled()
    expect(
      mockCheckAndIncrement,
      'een geblokkeerde aanvraag mag de weeklimiet niet opsouperen',
    ).not.toHaveBeenCalled()
  })

  it('een per-groep override wint van de hoofdschakelaar', async () => {
    // Hoofdschakelaar staat op lokaal, maar deze gebruiker wil rekenhulpen
    // bewust wél via de cloud — dan hoort de route gewoon te werken.
    client.from.mockImplementation(() =>
      profileRow({ privacy_mode: true, ai_execution_prefs: { rapporten: 'cloud' } }),
    )

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockBuildCalculator).toHaveBeenCalledTimes(1)
  })

  it('reserveert niets wanneer de aanvraag al eerder sneuvelt (geen tier, lege vraag, te lange vraag)', async () => {
    mockCheckTierGate.mockResolvedValue({ error: 'Geen AI-abonnement' })
    const tier = await POST(request())
    expect(tier.status).toBe(403)
    // Platte envelope met code, zodat de client de upsell-affordance kiest.
    expect(await tier.json()).toMatchObject({ code: 'ai_subscription' })

    mockCheckTierGate.mockResolvedValue(null)
    const leeg = await POST(request({ prompt: '   ' }))
    expect(leeg.status).toBe(400)
    expect(await leeg.json()).toEqual({ error: 'Geef een vraag op.' })

    expect((await POST(request({ prompt: 'x'.repeat(501) }))).status).toBe(400)

    expect(mockGetUsage).not.toHaveBeenCalled()
    expect(mockCheckAndIncrement).not.toHaveBeenCalled()
    expect(mockBuildCalculator).not.toHaveBeenCalled()
  })
})
