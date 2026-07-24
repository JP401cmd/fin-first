import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HealthScore } from '@/lib/financial-health'
import { OverzichtHeroPrimary } from './overzicht-hero'
import {
  OverzichtSecondaryFallback,
  MiniNetWorthChartFallback,
} from './overzicht-secondary'

/**
 * Task 2.4 + perf-kaart "gezondheid & netto vermogen los laden van widgets" —
 * Suspense-streaming van /overzicht.
 *
 * Kern-eis: het EERSTE blok (begroeting + vier-hefbomen-kompas + de
 * Health-Score-card, `OverzichtHeroPrimary`) rendert VOLLEDIG zónder enige
 * `loadDashboardData`-afgeleide data — het hangt alléén van de lichte
 * blok-1-`health` (horizonData) af. De vermogensgrafiek (kernel-sim) stroomt in
 * een eigen `heroChart`-cel en de widget-rail/briefing in het `secondary`-blok;
 * beide komen als (skeleton-)fallback binnen terwijl `loadDashboardData` nog
 * loopt. Deze tests bewijzen die scheiding op componentniveau: de Health-card
 * hoort bij blok 1 en verschijnt dus zónder dashboarddata.
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
  it('toont begroeting + vier-hefbomen-kompas + Health-card uit uitsluitend blok-1-props', () => {
    const { container } = render(
      <OverzichtHeroPrimary
        userName="Jan"
        greeting="Goedemorgen"
        dateLabel="Donderdag 16 juli 2026"
        health={mockHealth()}
        leverScores={null}
        totals={{ bezittingen: 100000, schulden: 20000, cashflow: 25, belasting: 500 }}
        housingSplit={null}
        // De vermogensgrafiek (kernel-sim) stroomt in de rechter hero-cel; hier
        // een marker die de slot-doorgifte bewijst zonder dashboarddata.
        heroChart={<div data-testid="chart-slot">STREAMED-CHART</div>}
        // De widget-rail/briefing stromen in het secondary-blok; marker idem.
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

    // De Health-Score-card hoort nu bij blok 1 (los van de widget-databundel):
    // hij paint direct uit de blok-1-`health`, dus vóór de gestreamde blokken.
    expect(screen.getByText('Financiële gezondheid')).toBeTruthy()

    // Beide streaming-slots worden doorgegeven (grafiek + widget-rail/briefing).
    expect(screen.getByTestId('chart-slot')).toBeTruthy()
    expect(screen.getByTestId('secondary-slot')).toBeTruthy()
  })

  it('rendert blok 1 (incl. Health-card) met skeleton-fallbacks voor grafiek + briefing/widgets', () => {
    const { container } = render(
      <OverzichtHeroPrimary
        userName="Jan"
        greeting="Goedemorgen"
        dateLabel="Donderdag 16 juli 2026"
        health={mockHealth()}
        leverScores={null}
        totals={{ bezittingen: 100000, schulden: 20000, cashflow: 25, belasting: 500 }}
        housingSplit={null}
        heroChart={<MiniNetWorthChartFallback />}
        secondary={<OverzichtSecondaryFallback />}
      />,
    )

    // Hefbomen + Health-card aanwezig (blok 1), terwijl de grafiek + het
    // secondary-blok nog de skeleton tonen.
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()
    expect(screen.getByText('Financiële gezondheid')).toBeTruthy()

    // Fallbacks = stabiele-hoogte skeletons (aria-hidden + animate-pulse), géén
    // echte briefing/widget-inhoud. Reserveert hoogte zodat CLS ~0 blijft.
    const skeleton = container.querySelector('[aria-hidden="true"].animate-pulse')
    expect(skeleton).toBeTruthy()
    // De echte briefing-tekst is nog niet geladen — puur placeholder.
    expect(container.textContent).not.toContain('Bijgewerkt')
  })
})

describe('Streaming-skeletons — CLS-stabiel', () => {
  it('OverzichtSecondaryFallback reserveert rail + briefing (geen hero-row meer)', () => {
    const { container } = render(<OverzichtSecondaryFallback />)
    const root = container.querySelector('[aria-hidden="true"]')
    expect(root).toBeTruthy()
    // Rail (2×) + briefing (1×) → 3 vaste-hoogte placeholders. De hero-row
    // (health + grafiek) zit hier NIET meer in: die leeft in blok 1 resp. de
    // eigen grafiek-fallback.
    const placeholders = container.querySelectorAll('div[class*="rounded-2xl"]')
    expect(placeholders.length).toBeGreaterThanOrEqual(3)
  })

  it('MiniNetWorthChartFallback is een aria-hidden vaste-hoogte skeleton', () => {
    const { container } = render(<MiniNetWorthChartFallback />)
    const root = container.querySelector('[aria-hidden="true"].animate-pulse')
    expect(root).toBeTruthy()
    expect(root?.className).toContain('rounded-2xl')
  })
})
