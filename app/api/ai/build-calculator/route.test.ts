import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/ai/build-calculator — de weeklimiet velt de route niet meer zelf.
 *
 * De rem (10 generaties + 5 verfijningen per ISO-week) stond tot 3 augustus
 * 2026 als lezen → vergelijken → schrijven in `lib/calculator/rate-limit.ts`.
 * Tussen lezen en schrijven paste een tweede verzoek (ADR 0076). Sinds
 * migratie 20260803090000 doet één RPC de controle en de ophoging in hetzelfde
 * statement.
 *
 * Deze tests pinnen de kant die hiér te bewijzen valt: de route neemt de
 * uitkomst van de reservering ONVERANDERD over, reserveert vóór de dure
 * LLM-aanroep, en laat bij twijfel niets door. De atomariteit zelf zit in de
 * database en wordt door de SQL bewezen, niet door een unit-test.
 */

const { mockCreateClient, mockCheckTierGate, mockBuildCalculator, mockCheckAndIncrement } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn(),
    mockCheckTierGate: vi.fn(),
    mockBuildCalculator: vi.fn(),
    mockCheckAndIncrement: vi.fn(),
  }))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/require-tier', () => ({ checkTierGate: mockCheckTierGate }))
vi.mock('@/lib/ai/build-calculator', () => ({ buildCalculator: mockBuildCalculator }))
vi.mock('@/lib/calculator/rate-limit', () => ({ checkAndIncrement: mockCheckAndIncrement }))

import { POST } from './route'

const client = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
}

function request(body: Record<string, unknown> = { prompt: 'Wat kost mijn auto per maand?' }) {
  return new Request('https://app.trifinity.nl/api/ai/build-calculator', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const ALLOWED = { allowed: true, remaining: 9, limit: 10, used: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue(client)
  mockCheckTierGate.mockResolvedValue(null)
  mockCheckAndIncrement.mockResolvedValue(ALLOWED)
  mockBuildCalculator.mockResolvedValue({ ok: true, definition: { titel: 'Autokosten' } })
})

describe('POST /api/ai/build-calculator — weeklimiet', () => {
  it('reserveert precies één tik, met alleen de soort als argument', async () => {
    // Geen limiet en geen gebruiker-id in de aanroep: beide horen in de
    // database, anders kan de aanroeper de rem oprekken of op andermans teller
    // uitkomen.
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockCheckAndIncrement).toHaveBeenCalledTimes(1)
    expect(mockCheckAndIncrement.mock.calls[0].slice(1)).toEqual(['generation'])
  })

  it('kiest de verfijnings-teller zodra er een geldige refineFrom meekomt', async () => {
    await POST(
      request({
        prompt: 'Maak het simpeler',
        refineFrom: {
          name: 'Autokosten',
          inputs: [{ key: 'km_per_jaar', label: 'Kilometers per jaar', kind: 'number', default: 12000 }],
          scenarios: [{ key: 'basis', label: 'Basis' }],
          outputs: [{ key: 'totaal', label: 'Totaal', formula: 'km_per_jaar * 0.25', format: 'euro' }],
        },
      }),
    )

    expect(mockCheckAndIncrement.mock.calls[0].slice(1)).toEqual(['refinement'])
  })

  it('volgt de reservering en niet een eigen oordeel: geweigerd → 429, geen LLM-aanroep', async () => {
    mockCheckAndIncrement.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 })

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.ok).toBe(false)
    // De limiet in de tekst komt uit het antwoord van de database, niet uit een
    // constante in TypeScript.
    expect(body.error).toContain('10 van 10')
    expect(mockBuildCalculator).not.toHaveBeenCalled()
  })

  it('een mislukte reservering wordt een 500, geen 429 en zeker geen generatie', async () => {
    // "Je limiet is bereikt" zou hier liegen, en doorlaten zou de rem gratis
    // omzeilbaar maken voor wie de database weet te laten hikken.
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
    expect(mockBuildCalculator).not.toHaveBeenCalled()
    // Geen rauwe DB-fouttekst naar de client (ADR 0044).
    expect(JSON.stringify(body)).not.toContain('boom')
    consoleError.mockRestore()
  })

  it('reserveert vóór de LLM-aanroep, ook als die daarna stukloopt', async () => {
    // Anders is elke mislukte generatie gratis en kost herhalen niets, terwijl
    // de kosten bij de provider wél gemaakt zijn.
    mockBuildCalculator.mockResolvedValue({ ok: false, error: 'AI-output ongeldig' })

    const res = await POST(request())

    expect(res.status).toBe(422)
    expect(mockCheckAndIncrement).toHaveBeenCalledTimes(1)
  })

  it('reserveert niets wanneer de aanvraag al eerder sneuvelt (geen sessie, geen tier, lege vraag)', async () => {
    mockCheckTierGate.mockResolvedValue({ error: 'Geen AI-abonnement' })
    expect((await POST(request())).status).toBe(403)

    mockCheckTierGate.mockResolvedValue(null)
    expect((await POST(request({ prompt: '   ' }))).status).toBe(400)

    expect(mockCheckAndIncrement).not.toHaveBeenCalled()
  })
})
