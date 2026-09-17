import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiPrivacySettings, consentStatusLine } from './ai-privacy-settings'
import { AI_CONSENT_ROUTE } from '@/lib/ai/consent'
import { AI_CONSENT_SAVE_ERROR } from '@/lib/ai/privacy-facts'

// Component leest ai_enabled + financial_context + de consent-stempel via de
// supabase-client (eigen-rij prefs). De AI-schakelaar schrijft via
// POST /api/consent/ai (ADR 0155); de financiële toelichting nog client-direct.
const updateSpy = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

// Eén client-object, net als de browser-singleton van `createBrowserClient`:
// een vers object per aanroep laat het `[supabase]`-effect na elke render
// opnieuw laden en zet de schakelaar terug op de gemockte DB-waarde.
vi.mock('@/lib/supabase/client', () => {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: {
              ai_enabled: true,
              financial_context: 'zzp in de IT',
              ai_consent_at: '2026-09-01T09:00:00.000Z',
              ai_consent_version: 'ai_cloud_v1',
            },
          }),
        }),
      }),
      update: updateSpy,
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }
  return { createClient: () => client }
})

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const switchKnop = async () => {
  const toggle = await screen.findByRole('switch', { name: /AI-features/i })
  await waitFor(() => expect(toggle).toBeEnabled())
  return toggle
}

describe('consentStatusLine', () => {
  it('noemt datum en versie van een vastgelegde keuze', () => {
    expect(consentStatusLine('2026-09-01T09:00:00.000Z', 'ai_cloud_v1')).toBe(
      'Keuze vastgelegd op 1 september 2026 · versie ai_cloud_v1',
    )
  })

  it('meldt dat er nog geen keuze is', () => {
    expect(consentStatusLine(null, null)).toBe(
      'Nog geen keuze vastgelegd — de vraag staat open.',
    )
  })
})

describe('AiPrivacySettings', () => {
  it('toont AI-toggle en transparantie-blokken', async () => {
    render(<AiPrivacySettings />)
    await screen.findByText('AI-features inschakelen')
    expect(screen.getByText('Wat wordt gedeeld')).toBeTruthy()
    expect(screen.getByText('Wat wordt gemaskeerd')).toBeTruthy()
    expect(screen.getByText('Hoe je data wordt verwerkt')).toBeTruthy()
  })

  it('laadt opgeslagen financiële toelichting in de textarea', async () => {
    render(<AiPrivacySettings />)
    await waitFor(() => {
      const ta = screen.getByPlaceholderText(/zzp'er in de IT/i) as HTMLTextAreaElement
      expect(ta.value).toBe('zzp in de IT')
    })
  })

  it('toont datum en versie van de vastgelegde keuze', async () => {
    render(<AiPrivacySettings />)
    expect(
      await screen.findByText('Keuze vastgelegd op 1 september 2026 · versie ai_cloud_v1'),
    ).toBeInTheDocument()
  })

  it('AI-toggle legt de intrekking vast via de consent-route, niet client-direct', async () => {
    updateSpy.mockClear()
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          aiEnabled: false,
          consentAt: '2026-09-17T10:00:00.000Z',
          version: 'ai_cloud_v1',
        }),
        { status: 200 },
      ),
    )
    render(<AiPrivacySettings />)
    const toggle = await switchKnop()
    fireEvent.click(toggle)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(AI_CONSENT_ROUTE)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'withdrawn', source: 'mijn-privacy' })
    expect(
      await screen.findByText('Keuze vastgelegd op 17 september 2026 · versie ai_cloud_v1'),
    ).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('draait de schakelaar terug en meldt het als het vastleggen mislukt', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Er ging iets mis' }), { status: 500 }))
    render(<AiPrivacySettings />)
    const toggle = await switchKnop()
    fireEvent.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent('Er ging iets mis')
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  })

  it('valt terug op de generieke fouttekst bij een netwerkfout', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AiPrivacySettings />)
    fireEvent.click(await switchKnop())
    expect(await screen.findByRole('alert')).toHaveTextContent(AI_CONSENT_SAVE_ERROR)
  })

  it('opent de volledige privacyverklaring in een sheet', async () => {
    render(<AiPrivacySettings />)
    fireEvent.click(screen.getByText('Volledige privacyverklaring'))
    await waitFor(() => expect(screen.getByText(/Welke gegevens verzamelen we/i)).toBeTruthy())
  })
})
