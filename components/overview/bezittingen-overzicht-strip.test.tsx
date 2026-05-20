import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BezittingenOverzichtStrip } from './bezittingen-overzicht-strip'

/**
 * Tests voor BezittingenOverzichtStrip — sinds de refactor naar
 * `<CategoryCard>` (gedeeld met /core) toetsen we hier vooral de groep-
 * berekening, totaal-header en sub-route-links. Visuele primitives
 * (accent-streep, sparkline, hover-lift) horen in CategoryCard-tests thuis.
 */

describe('BezittingenOverzichtStrip — render', () => {
  it('rendert niets wanneer grandTotal = 0', () => {
    const { container } = render(
      <BezittingenOverzichtStrip
        cashTotal={0}
        investmentTotal={0}
        housingTotal={0}
        pensioenTotal={0}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rendert vier categorie-kaarten', () => {
    render(
      <BezittingenOverzichtStrip
        cashTotal={10_000}
        investmentTotal={50_000}
        housingTotal={200_000}
        pensioenTotal={30_000}
      />,
    )
    expect(screen.getByText('Cash + spaargeld')).toBeTruthy()
    expect(screen.getByText('Beleggen')).toBeTruthy()
    expect(screen.getByText('Eigen huis')).toBeTruthy()
    expect(screen.getByText('Pensioen + overig')).toBeTruthy()
  })

  it('toont totaal vermogen in header', () => {
    render(
      <BezittingenOverzichtStrip
        cashTotal={10_000}
        investmentTotal={50_000}
        housingTotal={200_000}
        pensioenTotal={30_000}
      />,
    )
    // 290k totaal
    expect(screen.getByText(/€\s*290\.000/)).toBeTruthy()
    expect(screen.getByText('Totaal vermogen')).toBeTruthy()
  })

  it('toont percentage per categorie in meta-regel', () => {
    const { container } = render(
      <BezittingenOverzichtStrip
        cashTotal={100_000}
        investmentTotal={0}
        housingTotal={0}
        pensioenTotal={0}
      />,
    )
    // Cash 100% van totaal staat in de meta-regel van de CategoryCard
    expect(container.textContent).toMatch(/100% van totaal/i)
  })

  it('toont fallback-tekst voor lege bezittingen-categorieën', () => {
    render(
      <BezittingenOverzichtStrip
        cashTotal={50_000}
        investmentTotal={0}
        housingTotal={0}
        pensioenTotal={0}
      />,
    )
    // Beleggen + Eigen huis: meta "Nog geen bezittingen" (2× verwacht).
    // Pensioen + overig: meta "Pensioen en overige bezittingen" (eigen
    // tekst zodat de gebruiker weet dat de tegel meer dan pensioen
    // omvat).
    expect(screen.getAllByText(/Nog geen bezittingen/i).length).toBe(2)
    expect(screen.getByText(/Pensioen en overige bezittingen/i)).toBeTruthy()
  })

  it('linkt naar sub-routes per categorie', () => {
    const { container } = render(
      <BezittingenOverzichtStrip
        cashTotal={1000}
        investmentTotal={1000}
        housingTotal={1000}
        pensioenTotal={1000}
      />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/overzicht/bezittingen/cash')
    expect(hrefs).toContain('/overzicht/bezittingen/investment')
    expect(hrefs).toContain('/overzicht/bezittingen/eigen_huis')
    expect(hrefs).toContain('/overzicht/bezittingen/retirement')
  })

  it('toont item-aantal in meta-regel wanneer counts beschikbaar zijn', () => {
    const { container } = render(
      <BezittingenOverzichtStrip
        cashTotal={50_000}
        investmentTotal={20_000}
        housingTotal={0}
        pensioenTotal={0}
        counts={{ cash: 3, investment: 1 }}
      />,
    )
    expect(container.textContent).toMatch(/3 items/i)
    expect(container.textContent).toMatch(/1 item(?!s)/i)
  })
})
