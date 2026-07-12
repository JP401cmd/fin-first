import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AiSubscriptionUpsell } from './ai-subscription-upsell'

describe('AiSubscriptionUpsell', () => {
  it('toont "betaalde functie" + CTA naar /mijn/account (panel)', () => {
    render(<AiSubscriptionUpsell />)
    expect(screen.getByText(/betaalde functie/i)).toBeInTheDocument()
    const cta = screen.getByTestId('ai-upsell-cta')
    expect(cta).toHaveAttribute('href', '/mijn/account')
    // Prijs komt uit de catalogus (€9) — geen los hardcoded getal.
    expect(screen.getByText(/€\s?9\/mnd/i)).toBeInTheDocument()
  })

  it('inline-variant toont dezelfde CTA naar /mijn/account', () => {
    render(<AiSubscriptionUpsell variant="inline" />)
    const cta = screen.getByRole('link', { name: /Bekijk AI-abonnement/i })
    expect(cta).toHaveAttribute('href', '/mijn/account')
  })

  it('roept onNavigate aan bij klik op de CTA', () => {
    const onNavigate = vi.fn()
    render(<AiSubscriptionUpsell onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('ai-upsell-cta'))
    expect(onNavigate).toHaveBeenCalled()
  })
})
