import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HealthScore } from '@/lib/financial-health'
import { OverzichtHeroPrimary } from './overzicht-hero'
import { OverzichtSecondaryFallback } from './overzicht-secondary'

/**
 * Task 2.4 — Suspense-streaming van /overzicht.
 *
 * Kern-eis: het EERSTE blok (begroeting + vier-hefbomen-kompas,
 * `OverzichtHeroPrimary`) rendert VOLLEDIG zónder enige `loadDashboardData`-
 * afgeleide data — dat is precies wat er in productie gebeurt terwijl blok 2
 * (dashboard/will/briefing/snapshot) nog laadt en de `<Suspense>`-fallback
 * getoond wordt. Deze tests bewijzen die scheiding op componentniveau: blok 1
 * krijgt ALLEEN blok-1-props, blok 2 komt als (skeleton-)fallback binnen.
 */

function mockHealth(): HealthScore {
  return {
    total: 70,
    label: 'Sterk',
    pillars: [
      {
        id: 'savings_rate',
        name: 'Spaarquote',
        score: 55,
        weight: 0.25,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '20%',
      },
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 1,
    budgetingActive: true,
  }
}

describe('OverzichtHeroPrimary — blok 1 rendert zónder loadDashboardData', () => {
  it('toont begroeting + vier-hefbomen-kompas uit uitsluitend blok-1-props', () => {
    const { container } = render(
      <OverzichtHeroPrimary
        userName="Jan"
        greeting="Goedemorgen"
        dateLabel="Donderdag 16 juli 2026"
        health={mockHealth()}
        leverScores={null}
        totals={{ bezittingen: 100000, schulden: 20000, cashflow: 25, belasting: 500 }}
        housingSplit={null}
        // Blok 2 wordt in productie een <Suspense>; hier een marker die de
        // slot-doorgifte bewijst zonder dat er dashboard-data nodig is.
        secondary={<div data-testid="secondary-slot">STREAMED-BLOK-2</div>}
      />,
    )

    // Begroeting + datumlabel (blok-1, server-side berekend, als prop binnen).
    expect(screen.getByText('Donderdag 16 juli 2026')).toBeTruthy()
    expect(container.textContent).toContain('Goedemorgen')
    expect(container.textContent).toContain('Jan')

    // Vier-hefbomen-kompas — de "hoe sta je ervoor"-oogopslag, uit leverScores/
    // horizonData. Aanwezig ZONDER enige dashboardData-prop.
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Cashflow')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()

    // De secondary-slot wordt doorgegeven (in productie het gestreamde blok 2).
    expect(screen.getByTestId('secondary-slot')).toBeTruthy()
  })

  it('rendert blok 1 met de skeleton-fallback als tweede blok (briefing/widgets nog niet geladen)', () => {
    const { container } = render(
      <OverzichtHeroPrimary
        userName="Jan"
        greeting="Goedemorgen"
        dateLabel="Donderdag 16 juli 2026"
        health={mockHealth()}
        leverScores={null}
        totals={{ bezittingen: 100000, schulden: 20000, cashflow: 25, belasting: 500 }}
        housingSplit={null}
        secondary={<OverzichtSecondaryFallback />}
      />,
    )

    // Hefbomen aanwezig (blok 1), terwijl blok 2 nog de skeleton toont.
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()

    // Fallback = stabiele-hoogte skeleton (aria-hidden + animate-pulse), géén
    // echte briefing/widget-inhoud. Reserveert hoogte zodat CLS ~0 blijft.
    const skeleton = container.querySelector('[aria-hidden="true"].animate-pulse')
    expect(skeleton).toBeTruthy()
    // De echte briefing-tekst is nog niet geladen — puur placeholder.
    expect(container.textContent).not.toContain('Bijgewerkt')
  })
})

describe('OverzichtSecondaryFallback — CLS-stabiele skeleton', () => {
  it('is aria-hidden en reserveert meerdere blokhoogtes', () => {
    const { container } = render(<OverzichtSecondaryFallback />)
    const root = container.querySelector('[aria-hidden="true"]')
    expect(root).toBeTruthy()
    // Reserveert de hero-row (health + grafiek), rail en briefing → meerdere
    // vaste-hoogte placeholders (h-48 / h-32 / h-64) zodat de instroom van het
    // echte blok niets verschuift.
    const placeholders = container.querySelectorAll('div[class*="rounded-2xl"]')
    expect(placeholders.length).toBeGreaterThanOrEqual(4)
  })
})
