import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HefbomenNav } from './hefbomen-nav'
import type { HealthScore } from '@/lib/financial-health'

/**
 * Tests voor HefbomenNav — 4-tegel-rij op /overzicht hero met
 * status-dots uit health.pillars en tooltip per tegel.
 */

function mockHealth(overrides: Partial<HealthScore> = {}): HealthScore {
  return {
    total: 70,
    label: 'Sterk',
    pillars: [
      {
        id: 'diversification',
        name: 'Diversificatie',
        score: 80,
        weight: 0.1,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '3 types',
      },
      {
        id: 'debt_ratio',
        name: 'Schuldratio',
        score: 60,
        weight: 0.2,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '20%',
      },
      {
        id: 'savings_rate',
        name: 'Spaarquote',
        score: 30,
        weight: 0.25,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '5%',
      },
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 3,
    budgetingActive: true,
    ...overrides,
  }
}

describe('HefbomenNav', () => {
  it('rendert 4 hefbomen-tegels', () => {
    render(<HefbomenNav health={mockHealth()} />)
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Cashflow')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()
  })

  it('elke tegel is een Link met juiste href', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(4)
    expect(links[0]?.getAttribute('href')).toBe('/overzicht/bezittingen')
    expect(links[1]?.getAttribute('href')).toBe('/overzicht/schulden')
    expect(links[2]?.getAttribute('href')).toBe('/overzicht/cashflow')
    expect(links[3]?.getAttribute('href')).toBe('/overzicht/belasting')
  })

  it('elke tegel toont tooltip via title-attribuut', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const links = container.querySelectorAll('a')
    links.forEach((link) => {
      expect(link.getAttribute('title')).toBeTruthy()
    })
  })

  it('status-overline toont "Goed op koers" bij score >=70', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // diversification = 80 → bezittingen heeft "Goed op koers"
    expect(screen.getAllByText('Goed op koers').length).toBeGreaterThanOrEqual(1)
  })

  it('status-overline toont "Aandacht" bij score 50-70', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // debt_ratio = 60 → schulden heeft "Aandacht"
    expect(screen.getAllByText('Aandacht').length).toBeGreaterThanOrEqual(1)
  })

  it('status-overline toont "Risico" bij score <50', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // savings_rate = 30 → cashflow heeft "Risico"
    expect(screen.getAllByText('Risico').length).toBeGreaterThanOrEqual(1)
  })

  it('belasting-tegel toont status uit tax_optimization pillar wanneer aanwezig', () => {
    const healthWithTax = mockHealth({
      pillars: [
        ...mockHealth().pillars,
        {
          id: 'tax_optimization',
          name: 'Belasting',
          score: 85,
          weight: 0.1,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/belasting',
          actionLabel: 'X',
          rawValue: '€100/jaar',
        },
      ],
    })
    render(<HefbomenNav health={healthWithTax} />)
    // tax pillar score = 85 → 'good' → "Goed op koers" voor belasting
    expect(screen.getAllByText('Goed op koers').length).toBeGreaterThanOrEqual(2)
  })

  it('rendert "Geen meting" bij ontbrekende health', () => {
    render(<HefbomenNav health={null} />)
    // Alle 4 tegels → status neutral → "Geen meting"
    expect(screen.getAllByText('Geen meting').length).toBe(4)
  })

  it('nav heeft aria-label', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Vier hefbomen')
  })
})
