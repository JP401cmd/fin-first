import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AiSubscriptionUpsell } from './ai-subscription-upsell'

describe('AiSubscriptionUpsell', () => {
  it('toont feature-neutrale kop + CTA naar het AI-aanbod (panel)', () => {
    render(<AiSubscriptionUpsell />)
    expect(screen.getByTestId('ai-upsell-headline')).toHaveTextContent('Dit kan met een AI-abonnement')
    expect(screen.queryByText(/betaalde functie/i)).toBeNull()
    const cta = screen.getByTestId('ai-upsell-cta')
    expect(cta).toHaveAttribute('href', '/mijn/account?addon=ai')
    // Geen belofte van directe afrekening (Polar is nog niet live).
    expect(cta).toHaveTextContent('Bekijk AI-abonnement')
    // Prijs komt uit de catalogus (€9) — geen los hardcoded getal.
    expect(screen.getByText(/€\s?9\/mnd/i)).toBeInTheDocument()
  })

  it('noemt de functie wanneer `feature` is meegegeven (inline)', () => {
    render(
      <AiSubscriptionUpsell
        variant="inline"
        feature="Je pensioenoverzicht (PDF) uitlezen"
        note="XML of JSON werkt zonder abonnement."
      />,
    )
    expect(screen.getByTestId('ai-upsell-headline')).toHaveTextContent(
      'Je pensioenoverzicht (PDF) uitlezen kan met een AI-abonnement',
    )
    expect(screen.getByText(/dit kan in de app met het AI-abonnement/i)).toBeInTheDocument()
    expect(screen.getByText('XML of JSON werkt zonder abonnement.')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Bekijk AI-abonnement/i })
    expect(cta).toHaveAttribute('href', '/mijn/account?addon=ai')
  })

  it('roept onNavigate aan bij klik op de CTA', () => {
    const onNavigate = vi.fn()
    render(<AiSubscriptionUpsell onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('ai-upsell-cta'))
    expect(onNavigate).toHaveBeenCalled()
  })
})
