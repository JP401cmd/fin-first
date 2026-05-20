import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BezittingenOverzichtStrip } from './bezittingen-overzicht-strip'

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

  it('rendert vier categorie-tegels', () => {
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
    expect(screen.getByText('Pensioen')).toBeTruthy()
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

  it('toont percentage per categorie', () => {
    const { container } = render(
      <BezittingenOverzichtStrip
        cashTotal={100_000}
        investmentTotal={0}
        housingTotal={0}
        pensioenTotal={0}
      />,
    )
    // Cash 100% van 100k
    expect(container.textContent).toMatch(/100% van totaal/i)
  })

  it('toont "—" placeholder bij categorie met 0 waarde', () => {
    render(
      <BezittingenOverzichtStrip
        cashTotal={50_000}
        investmentTotal={0}
        housingTotal={0}
        pensioenTotal={0}
      />,
    )
    // Drie categorieën met 0 → drie placeholders
    expect(screen.getAllByText('—').length).toBe(3)
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

  it('toont beschrijving per categorie', () => {
    render(
      <BezittingenOverzichtStrip
        cashTotal={1000}
        investmentTotal={1000}
        housingTotal={1000}
        pensioenTotal={1000}
      />,
    )
    expect(screen.getByText(/Liquide buffer/i)).toBeTruthy()
    expect(screen.getByText(/Aandelen, ETFs, crypto/i)).toBeTruthy()
    expect(screen.getByText(/Woning-waarde minus hypotheekschuld/i)).toBeTruthy()
    expect(screen.getByText(/AOW \+ werkgevers-pensioen/i)).toBeTruthy()
  })
})
