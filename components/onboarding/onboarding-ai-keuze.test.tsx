import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { OnboardingAiKeuze } from './onboarding-ai-keuze'
import { AI_CONSENT_ROUTE } from '@/lib/ai/consent'
import {
  AI_CONSENT_OPTIONS,
  AI_CONSENT_QUESTION,
  AI_CONSENT_SAVE_ERROR,
  AI_FACT_HEADINGS,
  AI_LOCAL_VARIANT_FACT,
  AI_MASKING_NOTE,
  AI_REVERSIBLE_FACT,
  AI_SHARED_FACTS,
  APP_WITHOUT_AI_FACTS,
  aiFeaturesLostWithoutConsent,
} from '@/lib/ai/privacy-facts'

/**
 * Stap "Fin en je gegevens" (ADR 0155): geen voorselectie, "Verder" pas na een
 * keuze, de keuze gaat via POST /api/consent/ai en de flow loopt pas door na een
 * geslaagde schrijfactie.
 */

let fetchSpy: ReturnType<typeof vi.fn>

function okResponse(decision: 'granted' | 'withdrawn') {
  return new Response(
    JSON.stringify({
      ok: true,
      aiEnabled: decision === 'granted',
      consentAt: '2026-09-17T10:00:00.000Z',
      version: 'ai_cloud_v1',
    }),
    { status: 200 },
  )
}

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const verder = () => screen.getAllByRole('button', { name: /Verder|Opslaan/ })[0]
const tegel = (d: 'granted' | 'withdrawn') =>
  screen.getByRole('button', { name: new RegExp(AI_CONSENT_OPTIONS[d].keuze) })

describe('OnboardingAiKeuze', () => {
  it('stelt de vraag met twee gelijkwaardige tegels zonder voorselectie', () => {
    render(<OnboardingAiKeuze onNext={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: AI_CONSENT_QUESTION })).toBeInTheDocument()
    const groep = screen.getByRole('group', { name: AI_CONSENT_QUESTION })
    const tegels = within(groep).getAllByRole('button')
    expect(tegels).toHaveLength(2)
    for (const t of tegels) expect(t).toHaveAttribute('aria-pressed', 'false')
    // keuze · effect · waarom staan op de tegel
    expect(tegel('withdrawn').textContent).toContain(AI_CONSENT_OPTIONS.withdrawn.effect)
    expect(tegel('withdrawn').textContent).toContain(AI_CONSENT_OPTIONS.withdrawn.waarom)
    expect(verder()).toBeDisabled()
  })

  it('toont de feiten zonder klik: kop plus eerste regel per blok', () => {
    render(<OnboardingAiKeuze onNext={() => {}} />)
    for (const kop of Object.values(AI_FACT_HEADINGS)) {
      expect(screen.getByRole('heading', { level: 2, name: kop })).toBeInTheDocument()
    }
    expect(screen.getByText(AI_SHARED_FACTS[0])).toBeInTheDocument()
    expect(screen.getByText(AI_MASKING_NOTE)).toBeInTheDocument()
    expect(screen.getByText(AI_LOCAL_VARIANT_FACT)).toBeInTheDocument()
    expect(screen.getByText(AI_REVERSIBLE_FACT)).toBeInTheDocument()
    expect(screen.getByText(aiFeaturesLostWithoutConsent()[0].label)).toBeInTheDocument()
    expect(screen.getByText(APP_WITHOUT_AI_FACTS[0])).toBeInTheDocument()
  })

  it('klapt een lijst uit via een knop met aria-expanded', () => {
    render(<OnboardingAiKeuze onNext={() => {}} />)
    expect(screen.queryByText(AI_SHARED_FACTS[1])).not.toBeInTheDocument()
    const knop = screen.getByRole('button', { name: `Toon alle ${AI_SHARED_FACTS.length}` })
    expect(knop).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(knop)
    expect(knop).toHaveAttribute('aria-expanded', 'true')
    for (const item of AI_SHARED_FACTS) expect(screen.getByText(item)).toBeInTheDocument()
  })

  it('legt "nee" vast met source onboarding en gaat pas daarna door', async () => {
    fetchSpy.mockResolvedValue(okResponse('withdrawn'))
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)

    fireEvent.click(tegel('withdrawn'))
    expect(tegel('withdrawn')).toHaveAttribute('aria-pressed', 'true')
    expect(verder()).toBeEnabled()
    fireEvent.click(verder())

    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(AI_CONSENT_ROUTE)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'withdrawn', source: 'onboarding' })
  })

  it('legt "ja" vast als granted', async () => {
    fetchSpy.mockResolvedValue(okResponse('granted'))
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(tegel('granted'))
    fireEvent.click(verder())
    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'granted', source: 'onboarding' })
  })

  it('toont de server-fout en gaat niet door bij een niet-ok antwoord', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Er ging iets mis' }), { status: 500 }),
    )
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(tegel('granted'))
    fireEvent.click(verder())

    expect(await screen.findByRole('alert')).toHaveTextContent('Er ging iets mis')
    expect(onNext).not.toHaveBeenCalled()
    expect(tegel('granted')).toHaveAttribute('aria-pressed', 'true')
    expect(verder()).toBeEnabled()
  })

  it('toont de generieke tekst bij een netwerkfout', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const onNext = vi.fn()
    render(<OnboardingAiKeuze onNext={onNext} />)
    fireEvent.click(tegel('withdrawn'))
    fireEvent.click(verder())
    expect(await screen.findByRole('alert')).toHaveTextContent(AI_CONSENT_SAVE_ERROR)
    expect(onNext).not.toHaveBeenCalled()
  })
})
