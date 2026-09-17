import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }) }))

import { AiSubscriptionUpsell } from './ai-subscription-upsell'

/**
 * AiSubscriptionUpsell in de beta (ADR 0157): geen verwijzing naar een nog niet
 * af te nemen abonnement, maar de keuze zelf. De CTA opent de popup; de
 * privacyverklaring verschijnt pas als de schakelaar aan gaat, en "AI aanzetten"
 * schrijft via POST /api/beta/addon.
 */
describe('AiSubscriptionUpsell (beta)', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
    vi.restoreAllMocks()
  })

  it('toont feature-neutrale kop, de beta-uitleg met prijs uit de catalogus en een knop', () => {
    render(<AiSubscriptionUpsell />)
    expect(screen.getByTestId('ai-upsell-headline')).toHaveTextContent('Dit werkt als je AI aanzet')
    expect(screen.getByText(/Straks wordt AI een abonnement van €\s?9 per maand/)).toBeInTheDocument()
    const cta = screen.getByTestId('ai-upsell-cta')
    expect(cta.tagName).toBe('BUTTON')
    expect(cta).toHaveTextContent('AI aanzetten')
  })

  it('noemt de functie en de note (inline)', () => {
    render(
      <AiSubscriptionUpsell variant="inline" feature="Je pensioenoverzicht (PDF) uitlezen" note="XML of JSON werkt altijd." />,
    )
    expect(screen.getByTestId('ai-upsell-headline')).toHaveTextContent(
      'Je pensioenoverzicht (PDF) uitlezen werkt als je AI aanzet',
    )
    expect(screen.getByText('XML of JSON werkt altijd.')).toBeInTheDocument()
  })

  it('popup: privacy pas na de schakelaar, aanzetten schrijft ai + interstitial', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, tier: 'ai', active: true, subscriptions: ['ai'] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AiSubscriptionUpsell variant="inline" feature="Chatten met Fin" />)
    fireEvent.click(screen.getByTestId('ai-upsell-cta'))

    const dialog = await screen.findByTestId('beta-addon-dialog-ai')
    expect(dialog).toBeInTheDocument()
    // Geen voorselectie, geen privacyverklaring zolang de schakelaar uit staat.
    const schakelaar = screen.getByRole('switch')
    expect(schakelaar).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('Wat wordt gedeeld')).toBeNull()
    const bevestig = screen.getAllByRole('button', { name: /^AI aanzetten/ }).at(-1)!
    expect(bevestig).toBeDisabled()

    fireEvent.click(schakelaar)
    expect(screen.getByText('Wat wordt gedeeld')).toBeInTheDocument()
    expect(bevestig).not.toBeDisabled()

    fireEvent.click(bevestig)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/beta/addon')
    expect(JSON.parse(init.body)).toEqual({ tier: 'ai', active: true, source: 'interstitial' })
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    // Geen tweede "AI aanzetten"-knop (die een tweede toestemming zou vastleggen), maar een bevestiging.
    expect(await screen.findByTestId('ai-upsell-activated')).toHaveTextContent('AI staat aan')
    expect(screen.queryByTestId('ai-upsell-cta')).toBeNull()
    vi.unstubAllGlobals()
  })
})
