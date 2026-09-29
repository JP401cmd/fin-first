/**
 * /mijn/account per product (Krant 2B + 2D fase 1).
 *
 *  - Een Krant-account ziet de kaart "Meer TriFinity" (link naar /krant/meer)
 *    en géén abonnementen-/AI-blok (dat verborg 2B al; hier nogmaals geborgd).
 *  - Een Geheel-account ziet de kaart niet, en de abonnementen wél.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const nav = vi.hoisted(() => ({ isKrant: false }))
vi.mock('@/lib/hooks/use-nav-surface', () => ({
  useNavSurface: () => nav,
}))
// De secties zelf zijn hier niet het onderwerp — alleen of ze verschijnen.
vi.mock('./abonnement-section', () => ({ AbonnementSection: () => <div data-testid="abonnement" /> }))
vi.mock('./ai-credits-section', () => ({ AiCreditsSection: () => <div data-testid="ai-tegoed" /> }))
vi.mock('./account-basis-section', () => ({ AccountBasisSection: () => <div data-testid="basis" /> }))
vi.mock('./danger-zone', () => ({ DangerZone: () => <div data-testid="danger" /> }))

import { AccountClient } from './account-client'

afterEach(() => cleanup())

describe('AccountClient — de kaart "Meer TriFinity"', () => {
  it('een Krant-account ziet de kaart met een link naar /krant/meer, zonder abonnementen of AI-tegoed', () => {
    nav.isKrant = true
    render(<AccountClient email="lezer@voorbeeld.nl" activeSubscriptions={[]} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Meer TriFinity' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bekijk wat het volledige TriFinity laat zien/ })).toHaveAttribute(
      'href',
      '/krant/meer',
    )
    expect(screen.queryByTestId('abonnement')).toBeNull()
    expect(screen.queryByTestId('ai-tegoed')).toBeNull()
    expect(screen.getByTestId('basis')).toBeInTheDocument()
  })

  it('een Geheel-account ziet de kaart niet, en de abonnementen wel', () => {
    nav.isKrant = false
    render(<AccountClient email="lezer@voorbeeld.nl" activeSubscriptions={[]} />)

    expect(screen.queryByRole('heading', { name: 'Meer TriFinity' })).toBeNull()
    expect(screen.queryByRole('link', { name: /volledige TriFinity/ })).toBeNull()
    expect(screen.getByTestId('abonnement')).toBeInTheDocument()
    expect(screen.getByTestId('ai-tegoed')).toBeInTheDocument()
  })
})
