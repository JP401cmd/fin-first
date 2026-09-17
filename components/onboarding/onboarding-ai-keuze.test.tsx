import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { OnboardingAiKeuze } from './onboarding-ai-keuze'
import { AI_FACT_HEADINGS, AI_SHARED_FACTS } from '@/lib/ai/privacy-facts'
import { BETA_ADDON_COPY, BETA_ADDON_ROUTE, BETA_ADDON_SAVE_ERROR } from '@/lib/beta-addons'

/**
 * Stap "Fin en je gegevens" (ADR 0155 + 0157): één schakelaar met de
 * beta-uitleg, geen voorselectie, de privacyverklaring pas als de schakelaar aan
 * staat. "Verder" legt de keuze vast vóór de flow doorgaat:
 *   aan → POST /api/beta/addon (toestemming + AI-add-on),
 *   uit → POST /api/consent/ai met withdrawn.
 */

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const verder = () => screen.getAllByRole('button', { name: /Verder|Opslaan/ })[0]
const schakelaar = () => screen.getByRole('switch', { name: BETA_ADDON_COPY.ai.schakelaar })

describe('OnboardingAiKeuze', () => {
  it('stelt de vraag met een schakelaar die uit staat en noemt de beta', () => {
    render(<OnboardingAiKeuze onNext={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: BETA_ADDON_COPY.ai.titel })).toBeInTheDocument()
    expect(schakelaar()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Straks wordt AI een abonnement/)).toBeInTheDocument()
    expect(verder()).toHaveTextContent('Verder zonder AI')
    expect(verder()).toBeEnabled()
  })

  it('toont de privacyverklaring pas als de schakelaar aan gaat', () => {
    render(<OnboardingAiKeuze onNext={() => {}} />)
    expect(screen.queryByRole('heading', { level: 2, name: AI_FACT_HEADINGS.shared })).toBeNull()

    fireEvent.click(schakelaar())
    expect(schakelaar()).toHaveAttribute('aria-checked', 'true')
    for (const kop of Object.values(AI_FACT_HEADINGS)) {
      expect(screen.getByRole('heading', { level: 2, name: kop })).toBeInTheDocument()
    }
    expect(screen.getByText(AI_SHARED_FACTS[0])).toBeInTheDocument()
    expect(verder()).toHaveTextContent('Verder met AI')
  })

  it('uit: haalt de add-on weg en legt "nee" vast via de beta-route, en gaat pas daarna door', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, tier: 'ai', active: false, subscriptions: [] }), { status: 200 }),
    )
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(verder())

    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(BETA_ADDON_ROUTE)
    expect(JSON.parse(String(init.body))).toEqual({ tier: 'ai', active: false, source: 'onboarding' })
  })

  it('aan: zet AI aan via de beta-route met source onboarding', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, tier: 'ai', active: true, subscriptions: ['ai'] }), { status: 200 }),
    )
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(schakelaar())
    fireEvent.click(verder())

    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(BETA_ADDON_ROUTE)
    expect(JSON.parse(String(init.body))).toEqual({ tier: 'ai', active: true, source: 'onboarding' })
  })

  it('toont de server-fout en gaat niet door bij een niet-ok antwoord', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'Er ging iets mis' }), { status: 500 }))
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(schakelaar())
    fireEvent.click(verder())

    expect(await screen.findByRole('alert')).toHaveTextContent('Er ging iets mis')
    expect(onNext).not.toHaveBeenCalled()
    expect(schakelaar()).toHaveAttribute('aria-checked', 'true')
  })

  it('toont de generieke tekst bij een netwerkfout', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(schakelaar())
    fireEvent.click(verder())
    expect(await screen.findByRole('alert')).toHaveTextContent(BETA_ADDON_SAVE_ERROR)
    expect(onNext).not.toHaveBeenCalled()
  })
})
