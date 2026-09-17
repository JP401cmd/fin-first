import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AI_CONSENT_ROUTE } from '@/lib/ai/consent'
import { AiConsentInterstitial } from './ai-consent-interstitial'
import {
  AI_CONSENT_INTRO,
  AI_CONSENT_OPTIONS,
  AI_CONSENT_QUESTION,
  AI_CONSENT_SAVE_ERROR,
  AI_FACT_HEADINGS,
} from '@/lib/ai/privacy-facts'

/**
 * De eenmalige AI-keuze-overlay (ADR 0155): niet wegklikbaar, twee gelijkwaardige
 * knoppen, sluit alleen na een geslaagde POST met source `interstitial`.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/overzicht',
}))

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  router.refresh = vi.fn()
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const knop = (d: 'granted' | 'withdrawn') =>
  screen.getByRole('button', { name: AI_CONSENT_OPTIONS[d].keuze })

describe('AiConsentInterstitial', () => {
  it('rendert niets zolang de server geen keuze vraagt', () => {
    render(<AiConsentInterstitial open={false} />)
    expect(screen.queryByText(AI_CONSENT_QUESTION)).not.toBeInTheDocument()
  })

  it('toont vraag, intro, feiten en twee knoppen met hun effect', async () => {
    render(<AiConsentInterstitial open />)
    expect(await screen.findByRole('heading', { name: AI_CONSENT_QUESTION })).toBeInTheDocument()
    expect(screen.getByText(AI_CONSENT_INTRO)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: AI_FACT_HEADINGS.lost })).toBeInTheDocument()
    for (const d of ['granted', 'withdrawn'] as const) {
      expect(knop(d)).toHaveAccessibleDescription(
        `${AI_CONSENT_OPTIONS[d].effect} ${AI_CONSENT_OPTIONS[d].waarom}`,
      )
    }
  })

  it('laat zich niet wegklikken met Escape en toont géén sluitknop (een dode X is een gebroken belofte)', async () => {
    render(<AiConsentInterstitial open />)
    await screen.findByRole('heading', { name: AI_CONSENT_QUESTION })
    expect(screen.queryByRole('button', { name: 'Sluiten' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getByRole('heading', { name: AI_CONSENT_QUESTION })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('legt de keuze vast met source interstitial, sluit en ververst', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, aiEnabled: false, consentAt: '2026-09-17T10:00:00.000Z', version: 'ai_cloud_v1' }),
        { status: 200 },
      ),
    )
    render(<AiConsentInterstitial open />)
    await screen.findByRole('heading', { name: AI_CONSENT_QUESTION })
    fireEvent.click(knop('withdrawn'))

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(AI_CONSENT_ROUTE)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'withdrawn', source: 'interstitial' })
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: AI_CONSENT_QUESTION })).not.toBeInTheDocument(),
    )
  })

  it('blijft open met een melding als het vastleggen mislukt', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AiConsentInterstitial open />)
    await screen.findByRole('heading', { name: AI_CONSENT_QUESTION })
    fireEvent.click(knop('granted'))

    expect(await screen.findByRole('alert')).toHaveTextContent(AI_CONSENT_SAVE_ERROR)
    expect(router.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: AI_CONSENT_QUESTION })).toBeInTheDocument()
    expect(knop('granted')).toBeEnabled()
  })
})
