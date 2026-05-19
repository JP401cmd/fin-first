import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HefbomenNav, HefbomenLegenda } from './hefbomen-nav'
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

  it('status-substext "Diversificatie ok" bij bezittingen good', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // diversification = 80 → 'good' → "Diversificatie ok"
    expect(screen.getByText('Diversificatie ok')).toBeTruthy()
  })

  it('status-substext "Schuldratio" tekst bij schulden warn', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // debt_ratio = 60 → 'warn' → "Schuldratio 20%"
    expect(screen.getByText(/Schuldratio/)).toBeTruthy()
  })

  it('status-substext "Tekort op rekening" bij cashflow bad', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // savings_rate = 30 → 'bad' → "Tekort op rekening"
    expect(screen.getByText('Tekort op rekening')).toBeTruthy()
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
    // tax pillar score = 85 → 'good' → "Geen actie nodig"
    expect(screen.getByText('Geen actie nodig')).toBeTruthy()
  })

  it('rendert geen status-substext bij ontbrekende health (neutral)', () => {
    render(<HefbomenNav health={null} />)
    // Alle 4 tegels → status neutral → geen substext
    expect(screen.queryByText('Diversificatie ok')).toBeNull()
    expect(screen.queryByText('Aflossing op schema')).toBeNull()
    expect(screen.queryByText('Op koers met sparen')).toBeNull()
    expect(screen.queryByText('Geen actie nodig')).toBeNull()
  })

  it('nav heeft aria-label', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Vier hefbomen')
  })
})

describe('HefbomenLegenda', () => {
  it('rendert drie status-labels', () => {
    render(<HefbomenLegenda />)
    expect(screen.getByText('Op koers')).toBeTruthy()
    expect(screen.getByText('Aandacht nodig')).toBeTruthy()
    expect(screen.getByText('Actie vereist')).toBeTruthy()
  })

  it('elk label heeft een gekleurde dot', () => {
    const { container } = render(<HefbomenLegenda />)
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy()
    expect(container.querySelector('.bg-amber-500')).toBeTruthy()
    expect(container.querySelector('.bg-red-500')).toBeTruthy()
  })
})
