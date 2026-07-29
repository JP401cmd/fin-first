import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniNetWorthChartAnchor } from './mini-networth-chart-anchor'

/**
 * Optie B (twee-traps-render, kaart "Weergave grafiek op het overzicht"):
 * het anker paint DIRECT in blok 1 met het echte netto vermogen als
 * `<Suspense>`-fallback, zodat de gebruiker meteen zijn vermogensgetal +
 * Vandaag-startpunt ziet i.p.v. een kale skeleton.
 */
describe('MiniNetWorthChartAnchor — trap 1 (directe paint)', () => {
  it('toont het echte netto vermogen + Vandaag-anker zonder projectie-data', () => {
    const { container } = render(<MiniNetWorthChartAnchor currentNetWorth={123456} />)
    // Kopgetal = perspectief-correct netto vermogen (nl-NL €-notatie).
    expect(container.textContent).toContain('Netto vermogen door de tijd')
    expect(screen.getByText(/123\.456/)).toBeTruthy()
    expect(screen.getByText('Vandaag')).toBeTruthy()
    // Signaleert dat de projectie nog binnenstroomt (trap 2).
    expect(screen.getByText('Projectie laden…')).toBeTruthy()
    // Fin loopt het projectie-traject af terwijl de kernel rekent.
    expect(container.querySelector('[aria-label="Fin avatar"]')).toBeTruthy()
  })

  it('toont de excl.-eigen-woning-subregel alleen bij showExclHome', () => {
    const { rerender, container } = render(
      <MiniNetWorthChartAnchor currentNetWorth={200000} netWorthExclHome={80000} showExclHome={false} />,
    )
    expect(container.textContent).not.toContain('excl. eigen woning')
    rerender(
      <MiniNetWorthChartAnchor currentNetWorth={200000} netWorthExclHome={80000} showExclHome />,
    )
    expect(container.textContent).toContain('excl. eigen woning')
  })
})
