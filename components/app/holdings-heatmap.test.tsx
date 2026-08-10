import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HoldingsHeatmap, { type HeatmapHolding } from './holdings-heatmap'

/**
 * Regressie bij testbug-862824 (/core/assets/investment).
 *
 * De treemap schaalde posities met `Math.max(waarde, 1)`: een gesloten positie
 * van €0 kreeg daardoor alsnog een zichtbaar vlak, terwijl de melder terecht
 * "grootte op basis van waarde" verwachtte. Deze suite pint dat vast: geen
 * waarde → geen tegel, en een selectie zonder enige waarde krijgt een uitleg
 * i.p.v. een leeg vlak.
 */

function holding(overrides: Partial<HeatmapHolding> & { id: string }): HeatmapHolding {
  return {
    name: `Holding ${overrides.id}`,
    ticker: overrides.id.toUpperCase(),
    isin: null,
    units: 10,
    avg_purchase_price: 100,
    current_price: 120,
    last_price_update: new Date().toISOString(),
    asset_class: 'aandeel',
    ...overrides,
  }
}

function renderedCellIds(): string[] {
  return screen
    .getAllByTestId('heatmap-cell')
    .map((el) => el.getAttribute('data-holding-id') ?? '')
}

describe('HoldingsHeatmap — oppervlak volgt waarde', () => {
  it('geeft posities zonder waarde geen tegel', () => {
    render(
      <HoldingsHeatmap
        holdings={[
          holding({ id: 'actief-a', units: 10, current_price: 120 }),
          holding({ id: 'actief-b', units: 4, current_price: 50 }),
          // Gesloten optiecontract: 0 stuks → geen marktwaarde → geen oppervlak.
          holding({ id: 'gesloten', units: 0, current_price: 0 }),
          // Verkocht maar met koers: 0 stuks weegt nog steeds niets.
          holding({ id: 'verkocht', units: 0, current_price: 340 }),
        ]}
      />,
    )

    const ids = renderedCellIds()
    expect(ids).toContain('actief-a')
    expect(ids).toContain('actief-b')
    expect(ids).not.toContain('gesloten')
    expect(ids).not.toContain('verkocht')
  })

  it('houdt een positie zonder koers wél in beeld (kostprijs als grondslag)', () => {
    render(
      <HoldingsHeatmap
        holdings={[
          holding({ id: 'met-koers', units: 10, current_price: 120 }),
          // Geen prijsfeed, maar wél bezit — moet zichtbaar blijven, gewogen op
          // de gemiddelde inkoopprijs (zelfde grondslag als de lijstweergave).
          holding({ id: 'zonder-koers', units: 5, current_price: null }),
        ]}
      />,
    )

    expect(renderedCellIds()).toEqual(
      expect.arrayContaining(['met-koers', 'zonder-koers']),
    )
  })

  it('legt uit waarom er niets te tekenen valt als niets waarde heeft', () => {
    render(
      <HoldingsHeatmap
        holdings={[
          holding({ id: 'gesloten-a', units: 0, current_price: 0 }),
          holding({ id: 'gesloten-b', units: 0, current_price: 12 }),
        ]}
      />,
    )

    expect(screen.getByTestId('heatmap-no-value')).toBeInTheDocument()
    expect(screen.queryAllByTestId('heatmap-cell')).toHaveLength(0)
  })
})
